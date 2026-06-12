import { describe, it, expect } from 'vitest'
import { scoreStringPerformance, computeOperatingAvailability, median, type PerfStringInput } from '@/lib/string-performance'

// V1 (2026-06-11) + 3-band rebrand (2026-06-12): scorer returns
// { performance(display ≤100), raw_performance(uncapped), band, peer_median_current }
// and the input carries `insufficient_data`. Bands: normal ≥85, watch [50,85),
// critical <50.
const used = (string_number: number, repr_current: number | null): PerfStringInput =>
  ({ string_number, is_used: true, exclude_from_peer_comparison: false, repr_current, insufficient_data: false })

describe('median', () => {
  it('odd', () => expect(median([3, 1, 2])).toBe(2))
  it('even', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('scoreStringPerformance', () => {
  it('uniform healthy group → all 100% normal', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 5)])
    expect(r.every(x => x.performance === 100 && x.band === 'normal')).toBe(true)
  })
  it('one weak string → critical, peers normal', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 2)])
    const m = new Map(r.map(x => [x.string_number, x]))
    expect(m.get(1)!.band).toBe('normal')
    expect(m.get(4)!.performance).toBe(40) // 2/5 = 40%, below 50 → critical
    expect(m.get(4)!.band).toBe('critical')
  })
  it('watch band (70%)', () => {
    const r = scoreStringPerformance([used(1, 10), used(2, 10), used(3, 10), used(4, 7)])
    const w = r.find(x => x.string_number === 4)!
    expect(w.performance).toBe(70)
    expect(w.band).toBe('watch') // 50 ≤ 70 < 85
  })
  it('whole group low together → all normal (systemic blind spot, documented)', () => {
    const r = scoreStringPerformance([used(1, 2), used(2, 2), used(3, 2), used(4, 2)])
    expect(r.every(x => x.band === 'normal')).toBe(true)
  })
  it('group below comparison floor → insufficient_data', () => {
    const r = scoreStringPerformance([used(1, 0.5), used(2, 0.5), used(3, 0.5)])
    expect(r.every(x => x.band === 'insufficient_data' && x.performance === null)).toBe(true)
  })
  it('lone string (no peer) → insufficient_data (self-ref is Phase 2)', () => {
    expect(scoreStringPerformance([used(1, 5)])[0].band).toBe('insufficient_data')
  })
  it('peer-excluded is dropped from median + tagged', () => {
    const r = scoreStringPerformance([
      used(1, 5), used(2, 5), used(3, 5),
      { string_number: 4, is_used: true, exclude_from_peer_comparison: true, repr_current: 1, insufficient_data: false },
    ])
    expect(r.find(x => x.string_number === 4)!.band).toBe('peer_excluded')
    expect(r.find(x => x.string_number === 1)!.performance).toBe(100)
  })
  it('unused → unused band', () => {
    const r = scoreStringPerformance([
      used(1, 5), used(2, 5),
      { string_number: 3, is_used: false, exclude_from_peer_comparison: false, repr_current: null, insufficient_data: false },
    ])
    expect(r.find(x => x.string_number === 3)!.band).toBe('unused')
  })
  it('display caps a runaway ratio at 100, raw keeps the uncapped value', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 50)])
    const s4 = r.find(x => x.string_number === 4)!
    expect(s4.performance).toBe(100) // display cap
    expect(s4.raw_performance).toBe(1000) // 50/5 = 1000% raw, kept for sensor-fault visibility
  })
})

describe('computeOperatingAvailability', () => {
  it('90/100 → 90', () => expect(computeOperatingAvailability(90, 100)).toBe(90))
  it('dark → 0', () => expect(computeOperatingAvailability(0, 100)).toBe(0))
  it('no sun-up → null', () => expect(computeOperatingAvailability(0, 0)).toBeNull())
  it('clamp >100', () => expect(computeOperatingAvailability(120, 100)).toBe(100))
})
