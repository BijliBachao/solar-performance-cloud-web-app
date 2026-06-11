import { describe, it, expect } from 'vitest'
import { computeSunGate, minutesUntilElevation } from '@/lib/sun-gate'
import {
  FLEET_DEFAULT_LAT,
  FLEET_DEFAULT_LNG,
  ALERT_MIN_SUN_ELEVATION_DEG,
} from '@/lib/string-health'

// Regional centroid (central Punjab / Lahore). Mid-June: sun high at local noon.
const LAT = FLEET_DEFAULT_LAT
const LNG = FLEET_DEFAULT_LNG
const GATE = ALERT_MIN_SUN_ELEVATION_DEG

// PKT = UTC+5. 06:30Z = 11:30 PKT (near solar noon) → sun well up.
const NOON = new Date('2026-06-15T06:30:00Z')
// 23:50Z (15 Jun) = 04:50 PKT (16 Jun), before sunrise → sun below the gate.
const PRE_DAWN = new Date('2026-06-15T23:50:00Z')

describe('minutesUntilElevation', () => {
  it('returns 0 when the sun is already above the target', () => {
    expect(minutesUntilElevation(LAT, LNG, GATE, NOON)).toBe(0)
  })

  it('returns a finite, positive wait before dawn', () => {
    const m = minutesUntilElevation(LAT, LNG, GATE, PRE_DAWN)
    expect(m).not.toBeNull()
    expect(m as number).toBeGreaterThan(0)
    expect(m as number).toBeLessThan(8 * 60)
  })

  it('returns null when coordinates are not finite', () => {
    expect(minutesUntilElevation(NaN, NaN, GATE, NOON)).toBeNull()
  })
})

describe('computeSunGate', () => {
  it('is armed with the sun high at local noon', () => {
    const g = computeSunGate(LAT, LNG, NOON)
    expect(g.armed).toBe(true)
    expect(g.minutesUntilArmed).toBe(0)
    expect(g.elevationDeg).toBeGreaterThan(GATE)
    expect(g.thresholdDeg).toBe(GATE)
  })

  it('is not armed before dawn, climbing, with a finite ETA', () => {
    const g = computeSunGate(LAT, LNG, PRE_DAWN)
    expect(g.armed).toBe(false)
    expect(g.elevationDeg).toBeLessThan(GATE)
    expect(g.minutesUntilArmed).not.toBeNull()
    expect(g.minutesUntilArmed as number).toBeGreaterThan(0)
    expect(g.rising).toBe(true) // pre-dawn → sun is climbing
  })

  it('reports descending (not rising) at dusk', () => {
    // 13:30Z = 18:30 PKT mid-June: sun is up but dropping toward sunset.
    const dusk = new Date('2026-06-15T13:30:00Z')
    const g = computeSunGate(LAT, LNG, dusk)
    expect(g.armed).toBe(false)
    expect(g.elevationDeg).toBeLessThan(GATE)
    expect(g.rising).toBe(false) // dusk → sun is descending
  })

  it('flags approximate + falls back to the centroid when coords are missing', () => {
    const g = computeSunGate(null, null, NOON)
    expect(g.approximate).toBe(true)
    // Identical to an explicit-centroid reading.
    expect(g.elevationDeg).toBeCloseTo(computeSunGate(LAT, LNG, NOON).elevationDeg, 5)
  })

  it('flags approximate for vendor-default Beijing coords', () => {
    expect(computeSunGate(39.9, 116.4, NOON).approximate).toBe(true)
  })

  it('treats real Pakistani coords as exact (not approximate)', () => {
    expect(computeSunGate(LAT, LNG, NOON).approximate).toBe(false)
  })
})
