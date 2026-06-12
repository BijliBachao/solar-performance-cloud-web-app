import { describe, it, expect } from 'vitest'
import { buildPerfInputsFromHourly, type HourlyMedianRow } from '@/lib/settled-day-performance'
import { bucketDonutStatus } from '@/lib/string-health-donut'

// Regression tests for the Opus-review findings on the V1 math chunk:
//   I-1 — completeness gate must NOT falsely gate a deploy-day transition
//         (legacy NULL-count morning hours + new real-count afternoon hours),
//         and must still gate a genuinely thin NEW day.
//   C-1 — a no-active hour produces median_current 0 (the same value the
//         settled path gets from the aggregator's NULL→0), so the live and
//         settled medians-of-medians stay identical.

const cfg = { unused: new Set<number>(), peerExcluded: new Set<number>() }
// hour at PKT `h` (PKT = UTC+5) for a fixed date inside the 8–4 window.
const hr = (pktHour: number, median_current: number, reading_count: number | null): HourlyMedianRow =>
  ({ string_number: 1, hour: new Date(Date.UTC(2026, 5, 15, pktHour - 5, 0, 0)), median_current, reading_count })

const insuf = (rows: HourlyMedianRow[]) =>
  buildPerfInputsFromHourly(rows, cfg).perfInputs.find(p => p.string_number === 1)?.insufficient_data

describe('I-1 completeness gate — legacy/transition exemption', () => {
  it('mixed legacy(NULL)+real-count full window is NOT gated (deploy-day transition)', () => {
    expect(insuf([
      hr(8, 5, null), hr(9, 5, null), hr(10, 5, null), hr(11, 5, null), // legacy morning (NULL counts)
      hr(12, 5, 12), hr(13, 5, 12), hr(14, 5, 12), hr(15, 5, 12),        // new afternoon (real counts)
    ])).toBe(false)
  })

  it('all-legacy(NULL) full window is scored, not gated', () => {
    expect(insuf([8, 9, 10, 11, 12, 13, 14, 15].map(h => hr(h, 5, null)))).toBe(false)
  })

  it('all-real-count COMPLETE day is not gated (96/96)', () => {
    expect(insuf([8, 9, 10, 11, 12, 13, 14, 15].map(h => hr(h, 5, 12)))).toBe(false)
  })

  it('all-real-count THIN day IS gated (24/96 = 25% < 60%)', () => {
    expect(insuf([hr(8, 5, 12), hr(9, 5, 12)])).toBe(true)
  })

  it('all-real-count at exactly 60% (≈58/96) is scored', () => {
    // 5 hours × 12 = 60 readings = 62.5% ≥ 60% → scored
    expect(insuf([8, 9, 10, 11, 12].map(h => hr(h, 5, 12)))).toBe(false)
  })

  // The gate is now HOURS-OF-COVERAGE based (≥5 of 8 window hours), not raw readings/96,
  // so it is cadence-proof — Reyyan §9's "roughly 5 of the 8 hours" intent.
  it('CADENCE-PROOF: 8 window hours at ~10-min spacing (Huawei, ~6/hr = 48/day) is NOT gated', () => {
    // The OLD 58-of-96-readings gate wrongly killed EVERY Huawei string (48 < 58).
    // Hours-based: 8 of 8 hours covered → scored.
    expect(insuf([8, 9, 10, 11, 12, 13, 14, 15].map(h => hr(h, 5, 6)))).toBe(false)
  })
  it('fewer than 5 of 8 window hours IS gated (a real data gap, any cadence)', () => {
    expect(insuf([8, 9, 10, 11].map(h => hr(h, 5, 12)))).toBe(true) // 4 of 8 hours = 50% < 60%
  })
})

describe('C-1 dead-hour handling — median_current 0 is included consistently', () => {
  it('a no-active hour (median_current 0) is kept in the median-of-medians, not dropped', () => {
    // String produces ~5 A for 6 hours and 0 A (no active readings) for 2 hours.
    // Both live and settled feed median_current=0 for the dead hours; the helper
    // must include them (only < 0 / NaN are dropped), so repr = median of {0,0,5×6}.
    const rows = [
      hr(8, 0, 12), hr(9, 0, 12),
      hr(10, 5, 12), hr(11, 5, 12), hr(12, 5, 12), hr(13, 5, 12), hr(14, 5, 12), hr(15, 5, 12),
    ]
    const repr = buildPerfInputsFromHourly(rows, cfg).perfInputs.find(p => p.string_number === 1)!.repr_current
    expect(repr).toBe(5) // median of [0,0,5,5,5,5,5,5] = 5 (the two 0s are low outliers, ignored by the median)
  })
})

describe('V1 cutover (Task 10) — donut is fully V1; the SR-bucket override path is retired', () => {
  // The per-plant "Today (live)" donut now reads today's string_daily (V1
  // metric) instead of the old SR-anchored last-3h compute, so bucketDonutStatus
  // ALWAYS uses the V1 bands — there is no longer a `bucket` override on
  // DonutInput. Every donut surface (per-plant prev-day/today, NOC, analysis)
  // shares this one V1 path.
  const base = { isUsed: true, peerExcluded: false, openCircuit: false }
  it('uses the 3-band cutpoints for every score (85/50)', () => {
    expect(bucketDonutStatus({ ...base, healthScore: 95 })).toBe('healthy')   // Normal
    expect(bucketDonutStatus({ ...base, healthScore: 85 })).toBe('healthy')   // Normal edge
    expect(bucketDonutStatus({ ...base, healthScore: 70 })).toBe('abnormal')  // Watch
    expect(bucketDonutStatus({ ...base, healthScore: 50 })).toBe('abnormal')  // Watch edge
    expect(bucketDonutStatus({ ...base, healthScore: 49 })).toBe('critical')  // Critical
  })
  it('exclusion / open-circuit / no-data overrides still apply', () => {
    expect(bucketDonutStatus({ ...base, healthScore: 95, isUsed: false })).toBeNull()
    expect(bucketDonutStatus({ ...base, healthScore: 95, peerExcluded: true })).toBeNull()
    expect(bucketDonutStatus({ ...base, healthScore: 95, openCircuit: true })).toBe('critical')
    expect(bucketDonutStatus({ ...base, healthScore: null })).toBe('abnormal') // no-data folds to abnormal
  })
})
