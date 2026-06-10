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

describe('Live Last-3h donut ↔ canonical SR bucketing equivalence', () => {
  // The live Last-3h donut converts an SR ratio to a health_score with
  // Math.floor(sr*100), then buckets it via bucketHealthScore at 94/85. That
  // MUST agree with the canonical ratio bucketing bucketSrScore at 0.94/0.85
  // for every sr — especially the round-up boundaries [0.935,0.94) and
  // [0.845,0.85) where Math.round would mis-bucket and contradict the live
  // chart. bucketHealthScore uses 'warning'; bucketSrScore uses 'abnormal' for
  // the same middle band, so compare the equivalent buckets.
  const HEALTH_TO_SR: Record<string, string> = {
    healthy: 'healthy',
    warning: 'abnormal',
    critical: 'critical',
  }
  it('bucketHealthScore(floor(sr*100)) === bucketSrScore(sr) for all sr', () => {
    for (const sr of [0.8, 0.8499, 0.85, 0.939, 0.9399, 0.94, 0.96, 1.0, 1.49]) {
      const health = bucketHealthScore(Math.floor(sr * 100))
      expect(HEALTH_TO_SR[health]).toBe(bucketSrScore(sr))
    }
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
