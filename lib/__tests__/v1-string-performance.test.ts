import { describe, it, expect } from 'vitest'
import { scoreStringPerformance, type PerfStringInput } from '@/lib/string-performance'
import {
  prepSettledDayInputs,
  buildPerfInputsFromHourly,
  type HourlyMedianRow,
} from '@/lib/settled-day-performance'

// ─── Task 4: scoreStringPerformance — raw (uncapped) + display (cap 100) + band ──
const inp = (
  string_number: number,
  repr_current: number | null,
  over: Partial<PerfStringInput> = {},
): PerfStringInput => ({
  string_number,
  is_used: true,
  exclude_from_peer_comparison: false,
  repr_current,
  insufficient_data: false,
  ...over,
})

describe('scoreStringPerformance (V1 — raw + display + band)', () => {
  it('returns raw (uncapped) and display (capped 100) + band', () => {
    // peer median = median(4,4,4) = 4; a 12 A string → raw 300, display 100
    const r = scoreStringPerformance([inp(1, 4), inp(2, 4), inp(3, 4), inp(9, 12)])
    const s9 = r.find(x => x.string_number === 9)!
    expect(s9.raw_performance).toBe(300)
    expect(s9.performance).toBe(100) // display capped
    expect(s9.band).toBe('normal')
    const s1 = r.find(x => x.string_number === 1)!
    expect(s1.performance).toBe(100) // 4/4 = 100
    expect(s1.raw_performance).toBe(100)
    expect(s1.band).toBe('normal')
  })

  it('insufficient_data string scores null + band insufficient_data, and is excluded from the peer pool', () => {
    const r = scoreStringPerformance([
      inp(1, 5),
      inp(2, 5),
      inp(3, null, { insufficient_data: true }),
    ])
    const s3 = r.find(x => x.string_number === 3)!
    expect(s3.band).toBe('insufficient_data')
    expect(s3.performance).toBeNull()
    expect(s3.raw_performance).toBeNull()
    // peer pool was only strings 1 & 2 → both 100%
    expect(r.find(x => x.string_number === 1)!.performance).toBe(100)
    expect(r.find(x => x.string_number === 1)!.peer_median_current).toBe(5)
  })

  it('bands a weak string by its DISPLAY value through the central classifier', () => {
    // peers at 10, weak at 7 → 70% → underperforming
    const r = scoreStringPerformance([inp(1, 10), inp(2, 10), inp(3, 10), inp(4, 7)])
    const weak = r.find(x => x.string_number === 4)!
    expect(weak.performance).toBe(70)
    expect(weak.raw_performance).toBe(70)
    expect(weak.band).toBe('underperforming')
  })

  it('peer-excluded → band peer_excluded, null score, not in pool', () => {
    const r = scoreStringPerformance([
      inp(1, 5), inp(2, 5), inp(3, 5),
      inp(4, 1, { exclude_from_peer_comparison: true }),
    ])
    expect(r.find(x => x.string_number === 4)!.band).toBe('peer_excluded')
    expect(r.find(x => x.string_number === 4)!.performance).toBeNull()
    expect(r.find(x => x.string_number === 1)!.performance).toBe(100)
  })

  it('unused → band unused, null score', () => {
    const r = scoreStringPerformance([
      inp(1, 5), inp(2, 5),
      inp(3, null, { is_used: false }),
    ])
    expect(r.find(x => x.string_number === 3)!.band).toBe('unused')
    expect(r.find(x => x.string_number === 3)!.performance).toBeNull()
  })

  it('no usable peer pool (single string) → insufficient_data band, null score', () => {
    const r = scoreStringPerformance([inp(1, 5)])
    expect(r[0].band).toBe('insufficient_data')
    expect(r[0].performance).toBeNull()
  })
})

// ─── Task 5: prepSettledDayInputs — 8AM–4PM PKT window, median-of-medians, completeness ──
// helper builds string_hourly-like rows for a PKT date; hours are UTC instants.
function hr(pktHour: number): Date {
  return new Date(Date.UTC(2026, 5, 15, pktHour - 5, 0, 0)) // PKT→UTC (UTC = PKT - 5h)
}

