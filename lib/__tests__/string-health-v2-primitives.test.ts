import { describe, it, expect } from 'vitest'
import {
  PANEL_COUNT_DEFAULT,
  SR_HEALTHY,
  SR_ABNORMAL,
  MIN_PEERS_FOR_MPPT_GROUP,
  PEAK_WINDOW_THRESHOLD,
  getEffectivePanelCount,
  perPanelPower,
  bucketSrScore,
  bucketHealthScore,
} from '@/lib/string-health'

// Algorithm v2 primitives — pure functions. These tests pin down the
// contract that the live + daily algorithms depend on.

describe('getEffectivePanelCount', () => {
  it('returns the actual count when it is a positive number', () => {
    expect(getEffectivePanelCount(17)).toEqual({ count: 17, isDefault: false })
    expect(getEffectivePanelCount(1)).toEqual({ count: 1, isDefault: false })
    expect(getEffectivePanelCount(100)).toEqual({ count: 100, isDefault: false })
  })

  it('falls back to PANEL_COUNT_DEFAULT when count is null/undefined/0', () => {
    expect(getEffectivePanelCount(null)).toEqual({ count: PANEL_COUNT_DEFAULT, isDefault: true })
    expect(getEffectivePanelCount(undefined)).toEqual({ count: PANEL_COUNT_DEFAULT, isDefault: true })
    expect(getEffectivePanelCount(0)).toEqual({ count: PANEL_COUNT_DEFAULT, isDefault: true })
  })

  it('falls back on negative or non-finite values', () => {
    expect(getEffectivePanelCount(-5).isDefault).toBe(true)
    expect(getEffectivePanelCount(NaN).isDefault).toBe(true)
    expect(getEffectivePanelCount(Infinity).isDefault).toBe(true)
  })
})

describe('perPanelPower', () => {
  it('divides power by panel count', () => {
    expect(perPanelPower(1700, 17)).toBe(100)
    expect(perPanelPower(6500, 13)).toBe(500)
  })

  it('handles zero power', () => {
    expect(perPanelPower(0, 16)).toBe(0)
  })

  it('guards against divide-by-zero panel count', () => {
    expect(perPanelPower(100, 0)).toBe(100)  // treated as /1
  })
})

describe('bucketSrScore', () => {
  it('SR at or above the Healthy threshold buckets Healthy', () => {
    expect(bucketSrScore(SR_HEALTHY)).toBe('healthy')
    expect(bucketSrScore(0.95)).toBe('healthy')
    expect(bucketSrScore(1.0)).toBe('healthy')
    expect(bucketSrScore(1.5)).toBe('healthy')  // peer outperformed - still healthy
  })

  it('SR between SR_ABNORMAL and SR_HEALTHY buckets Abnormal', () => {
    expect(bucketSrScore(SR_ABNORMAL)).toBe('abnormal')
    expect(bucketSrScore(0.90)).toBe('abnormal')
    expect(bucketSrScore(SR_HEALTHY - 0.001)).toBe('abnormal')
  })

  it('SR below SR_ABNORMAL buckets Critical', () => {
    expect(bucketSrScore(SR_ABNORMAL - 0.001)).toBe('critical')
    expect(bucketSrScore(0.5)).toBe('critical')
    expect(bucketSrScore(0)).toBe('critical')
  })

  it('null / undefined / NaN return null (no-data)', () => {
    expect(bucketSrScore(null)).toBeNull()
    expect(bucketSrScore(undefined)).toBeNull()
    expect(bucketSrScore(NaN)).toBeNull()
    expect(bucketSrScore(Infinity)).toBeNull()
  })

  it('monotonicity: higher SR is always at least as good a bucket', () => {
    const tiers: Record<string, number> = { critical: 0, abnormal: 1, healthy: 2 }
    let prev = -1
    for (let sr = 0; sr <= 1.5; sr += 0.05) {
      const b = bucketSrScore(sr)
      const tier = b === null ? -1 : tiers[b]
      expect(tier).toBeGreaterThanOrEqual(prev)
      prev = tier
    }
  })
})

describe('bucketHealthScore (V1 daily bands) is independent of bucketSrScore (SR alert path)', () => {
  // V1 band cutover (2026-06-11): bucketHealthScore now delegates to the V1
  // classifier (95/85/60/10) for the DAILY metric — /analysis cells, donut,
  // NOC. bucketSrScore stays on the SolarEdge ±6% anchor (0.94/0.85) for the
  // LIVE-SR / alert path (untouched). They DELIBERATELY diverge now: e.g. a
  // score of 94 is 'warning' (Watch) under V1 but sr=0.94 is 'healthy' on the
  // SR anchor. This test pins the divergence so a future "re-align" of the two
  // is a conscious choice, not an accident.
  it('bucketHealthScore uses V1 cutpoints (95/85/60), not the SR 0.94/0.85 anchor', () => {
    expect(bucketHealthScore(95)).toBe('healthy')  // Normal
    expect(bucketHealthScore(94)).toBe('warning')  // Watch — would be 'healthy' on the 94 anchor
    expect(bucketHealthScore(85)).toBe('warning')  // Watch edge
    expect(bucketHealthScore(84)).toBe('warning')  // Underperforming — would be 'critical' on the 85 anchor
    expect(bucketHealthScore(60)).toBe('warning')  // Underperforming edge
    expect(bucketHealthScore(59)).toBe('critical') // Serious Fault
    expect(bucketHealthScore(null)).toBe('no_data')
  })

  it('bucketSrScore (SR alert path) is unchanged on the 0.94/0.85 anchor', () => {
    expect(bucketSrScore(0.94)).toBe('healthy')
    expect(bucketSrScore(0.939)).toBe('abnormal')
    expect(bucketSrScore(0.85)).toBe('abnormal')
    expect(bucketSrScore(0.849)).toBe('critical')
  })
})

describe('Constants — sanity', () => {
  it('thresholds are ordered correctly: 0 < SR_ABNORMAL < SR_HEALTHY', () => {
    expect(SR_ABNORMAL).toBeGreaterThan(0)
    expect(SR_HEALTHY).toBeGreaterThan(SR_ABNORMAL)
    expect(SR_HEALTHY).toBeLessThanOrEqual(1.0)
  })

  it('SR_HEALTHY matches SolarEdge ±6% mismatch precedent (0.94)', () => {
    expect(SR_HEALTHY).toBeCloseTo(0.94, 2)
  })

  it('PANEL_COUNT_DEFAULT is a reasonable mid-fleet value', () => {
    expect(PANEL_COUNT_DEFAULT).toBeGreaterThanOrEqual(8)
    expect(PANEL_COUNT_DEFAULT).toBeLessThanOrEqual(24)
  })

  it('MIN_PEERS_FOR_MPPT_GROUP >= 2 (need at least 2 strings to compare)', () => {
    expect(MIN_PEERS_FOR_MPPT_GROUP).toBeGreaterThanOrEqual(2)
  })

  it('PEAK_WINDOW_THRESHOLD is a sensible fraction (0 to 1)', () => {
    expect(PEAK_WINDOW_THRESHOLD).toBeGreaterThan(0)
    expect(PEAK_WINDOW_THRESHOLD).toBeLessThanOrEqual(1.0)
  })
})
