import { describe, it, expect, vi } from 'vitest'
import {
  prepSettledDayInputs,
  computeSettledDayPerformance,
  type HourlyCurrentRow,
} from '@/lib/settled-day-performance'

const h = (string_number: number, hour: number, avg_current: number): HourlyCurrentRow =>
  ({ string_number, hour: new Date(Date.UTC(2026, 5, 8, hour)), avg_current })

describe('prepSettledDayInputs', () => {
  it('builds repr_current (median over sun-up hours) and availability per string', () => {
    const rows: HourlyCurrentRow[] = [
      h(1, 10, 6), h(2, 10, 6), h(3, 10, 6), h(4, 10, 3),
      h(1, 11, 6), h(2, 11, 6), h(3, 11, 6), h(4, 11, 3),
      h(1, 12, 6), h(2, 12, 6), h(3, 12, 6), h(4, 12, 0), // string 4 dark this hour
    ]
    const { perfInputs, sunUpHours, availability } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(sunUpHours).toBe(3)
    expect(perfInputs.find(p => p.string_number === 1)!.repr_current).toBe(6)
    expect(perfInputs.find(p => p.string_number === 4)!.repr_current).toBe(3) // median(3,3,0)=3
    expect(availability.get(4)).toEqual({ producingHours: 2, sunUpHours: 3 })
    expect(availability.get(1)).toEqual({ producingHours: 3, sunUpHours: 3 })
  })
  it('too few sun-up hours → not scoreable → repr_current null', () => {
    const rows = [h(1, 10, 6), h(2, 10, 6)] // 1 sun-up hour < MIN(2)
    const { perfInputs, sunUpHours } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(sunUpHours).toBe(1)
    expect(perfInputs.every(p => p.repr_current === null)).toBe(true)
  })
  it('drops unused strings; tags peer-excluded', () => {
    const rows = [h(1, 10, 6), h(2, 10, 6), h(3, 10, 6), h(1, 11, 6), h(2, 11, 6), h(3, 11, 6)]
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
    // Two equal strings, each ≥ MIN_SUNUP_HOURS_FOR_DAILY_SCORE (2) sun-up hours
    // of comparable current → both score, both get UPDATEd.
    const hourly = [
      { string_number: 1, hour: new Date(Date.UTC(2026, 5, 8, 6)), avg_current: 6 },
      { string_number: 2, hour: new Date(Date.UTC(2026, 5, 8, 6)), avg_current: 6 },
      { string_number: 1, hour: new Date(Date.UTC(2026, 5, 8, 7)), avg_current: 6 },
      { string_number: 2, hour: new Date(Date.UTC(2026, 5, 8, 7)), avg_current: 6 },
    ]
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

  it('queries the right device/day window, matches the UTC-midnight PKT date, and returns the summed count', async () => {
    const { prisma, updateMany } = fakePrisma()
    const count = await computeSettledDayPerformance(prisma, { id: 'dev-1' }, PKT_DATE)

    // (a) right device + [start, start+24h) PKT window
    const hourlyArgs = prisma.string_hourly.findMany.mock.calls[0][0]
    expect(hourlyArgs.where.device_id).toBe('dev-1')
    expect((hourlyArgs.where.hour.gte as Date).toISOString()).toBe(new Date('2026-06-08T00:00:00+05:00').toISOString())
    expect((hourlyArgs.where.hour.lt as Date).toISOString()).toBe(new Date('2026-06-09T00:00:00+05:00').toISOString())

    // (b) updateMany matches where.date === UTC-midnight of the PKT calendar date
    // (exactly what getPKTDateForDB() produces — the poller's string_daily.date).
    expect(updateMany).toHaveBeenCalled()
    for (const [args] of updateMany.mock.calls) {
      expect(args.where.device_id).toBe('dev-1')
      expect((args.where.date as Date).getTime()).toBe(new Date('2026-06-08T00:00:00Z').getTime())
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
