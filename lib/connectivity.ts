import { classifyConnectivity, ConnectivityStatus, VENDOR_TS_MAX_FUTURE_SKEW_MS } from '@/lib/string-health'
import { solarElevationDeg } from '@/lib/solar-geometry'

/** "Solidly mid-day" floor for the died-during-production check. Deliberately
 *  above the 3° daylight threshold: a healthy dusk-sleeper's final reading
 *  lands at low sun (≲8°) and must NOT be branded a daytime death. */
export const FROZEN_EFF_MIN_SUN_ELEVATION_DEG = 8

/**
 * Assemble a device's connectivity status from its two persisted freshness
 * signals + how recently we last wrote a measurement. Used by the plant API
 * and the NOC rollup so both agree on Live/Frozen/Offline/Idle.
 *
 * effectiveFreshAt = newest of (vendor_last_data_at, reading_changed_at) — the
 * most recent evidence of genuinely-new data from this inverter. A vendor ts
 * in the FUTURE beyond clock-skew tolerance is garbage (fast logger clock) and
 * is ignored — it would otherwise pin the device "live" forever.
 *
 * coords (CLAMPED plant lat/lng) lets the classifier know whether the feed's
 * last real data arrived during production hours — a feed that died at noon
 * stays frozen through the night instead of being amnestied to "idle" at dusk
 * (audit 2026-06-05: Qadir's 3-day freeze vanished from the NOC every night).
 */
export function deviceConnectivity(
  device: { vendor_last_data_at: Date | null; reading_changed_at: Date | null },
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
  coords?: { lat: number; lng: number },
): { status: ConnectivityStatus; effectiveFreshAt: Date | null } {
  let v = device.vendor_last_data_at?.getTime() ?? null
  if (v != null && v > nowMs + VENDOR_TS_MAX_FUTURE_SKEW_MS) v = null
  const r = device.reading_changed_at?.getTime() ?? null
  const effMs = v == null && r == null ? null : Math.max(v ?? 0, r ?? 0)
  const effWasProductionHours =
    coords != null && effMs != null
      ? solarElevationDeg(coords.lat, coords.lng, new Date(effMs)) >= FROZEN_EFF_MIN_SUN_ELEVATION_DEG
      : false
  return {
    status: classifyConnectivity(effMs, lastWriteAtMs, sunUp, nowMs, effWasProductionHours),
    effectiveFreshAt: effMs == null ? null : new Date(effMs),
  }
}
