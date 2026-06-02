import { classifyConnectivity, ConnectivityStatus } from '@/lib/string-health'

/**
 * Assemble a device's connectivity status from its two persisted freshness
 * signals + how recently we last wrote a measurement. Used by the plant API
 * and the NOC rollup so both agree on Live/Frozen/Offline/Idle.
 *
 * effectiveFreshAt = newest of (vendor_last_data_at, reading_changed_at) — the
 * most recent evidence of genuinely-new data from this inverter.
 */
export function deviceConnectivity(
  device: { vendor_last_data_at: Date | null; reading_changed_at: Date | null },
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
): { status: ConnectivityStatus; effectiveFreshAt: Date | null } {
  const v = device.vendor_last_data_at?.getTime() ?? null
  const r = device.reading_changed_at?.getTime() ?? null
  const effMs = v == null && r == null ? null : Math.max(v ?? 0, r ?? 0)
  return {
    status: classifyConnectivity(effMs, lastWriteAtMs, sunUp, nowMs),
    effectiveFreshAt: effMs == null ? null : new Date(effMs),
  }
}
