import { describe, it, expect } from 'vitest'
import {
  solarElevationDeg,
  isDaylight,
  DAYLIGHT_MIN_ELEVATION_DEG,
} from '@/lib/solar-geometry'

// Reference location: Lahore, Pakistan (most of the fleet is here).
const LAHORE_LAT = 31.5204
const LAHORE_LNG = 74.3587
// Lahore solar noon ≈ 07:00 UTC (lng 74.36°E → 12:00 − 74.36/15 ≈ 07:02 UTC).

describe('solarElevationDeg — Lahore, late May', () => {
  it('is near maximum (~79°) at solar noon', () => {
    // At solar noon late May (declination ~21°): elev ≈ 90 − |31.5 − 21| ≈ 79°
    const elev = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T07:00:00Z'))
    expect(elev).toBeGreaterThan(75)
    expect(elev).toBeLessThan(83)
  })

  it('is strongly negative at deep night (03:00 PKT = 22:00 UTC)', () => {
    const elev = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-24T22:00:00Z'))
    expect(elev).toBeLessThan(-10)
  })

  it('is below horizon before sunrise (04:00 PKT = 23:00 UTC prev day)', () => {
    const elev = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-24T23:00:00Z'))
    expect(elev).toBeLessThan(0)
  })

  it('is up by mid-morning (07:30 PKT = 02:30 UTC)', () => {
    const elev = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T02:30:00Z'))
    expect(elev).toBeGreaterThan(10)
  })

  it('peaks at solar noon — higher than 3h before or after', () => {
    const noon = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T07:00:00Z'))
    const before = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T04:00:00Z'))
    const after = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T10:00:00Z'))
    expect(noon).toBeGreaterThan(before)
    expect(noon).toBeGreaterThan(after)
  })
})

describe('solarElevationDeg — sanity across the globe', () => {
  it('equator at equinox solar noon is near overhead (~90°)', () => {
    // Equinox ~2026-03-20, equator, lng 0 → solar noon ≈ 12:00 UTC
    const elev = solarElevationDeg(0, 0, new Date('2026-03-20T12:00:00Z'))
    expect(elev).toBeGreaterThan(85)
  })

  it('southern hemisphere: Sydney has a positive midday sun in its summer (January)', () => {
    // Sydney -33.87, 151.21; solar noon ≈ 12:00 − 151.21/15 ≈ 01:55 UTC
    const elev = solarElevationDeg(-33.87, 151.21, new Date('2026-01-15T01:55:00Z'))
    expect(elev).toBeGreaterThan(60) // high summer sun
  })
})

describe('isDaylight', () => {
  it('true at solar noon, false at deep night (Lahore)', () => {
    expect(isDaylight(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-25T07:00:00Z'))).toBe(true)
    expect(isDaylight(LAHORE_LAT, LAHORE_LNG, new Date('2026-05-24T22:00:00Z'))).toBe(false)
  })

  it('respects a custom elevation threshold', () => {
    // Pick a low-but-positive-elevation moment; default gate (3°) vs strict (30°)
    const t = new Date('2026-05-25T01:30:00Z') // ~06:30 PKT, sun low
    const elev = solarElevationDeg(LAHORE_LAT, LAHORE_LNG, t)
    expect(isDaylight(LAHORE_LAT, LAHORE_LNG, t, 0)).toBe(elev >= 0)
    expect(isDaylight(LAHORE_LAT, LAHORE_LNG, t, 60)).toBe(false) // sun isn't 60° up that early
  })

  it('uses DAYLIGHT_MIN_ELEVATION_DEG as the default threshold', () => {
    expect(DAYLIGHT_MIN_ELEVATION_DEG).toBeGreaterThan(0)
    expect(DAYLIGHT_MIN_ELEVATION_DEG).toBeLessThan(10)
  })

  it('FAIL-SAFE: missing/NaN coordinates → returns true (never suppress a real daytime fault)', () => {
    expect(isDaylight(NaN, NaN, new Date('2026-05-24T22:00:00Z'))).toBe(true)
    expect(isDaylight(NaN, 74, new Date('2026-05-24T22:00:00Z'))).toBe(true)
    expect(isDaylight(31, NaN, new Date('2026-05-24T22:00:00Z'))).toBe(true)
  })
})
