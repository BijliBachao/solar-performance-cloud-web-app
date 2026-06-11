/**
 * Sun-gate UI helper — turns a plant's coordinates + the current instant into
 * the user-facing "is live string-performance data available yet?" verdict.
 *
 * The LIVE (last-3h) string-performance donut and the real-time string readings
 * are gated on sun elevation (ALERT_MIN_SUN_ELEVATION_DEG): below the floor the
 * sun delivers too little irradiance to score a string fairly, so verdicts are
 * withheld (rendered as "no data") to avoid dawn/dusk false faults. This module
 * exposes that SAME gate to the UI — the elevation chip + the plant-page banner
 * — so users understand why a morning view is still blank and roughly when it
 * will fill in.
 *
 * Pure and dependency-light (re-uses solar-geometry + string-health), so it is
 * safe to import into the client bundle and to unit-test in isolation.
 */
import { solarElevationDeg } from './solar-geometry'
import {
  ALERT_MIN_SUN_ELEVATION_DEG,
  clampToFleetCoords,
  coordsArePlausible,
} from './string-health'

export interface SunGateState {
  /** Sun elevation (deg) at the clamped location, at the given instant.
   *  Positive = above horizon, negative = below (night). */
  elevationDeg: number
  /** The performance-gate threshold (deg). Live scoring arms at/above this. */
  thresholdDeg: number
  /** elevationDeg >= thresholdDeg — i.e. live data should be flowing. */
  armed: boolean
  /** Minutes from `now` until elevation first reaches the threshold. 0 when
   *  already armed; null when it will not within the look-ahead horizon
   *  (afternoon descent, evening, deep night). */
  minutesUntilArmed: number | null
  /** True when the sun is climbing (morning), false when descending (afternoon/
   *  dusk). Lets the UI say "fills in shortly" in the morning vs "paused for the
   *  evening" at dusk, instead of always implying a sunrise wait. */
  rising: boolean
  /** True when the plant's own coords were missing or garbage (e.g. vendor-
   *  default Beijing) and the regional centroid was substituted. All plants are
   *  in the Lahore area and the centroid IS Lahore, so this estimate is accurate
   *  to a fraction of a degree — informational, not a data gap. */
  approximate: boolean
}

/** Look-ahead window for the "minutes until armed" projection. 8 h comfortably
 *  spans any pre-dawn wait to the morning arm time without an unbounded loop. */
const LOOK_AHEAD_MINUTES = 8 * 60

/**
 * Minutes from `from` until the sun first reaches `targetDeg` at the given
 * location, scanning minute-by-minute up to `maxMinutes`. Returns 0 if already
 * at/above the target, null if not reached within the horizon (or if the
 * coordinates are not finite).
 */
export function minutesUntilElevation(
  latDeg: number,
  lngDeg: number,
  targetDeg: number,
  from: Date,
  maxMinutes: number = LOOK_AHEAD_MINUTES,
): number | null {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) return null
  for (let m = 0; m <= maxMinutes; m++) {
    const t = new Date(from.getTime() + m * 60_000)
    if (solarElevationDeg(latDeg, lngDeg, t) >= targetDeg) return m
  }
  return null
}

/**
 * Resolve the full sun-gate state for a plant (or the region, when coords are
 * absent) at a given instant. Coords are clamped with the same coordinate clamp
 * the live donut uses, so this verdict can never contradict the donut's `armed`
 * decision.
 */
export function computeSunGate(
  latRaw: unknown,
  lngRaw: unknown,
  now: Date,
  thresholdDeg: number = ALERT_MIN_SUN_ELEVATION_DEG,
): SunGateState {
  const { lat, lng } = clampToFleetCoords(latRaw, lngRaw)
  const approximate = !coordsArePlausible(latRaw, lngRaw)
  const elevationDeg = solarElevationDeg(lat, lng, now)
  const armed = elevationDeg >= thresholdDeg
  const minutesUntilArmed = armed ? 0 : minutesUntilElevation(lat, lng, thresholdDeg, now)
  // Climbing vs descending: compare against a reading 10 min ahead. Separates
  // the morning ramp ("fills in shortly") from the dusk descent ("paused").
  const rising = solarElevationDeg(lat, lng, new Date(now.getTime() + 10 * 60_000)) > elevationDeg
  return { elevationDeg, thresholdDeg, armed, minutesUntilArmed, rising, approximate }
}
