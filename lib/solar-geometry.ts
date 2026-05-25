/**
 * Solar geometry — sun-elevation gate.
 *
 * We have NO irradiance sensors. IEC 61724-1 clause 12.1 gates performance
 * analytics on a daylight filter (in-plane irradiance ≥ 20 W/m²). The
 * irradiance-free substitute is a **sun-elevation gate** computed from plant
 * latitude/longitude + timestamp: below a few degrees of elevation, the sun
 * delivers <~20 W/m² and there is no production expectation.
 *
 * This module is the foundation for: night-vs-fault classification, the
 * daytime comms-loss alarm, and performance-window selection. It is a pure,
 * dependency-free implementation of the NOAA solar-position algorithm
 * (accurate to ~0.5°, far more than enough for a daylight gate).
 *
 * Reference: NOAA Solar Calculator equations
 * (https://gml.noaa.gov/grad/solcalc/solareqns.PDF). All math in UTC.
 *
 * Spec: Working/2_Sunday_24_May_2026/PROVIDER-DATA-INTEGRITY-AUDIT.md §6 (#1)
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/**
 * Sun elevation above the horizon, in degrees, for a given location and
 * instant. Positive = sun above horizon. Negative = below (night).
 *
 * @param latDeg  latitude in degrees (North positive)
 * @param lngDeg  longitude in degrees (East positive)
 * @param date    the instant (interpreted in UTC)
 */
export function solarElevationDeg(latDeg: number, lngDeg: number, date: Date): number {
  // Day of year (1-based) in UTC
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000)

  // UTC fractional hour
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600

  // Fractional year (radians). NOAA: γ = 2π/365 · (doy − 1 + (hour − 12)/24)
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24)

  // Equation of time (minutes)
  const eqTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  )

  // Solar declination (radians)
  const decl = 0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)

  // Time offset (minutes). Working in UTC → timezone term is 0.
  const timeOffset = eqTime + 4 * lngDeg

  // True solar time (minutes)
  const trueSolarTime = hour * 60 + timeOffset

  // Hour angle (degrees): 0 at solar noon, negative morning, positive afternoon
  let hourAngle = trueSolarTime / 4 - 180
  // Normalize into [-180, 180]
  while (hourAngle < -180) hourAngle += 360
  while (hourAngle > 180) hourAngle -= 360

  const latRad = latDeg * DEG
  const ha = hourAngle * DEG

  // Solar zenith angle
  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(ha)
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)))

  return 90 - zenith * RAD
}

/**
 * Elevation (degrees) below which the sun delivers roughly <20 W/m² of
 * irradiance — the irradiance-free proxy for IEC 61724-1's daylight gate.
 * Clear-sky GHI crosses ~20 W/m² at a few degrees of elevation; 3° is a
 * conservative, widely-used cutoff.
 */
export const DAYLIGHT_MIN_ELEVATION_DEG = 3

/**
 * Is the sun high enough that we should expect production (daylight gate
 * open)? Below the threshold → "expected dark", suppress production/comms
 * alarms and exclude from performance metrics.
 */
export function isDaylight(
  latDeg: number,
  lngDeg: number,
  date: Date,
  minElevationDeg: number = DAYLIGHT_MIN_ELEVATION_DEG,
): boolean {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) {
    // No coordinates → we can't gate; treat as daylight so we never
    // accidentally suppress a real daytime fault for an un-geo-located plant.
    return true
  }
  return solarElevationDeg(latDeg, lngDeg, date) >= minElevationDeg
}
