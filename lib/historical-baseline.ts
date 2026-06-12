/**
 * Historical "own-trend" baseline for peer-excluded strings (V1).
 *
 * Strings flagged `exclude_from_peer_comparison` (known shaded / different
 * orientation) cannot be fairly compared to their MPPT peers, so instead of a
 * peer ratio we show a SELF-referenced trend: today's representative current vs
 * the string's own ~30-day normal. This is INFORMATIONAL only — it is never a
 * fault, never alerted, and is NOT weather-adjusted in V1 (a low-irradiance day
 * legitimately lowers the ratio).
 *
 * Pure module — no I/O. The drill-down routes read the 30-day own
 * string_daily.avg_current + string_configs.manual_baseline_current and feed
 * them here.
 *
 * Spec ref: Working/6_Thursday_11_June_2026/V1-STRING-PERFORMANCE-IMPLEMENTATION-PLAN.md Task 17.
 */

import { median } from '@/lib/string-performance'
import { PERF_DISPLAY_MAX } from '@/lib/string-health'

export type BaselineSource = 'manual' | '30d' | null

/**
 * Today's representative current as a percentage of the string's own baseline,
 * capped at PERF_DISPLAY_MAX (100) — a string can't be "better than its own
 * normal" in a way that's meaningful to surface. Rounded to a whole percent.
 *
 *   baseline > 0 && todayRepr != null  →  MIN(round(todayRepr / baseline * 100), 100)
 *   otherwise                          →  null
 */
export function computeHistoricalPct(
  todayRepr: number | null,
  baseline: number | null,
): number | null {
  if (baseline == null || baseline <= 0 || todayRepr == null) return null
  return Math.min(Math.round((todayRepr / baseline) * 100), PERF_DISPLAY_MAX)
}

/**
 * Choose the baseline current for the own-trend comparison.
 *   1. `manual` (string_configs.manual_baseline_current) when set and positive.
 *   2. else the median of the last-30-day own string_daily.avg_current values
 *      that are > 0 (skips dead/zero days that would drag the normal down).
 *   3. else null (no baseline yet — show "not enough history").
 */
export function pickBaseline(params: {
  manual: number | null
  history30: number[]
}): { value: number | null; source: BaselineSource } {
  if (params.manual != null && params.manual > 0) {
    return { value: params.manual, source: 'manual' }
  }
  const positives = params.history30.filter((v) => Number.isFinite(v) && v > 0)
  if (positives.length > 0) {
    return { value: median(positives), source: '30d' }
  }
  return { value: null, source: null }
}