describe('prepSettledDayInputs (V1 window + median + completeness)', () => {
  it('only counts hours inside 8AM–4PM PKT and uses median_current', () => {
    const rows: HourlyMedianRow[] = [
      ...[8, 9, 10, 11, 12, 13, 14, 15].map(h => ({
        string_number: 1, hour: hr(h), median_current: 5, reading_count: 12,
      })),
      // 7AM PKT (outside) must be ignored:
      { string_number: 1, hour: hr(7), median_current: 99, reading_count: 12 },
    ]
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    const s1 = out.perfInputs.find(p => p.string_number === 1)!
    expect(s1.repr_current).toBe(5) // median of eight 5s, 7AM ignored
    expect(s1.insufficient_data).toBe(false) // 96/96 readings
    expect(out.completeness.get(1)).toBe(100)
  })

  it('4PM PKT (16:00) is OUTSIDE the window (end-exclusive)', () => {
    const rows: HourlyMedianRow[] = [
      ...[8, 9, 10, 11, 12].map(h => ({
        string_number: 1, hour: hr(h), median_current: 5, reading_count: 12,
      })),
      { string_number: 1, hour: hr(16), median_current: 99, reading_count: 12 },
    ]
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    const s1 = out.perfInputs.find(p => p.string_number === 1)!
    expect(s1.repr_current).toBe(5) // 16:00 PKT dropped → median of five 5s
  })

  it('gates a thin day to insufficient_data (<60% readings)', () => {
    const rows: HourlyMedianRow[] = [8, 9].map(h => ({
      string_number: 1, hour: hr(h), median_current: 5, reading_count: 12,
    })) // 24/96 = 25%
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    expect(out.perfInputs.find(p => p.string_number === 1)!.insufficient_data).toBe(true)
    expect(out.perfInputs.find(p => p.string_number === 1)!.repr_current).toBeNull()
  })

  it('day at exactly the 60% gate is scoreable (gate is a floor, not a ceiling)', () => {
    // 58 readings of 96 = 60.4% ≥ gate → scoreable
    const rows: HourlyMedianRow[] = [8, 9, 10, 11, 12].map(h => ({
      string_number: 1, hour: hr(h), median_current: 5, reading_count: h === 8 ? 10 : 12,
    })) // 10 + 12*4 = 58
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    expect(out.perfInputs.find(p => p.string_number === 1)!.insufficient_data).toBe(false)
  })

  it('hours-based gate ignores reading_count: a FULL-window day with NULL counts is scored', () => {
    // The gate is hours-of-coverage now, so legacy rows with no reading_count score fine:
    // 8 of 8 window hours present → scored regardless of counts. (A SHORT NULL-count day
    // would gate on hours, exactly like a short real-count day — counts are irrelevant.)
    const rows: HourlyMedianRow[] = [8, 9, 10, 11, 12, 13, 14, 15].map(h => ({
      string_number: 1, hour: hr(h), median_current: 5, reading_count: null as unknown as number,
    }))
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    const s1 = out.perfInputs.find(p => p.string_number === 1)!
    expect(s1.insufficient_data).toBe(false) // 8 of 8 hours → scored
    expect(s1.repr_current).toBe(5)
  })

  it('a dead string reporting ~0A every reading is NOT gated (data present, production zero)', () => {
    const rows: HourlyMedianRow[] = [8, 9, 10, 11, 12, 13, 14, 15].map(h => ({
      string_number: 1, hour: hr(h), median_current: 0, reading_count: 12,
    }))
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    const s1 = out.perfInputs.find(p => p.string_number === 1)!
    expect(s1.insufficient_data).toBe(false) // 96/96 readings — fully complete
    expect(s1.repr_current).toBe(0)
  })

  it('median-of-medians: daily repr = median of the per-hour median_current values', () => {
    const meds = [4, 6, 8] // median = 6
    const rows: HourlyMedianRow[] = meds.map((m, i) => ({
      string_number: 1, hour: hr(8 + i), median_current: m, reading_count: 12,
    }))
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    // 36/96 = 37.5% < 60% → gated; verify gate AND that the helper computed the median when forced.
    expect(out.perfInputs.find(p => p.string_number === 1)!.insufficient_data).toBe(true)
    // raise completeness above the gate
    const rows2: HourlyMedianRow[] = [4, 6, 8, 5, 7].map((m, i) => ({
      string_number: 1, hour: hr(8 + i), median_current: m, reading_count: 12,
    })) // 60/96 = 62.5% ≥ gate, medians [4,5,6,7,8] → median 6
    const out2 = prepSettledDayInputs(rows2, { peerExcluded: new Set(), unused: new Set() })
    expect(out2.perfInputs.find(p => p.string_number === 1)!.repr_current).toBe(6)
  })

  it('drops unused strings; tags peer-excluded', () => {
    const rows: HourlyMedianRow[] = [1, 2, 3].flatMap(sn =>
      [8, 9, 10, 11, 12].map(h => ({ string_number: sn, hour: hr(h), median_current: 5, reading_count: 12 })),
    )
    const out = prepSettledDayInputs(rows, { unused: new Set([3]), peerExcluded: new Set([2]) })
    expect(out.perfInputs.find(p => p.string_number === 3)).toBeUndefined()
    expect(out.perfInputs.find(p => p.string_number === 2)!.exclude_from_peer_comparison).toBe(true)
  })

  it('availability map = producing window-hours / window-hours present', () => {
    const rows: HourlyMedianRow[] = [
      { string_number: 1, hour: hr(8), median_current: 5, reading_count: 12 },
      { string_number: 1, hour: hr(9), median_current: 5, reading_count: 12 },
      { string_number: 1, hour: hr(10), median_current: 0, reading_count: 12 }, // not producing
    ]
    const out = prepSettledDayInputs(rows, { peerExcluded: new Set(), unused: new Set() })
    expect(out.availability.get(1)).toEqual({ producingHours: 2, sunUpHours: 3 })
  })
})

// ─── live-today pro-rata: buildPerfInputsFromHourly with custom expected-window-hours ──
describe('buildPerfInputsFromHourly (shared helper — live pro-rated, hours-of-coverage)', () => {
  it('uses an expected-window-hours override (live pro-rata) for the completeness gate', () => {
    // Only 2 window-hours elapsed so far → expectedWindowHours = 2; 2 of 2 hours = 100% complete.
    const rows: HourlyMedianRow[] = [8, 9].map(h => ({
      string_number: 1, hour: hr(h), median_current: 5, reading_count: 12,
    }))
    const out = buildPerfInputsFromHourly(rows, { unused: new Set(), peerExcluded: new Set() }, 2)
    expect(out.perfInputs.find(p => p.string_number === 1)!.insufficient_data).toBe(false)
    expect(out.completeness.get(1)).toBe(100)
  })

  it('default expected = the full 8-hour window when no override given', () => {
    const rows: HourlyMedianRow[] = [8, 9].map(h => ({
      string_number: 1, hour: hr(h), median_current: 5, reading_count: 12,
    }))
    const out = buildPerfInputsFromHourly(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(out.perfInputs.find(p => p.string_number === 1)!.insufficient_data).toBe(true) // 2 of 8 hours = 25%
  })
})
