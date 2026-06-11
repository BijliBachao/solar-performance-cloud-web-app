/**
 * String-level PERFORMANCE (V1 — intra-inverter current vs peer-median current).
 * A string's DC current is set by irradiance, not panel count/series length, and
 * is comparable across MPPTs. Compare each string's representative current to the
 * MEDIAN current of its same-inverter peers. No nameplate, no panel_count.
 *
 * V1 (LOCKED 2026-06-11, reyyan-message_final.txt §6):
 *   raw_performance = round(repr / peerMedian × 100)   (UNCAPPED — sensor-fault visibility)
 *   performance     = MIN(raw, PERF_DISPLAY_MAX=100)   (customer-facing DISPLAY value)
 *   band            = classifyStringPerformance(performance, flags)  (the single source of truth)
 * The peer pool excludes unused / peer-excluded / insufficient-data / null strings.
 * PURE — no I/O.
 */
import {
  PERF_DISPLAY_MAX,
  MIN_CURRENT_FOR_COMPARISON,
  classifyStringPerformance,
  type PerfBand,
} from '@/lib/string-health'

export interface PerfStringInput {
  string_number: number
  is_used: boolean
  exclude_from_peer_comparison: boolean
  /** Representative current (A) for the day; null = no comparable data. */
  repr_current: number | null
  /** Completeness gate failed for this string (logger gap) — excluded from the pool, scored null. */
  insufficient_data: boolean
}

export interface PerfStringResult {
  string_number: number
  /** DISPLAY value: MIN(raw, PERF_DISPLAY_MAX=100), or null when not scoreable. */
  performance: number | null
  /** UNCAPPED ratio %, kept for sensor-fault visibility (e.g. ~300% CT fault). */
  raw_performance: number | null
  band: PerfBand
  peer_median_current: number | null
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

export function scoreStringPerformance(inputs: PerfStringInput[]): PerfStringResult[] {
  // Peer pool excludes: unused, peer-excluded, insufficient-data, and null currents.
  const pool = inputs
    .filter(s => s.is_used && !s.exclude_from_peer_comparison && !s.insufficient_data && s.repr_current != null)
    .map(s => s.repr_current as number)
  const peerMedian = pool.length >= 2 ? median(pool) : null
  const usable = peerMedian != null && peerMedian >= MIN_CURRENT_FOR_COMPARISON

  return inputs.map((s): PerfStringResult => {
    const insufficientData = s.insufficient_data || s.repr_current == null || !usable
    const flags = { isUsed: s.is_used, peerExcluded: s.exclude_from_peer_comparison, insufficientData }
    if (!s.is_used || s.exclude_from_peer_comparison || insufficientData) {
      return {
        string_number: s.string_number,
        performance: null,
        raw_performance: null,
        band: classifyStringPerformance(null, flags),
        peer_median_current: peerMedian,
      }
    }
    const raw = Math.round(((s.repr_current as number) / (peerMedian as number)) * 100)
    const display = Math.min(raw, PERF_DISPLAY_MAX)
    return {
      string_number: s.string_number,
      performance: display,
      raw_performance: raw,
      band: classifyStringPerformance(display, flags),
      peer_median_current: peerMedian,
    }
  })
}

/** Operating availability (%) — sun-up hours the string produced ÷ total sun-up hours. */
export function computeOperatingAvailability(producingHours: number, sunUpHours: number): number | null {
  if (sunUpHours <= 0) return null
  return Math.min((producingHours / sunUpHours) * 100, 100)
}
