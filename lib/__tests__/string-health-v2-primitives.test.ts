import { describe, it, expect } from 'vitest'
import {
  PANEL_COUNT_DEFAULT,
  SR_HEALTHY,
  SR_ABNORMAL,
  MIN_PEERS_FOR_MPPT_GROUP,
  PEAK_WINDOW_THRESHOLD,
  P2P_CAP,
  getEffectivePanelCount,
  perPanelPower,
  bucketSrScore,
  bucketHealthScore,
  p2pToHealthScore,
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

describe('p2pToHealthScore — round-trips the P2P bucket through the legacy 0-100 scale', () => {
  it('maps the bucket boundaries exactly (0.94→90, 0.85→50)', () => {
    expect(p2pToHealthScore(SR_HEALTHY)).toBeCloseTo(90, 6)
    expect(p2pToHealthScore(SR_ABNORMAL)).toBeCloseTo(50, 6)
    expect(p2pToHealthScore(P2P_CAP)).toBeCloseTo(100, 6)
    expect(p2pToHealthScore(0)).toBe(0)
  })

  it('null/undefined/NaN → null (preserves no-data)', () => {
    expect(p2pToHealthScore(null)).toBeNull()
    expect(p2pToHealthScore(undefined)).toBeNull()
    expect(p2pToHealthScore(NaN)).toBeNull()
  })

  it('CRITICAL INVARIANT: bucketHealthScore(map(p2p)) === bucketSrScore(p2p) across the range', () => {
    // The whole design rests on this: existing consumers bucket the mapped
    // score (HEALTH_HEALTHY=90 / HEALTH_WARNING=50) and must reproduce the P2P bucket.
    const srToHealthBucket = { healthy: 'healthy', abnormal: 'warning', critical: 'critical' } as const
    for (let p2p = 0; p2p <= P2P_CAP + 1e-9; p2p += 0.001) {
      const mapped = p2pToHealthScore(p2p)!
      const viaHealth = bucketHealthScore(mapped)
      const viaSr = bucketSrScore(p2p)!
      expect(viaHealth).toBe(srToHealthBucket[viaSr])
    }
  })

  it('persisted (floored 2dp) value never rounds UP across a boundary', () => {
    // Regression for the rounding bug: values just under a threshold must stay
    // in the lower bucket after 2dp persistence (floor, not round-half-up).
    expect(p2pToHealthScore(0.8499)).toBeLessThan(50)     // critical, not warning
    expect(bucketHealthScore(p2pToHealthScore(0.8499))).toBe('critical')
    expect(p2pToHealthScore(0.9399)).toBeLessThan(90)     // warning, not healthy
    expect(bucketHealthScore(p2pToHealthScore(0.9399))).toBe('warning')
    // Exact boundaries land in the upper bucket (>=).
    expect(bucketHealthScore(p2pToHealthScore(0.85))).toBe('warning')
    expect(bucketHealthScore(p2pToHealthScore(0.94))).toBe('healthy')
    // All outputs are already 2dp (persistence is a no-op, no further rounding).
    for (let p2p = 0.5; p2p <= 1.2; p2p += 0.0007) {
      const v = p2pToHealthScore(p2p)!
      expect(Number(v.toFixed(2))).toBe(v)
    }
  })

  it('is monotonic non-decreasing', () => {
    let prev = -1
    for (let p2p = 0; p2p <= P2P_CAP; p2p += 0.02) {
      const v = p2pToHealthScore(p2p)!
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
