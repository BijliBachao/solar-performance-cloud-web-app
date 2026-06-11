import { describe, it, expect, vi } from 'vitest'
import {
  prepSettledDayInputs,
  computeSettledDayPerformance,
  type HourlyMedianRow,
} from '@/lib/settled-day-performance'

// V1 (2026-06-11): rows are now string_hourly { median_current, reading_count } shaped,
// scoring is gated to the fixed 8AM–4PM PKT window and a 60% completeness gate. These
// cases were migrated from the old avg_current / sun-up-gate / MIN_SUNUP_HOURS shape.
// Hours are UTC instants; PKT = UTC+5, so a PKT hour h is at UTC (h-5).
const h = (string_number: number, pktHour: number, median_current: number, reading_count: number | null = 12): HourlyMedianRow =>
  ({ string_number, hour: new Date(Date.UTC(2026, 5, 8, pktHour - 5)), median_current, reading_count })

// A full 8-hour window (8..15 PKT) for a string at a constant median current.
const fullWindow = (string_number: number, m: number): HourlyMedianRow[] =>
  [8, 9, 10, 11, 12, 13, 14, 15].map(p => h(string_number, p, m))

describe('prepSettledDayInputs (V1)', () => {
  it('builds repr_current (median-of-medians) + availability + completeness per string', () => {
    const rows: HourlyMedianRow[] = [
      ...fullWindow(1, 6),
      ...fullWindow(2, 6),
      ...fullWindow(3, 6),
      // string 4: producing 6A for 7 hours, dark (0A) the last hour
      ...[8, 9, 10, 11, 12, 13, 14].map(p => h(4, p, 6)),
      h(4, 15, 0),
    ]
    const { perfInputs, availability, completeness } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(perfInputs.find(p => p.string_number === 1)!.repr_current).toBe(6)
    expect(perfInputs.find(p => p.string_number === 4)!.repr_current).toBe(6) // median(6×7, 0) = 6
    expect(availability.get(4)).toEqual({ producingHours: 7, sunUpHours: 8 })
    expect(availability.get(1)).toEqual({ producingHours: 8, sunUpHours: 8 })
    expect(completeness.get(1)).toBe(100) // 96/96
  })

  it('too few readings (<60%) → not scoreable → repr_current null + insufficient_data', () => {
    const rows = [h(1, 8, 6), h(2, 8, 6)] // 12/96 = 12.5%
    const { perfInputs } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(perfInputs.every(p => p.repr_current === null && p.insufficient_data === true)).toBe(true)
  })

  it('drops unused strings; tags peer-excluded', () => {
    const rows = [...fullWindow(1, 6), ...fullWindow(2, 6), ...fullWindow(3, 6)]
    const { perfInputs } = prepSettledDayInputs(rows, { unused: new Set([3]), peerExcluded: new Set([2]) })
    expect(perfInputs.find(p => p.string_number === 3)).toBeUndefined()
    expect(perfInputs.find(p => p.string_number === 2)!.exclude_from_peer_comparison).toBe(true)
  })
})

// ─── computeSettledDayPerformance — I/O wrapper date contract (locks C-1) ──
// The wrapper UPDATEs string_daily rows the poller wrote. The match is on
// `date` — a Postgres DATE column. It MUST equal what the poller wrote via
// getPKTDateForDB(): UTC-midnight of the PKT calendar date, i.e.
// new Date('<pktDate>T00:00:00Z'). A mismatched Date object silently matches
// 0 rows (the verdict would never land). This test pins that exact value so
// C-1 — today's live value being re-finalized by the settled job — cannot
// silently regress.
describe('computeSettledDayPerformance — date contract + I/O', () => {
  const PKT_DATE = '2026-06-08'

  function fakePrisma() {
    // Two equal strings, each with a full 8AM–4PM PKT window of 12-reading hours
    // → both pass the completeness gate, both score, both get UPDATEd.
    // PKT hour p is at UTC (p-5); full window 8..15 PKT.
    const hourly = [1, 2].flatMap(sn =>
      [8, 9, 10, 11, 12, 13, 14, 15].map(p => ({
        string_number: sn,
        hour: new Date(Date.UTC(2026, 5, 8, p - 5)),
        median_current: 6,
        reading_count: 12,
      })),
    )
    const updateMany = vi.fn(async () => ({ count: 1 }))
    return {
      prisma: {
        string_hourly: { findMany: vi.fn(async () => hourly) },
        string_configs: { findMany: vi.fn(async () => []) },
        string_daily: { updateMany },
      } as any,
      updateMany,
    }
  }

  it('queries the right device/day window, matches the UTC-midnight PKT date, writes display+raw+completeness, returns the summed count', async () => {
    const { prisma, updateMany } = fakePrisma()
    const count = await computeSettledDayPerformance(prisma, { id: 'dev-1' }, PKT_DATE)

    // (a) right device + [start, start+24h) PKT window + median/reading_count select
    const hourlyArgs = prisma.string_hourly.findMany.mock.calls[0][0]
    expect(hourlyArgs.where.device_id).toBe('dev-1')
    expect((hourlyArgs.where.hour.gte as Date).toISOString()).toBe(new Date('2026-06-08T00:00:00+05:00').toISOString())
    expect((hourlyArgs.where.hour.lt as Date).toISOString()).toBe(new Date('2026-06-09T00:00:00+05:00').toISOString())
    expect(hourlyArgs.select.median_current).toBe(true)
    expect(hourlyArgs.select.reading_count).toBe(true)

    // (b) updateMany matches where.date === UTC-midnight of the PKT calendar date
    // (exactly what getPKTDateForDB() produces — the poller's string_daily.date),
    // and the data payload carries the V1 columns.
    expect(updateMany).toHaveBeenCalled()
    for (const [args] of updateMany.mock.calls) {
      expect(args.where.device_id).toBe('dev-1')
      expect((args.where.date as Date).getTime()).toBe(new Date('2026-06-08T00:00:00Z').getTime())
      expect(Number(args.data.performance)).toBe(100) // two equal strings → 100% display
      expect(Number(args.data.health_score)).toBe(100)
      expect(Number(args.data.raw_performance)).toBe(100)
      expect(Number(args.data.data_completeness)).toBe(100) // 96/96
    }

    // (c) returns the summed updated count (two scored strings × {count:1})
    expect(count).toBe(2)
  })

  it('returns 0 (no work) when string_hourly has no rows for the day', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const prisma = {
      string_hourly: { findMany: vi.fn(async () => []) },
      string_configs: { findMany: vi.fn(async () => []) },
      string_daily: { updateMany },
    } as any
    const count = await computeSettledDayPerformance(prisma, { id: 'dev-1' }, PKT_DATE)
    expect(count).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
