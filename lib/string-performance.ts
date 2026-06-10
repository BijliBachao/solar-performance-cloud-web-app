/**
 * String-level PERFORMANCE (Algorithm v3) — current vs peer-median current.
 * A string's DC current is set by irradiance, not panel count/series length, and
 * is comparable across MPPTs. Compare each string's representative current to the
 * MEDIAN current of its same-inverter, same-orientation peers. No nameplate, no
 * panel_count, no MPPT topology. Industry: SolarEdge ±6% mismatch; DYNVOLT; IET.
 * Spec: Working/5_Tuesday_09_June_2026/STRING-PERFORMANCE-METRIC-REDESIGN-SPEC.md
 * PURE — no I/O.
 */
import { HEALTH_HEALTHY, HEALTH_WARNING, PERF_DISPLAY_CAP, MIN_CURRENT_FOR_COMPARISON } from '@/lib/string-health'

export type PerfStatus = 'healthy' | 'warning' | 'critical' | 'no_data' | 'peer_excluded' | 'unused'

export interface PerfStringInput {
  string_number: number
  is_used: boolean
  exclude_from_peer_comparison: boolean
  /** Representative current (A) for the day; null = no comparable data. */
  repr_current: number | null
}

export interface PerfStringResult {
  string_number: number
  performance: number | null
  status: PerfStatus
  peer_median_current: number | null
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

export function scoreStringPerformance(inputs: PerfStringInput[]): PerfStringResult[] {
  const pool = inputs
    .filter(s => s.is_used && !s.exclude_from_peer_comparison && s.repr_current != null)
    .map(s => s.repr_current as number)
  const peerMedian = pool.length >= 2 ? median(pool) : null
  const usable = peerMedian != null && peerMedian >= MIN_CURRENT_FOR_COMPARISON

  return inputs.map(s => {
    if (!s.is_used) return { string_number: s.string_number, performance: null, status: 'unused', peer_median_current: null }
    if (s.exclude_from_peer_comparison) return { string_number: s.string_number, performance: null, status: 'peer_excluded', peer_median_current: null }
    if (s.repr_current == null || !usable) return { string_number: s.string_number, performance: null, status: 'no_data', peer_median_current: usable ? peerMedian : null }
    const perf = Math.min(Math.round((s.repr_current / (peerMedian as number)) * 100), PERF_DISPLAY_CAP)
    const status: PerfStatus = perf >= HEALTH_HEALTHY ? 'healthy' : perf >= HEALTH_WARNING ? 'warning' : 'critical'
    return { string_number: s.string_number, performance: perf, status, peer_median_current: peerMedian }
  })
}

/** Operating availability (%) — sun-up hours the string produced ÷ total sun-up hours. */
export function computeOperatingAvailability(producingHours: number, sunUpHours: number): number | null {
  if (sunUpHours <= 0) return null
  return Math.min((producingHours / sunUpHours) * 100, 100)
}
