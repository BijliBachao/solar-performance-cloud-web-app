import { describe, it, expect } from 'vitest'
import { scoreStringPerformance, computeOperatingAvailability, median, type PerfStringInput } from '@/lib/string-performance'

const used = (string_number: number, repr_current: number | null): PerfStringInput =>
  ({ string_number, is_used: true, exclude_from_peer_comparison: false, repr_current })

describe('median', () => {
  it('odd', () => expect(median([3, 1, 2])).toBe(2))
  it('even', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('scoreStringPerformance', () => {
  it('uniform healthy group → all 100% healthy', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 5)])
    expect(r.every(x => x.performance === 100 && x.status === 'healthy')).toBe(true)
  })
  it('one weak string → critical, peers healthy', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 2)])
    const m = new Map(r.map(x => [x.string_number, x]))
    expect(m.get(1)!.status).toBe('healthy')
    expect(m.get(4)!.performance).toBe(40)
    expect(m.get(4)!.status).toBe('critical')
  })
  it('warning band (88%)', () => {
    const r = scoreStringPerformance([used(1, 10), used(2, 10), used(3, 10), used(4, 8.8)])
    const w = r.find(x => x.string_number === 4)!
    expect(w.performance).toBe(88); expect(w.status).toBe('warning')
  })
  it('whole group low together → all healthy (systemic blind spot, documented)', () => {
    const r = scoreStringPerformance([used(1, 2), used(2, 2), used(3, 2), used(4, 2)])
    expect(r.every(x => x.status === 'healthy')).toBe(true)
  })
  it('group below comparison floor → no_data', () => {
    const r = scoreStringPerformance([used(1, 0.5), used(2, 0.5), used(3, 0.5)])
    expect(r.every(x => x.status === 'no_data')).toBe(true)
  })
  it('lone string (no peer) → no_data (self-ref is Phase 2)', () => {
    expect(scoreStringPerformance([used(1, 5)])[0].status).toBe('no_data')
  })
  it('peer-excluded is dropped from median + tagged', () => {
    const r = scoreStringPerformance([
      used(1, 5), used(2, 5), used(3, 5),
      { string_number: 4, is_used: true, exclude_from_peer_comparison: true, repr_current: 1 },
    ])
    expect(r.find(x => x.string_number === 4)!.status).toBe('peer_excluded')
    expect(r.find(x => x.string_number === 1)!.performance).toBe(100)
  })
  it('unused → unused status', () => {
    const r = scoreStringPerformance([
      used(1, 5), used(2, 5),
      { string_number: 3, is_used: false, exclude_from_peer_comparison: false, repr_current: null },
    ])
    expect(r.find(x => x.string_number === 3)!.status).toBe('unused')
  })
  it('caps runaway ratio at the display cap', () => {
    const r = scoreStringPerformance([used(1, 5), used(2, 5), used(3, 5), used(4, 50)])
    expect(r.find(x => x.string_number === 4)!.performance).toBe(150)
  })
})

describe('computeOperatingAvailability', () => {
  it('90/100 → 90', () => expect(computeOperatingAvailability(90, 100)).toBe(90))
  it('dark → 0', () => expect(computeOperatingAvailability(0, 100)).toBe(0))
  it('no sun-up → null', () => expect(computeOperatingAvailability(0, 0)).toBeNull())
  it('clamp >100', () => expect(computeOperatingAvailability(120, 100)).toBe(100))
})
