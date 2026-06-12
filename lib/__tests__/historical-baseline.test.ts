import { describe, it, expect } from 'vitest'
import { computeHistoricalPct, pickBaseline } from '@/lib/historical-baseline'

describe('computeHistoricalPct', () => {
  it('returns todayRepr/baseline*100, rounded', () => {
    expect(computeHistoricalPct(8, 10)).toBe(80)
    expect(computeHistoricalPct(7.5, 10)).toBe(75)
    expect(computeHistoricalPct(9.04, 10)).toBe(90) // 90.4 → 90
    expect(computeHistoricalPct(9.06, 10)).toBe(91) // 90.6 → 91
  })

  it('caps at 100 when today exceeds its own baseline', () => {
    expect(computeHistoricalPct(12, 10)).toBe(100)
    expect(computeHistoricalPct(10, 10)).toBe(100)
  })

  it('returns null when baseline is null, zero, or negative', () => {
    expect(computeHistoricalPct(8, null)).toBeNull()
    expect(computeHistoricalPct(8, 0)).toBeNull()
    expect(computeHistoricalPct(8, -5)).toBeNull()
  })

  it('returns null when todayRepr is null', () => {
    expect(computeHistoricalPct(null, 10)).toBeNull()
  })

  it('returns 0 when today is genuinely zero (a real dead-today signal)', () => {
    expect(computeHistoricalPct(0, 10)).toBe(0)
  })
})

describe('pickBaseline', () => {
  it('prefers a positive manual baseline over history', () => {
    expect(pickBaseline({ manual: 9.5, history30: [4, 5, 6] })).toEqual({ value: 9.5, source: 'manual' })
  })

  it('falls back to the median of positive 30-day own currents when no manual', () => {
    // median of [4,5,6] = 5
    expect(pickBaseline({ manual: null, history30: [4, 5, 6] })).toEqual({ value: 5, source: '30d' })
  })

  it('ignores non-positive values when computing the 30-day median', () => {
    // only [4, 8] are positive → median 6
    expect(pickBaseline({ manual: null, history30: [0, 4, -1, 8] })).toEqual({ value: 6, source: '30d' })
  })

  it('ignores a non-positive manual baseline and falls through to history', () => {
    expect(pickBaseline({ manual: 0, history30: [4, 6] })).toEqual({ value: 5, source: '30d' })
    expect(pickBaseline({ manual: -3, history30: [4, 6] })).toEqual({ value: 5, source: '30d' })
  })

  it('returns null source when neither manual nor any positive history exists', () => {
    expect(pickBaseline({ manual: null, history30: [] })).toEqual({ value: null, source: null })
    expect(pickBaseline({ manual: null, history30: [0, -1] })).toEqual({ value: null, source: null })
  })
})
