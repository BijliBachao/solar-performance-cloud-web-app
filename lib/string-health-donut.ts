/**
 * String-Health Donut v2 — Bucketing & Aggregation
 *
 * Single source of truth for the 3-bucket Healthy / Abnormal / Critical
 * taxonomy used by the per-plant donut chart. Built in response to client
 * feedback (2026-05-24): the previous 5-bucket real-time donut showed
 * scary dawn/dusk/nighttime states that worried customers without
 * indicating actual problems. This module computes a settled, window-
 * based view that ignores transient noise.
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md
 *
 * Override order (first match wins):
 *   1. is_used: false           → excluded entirely
 *   2. peer_excluded: true      → excluded entirely
 *   3. open_circuit (in window) → Critical
 *   4. no data (in window)      → Abnormal (must be is_used: true)
 *   5. score                    → V1 classifier (classifyStringPerformance →
 *                                 perfBandToDonutBucket), so the cell colour and
 *                                 the donut arc derive from ONE source.
 */

import { classifyStringPerformance, perfBandToDonutBucket } from '@/lib/string-health'

/** Fraction of window samples that must show V>0 + I<0.1 for OPEN_CIRCUIT override. */
export const DONUT_OPEN_CIRCUIT_THRESHOLD = 0.5

export type DonutBucket = 'healthy' | 'abnormal' | 'critical'

/**
 * Per-string input to the donut bucketer. All flags come from data already
 * computed elsewhere (string_daily / string_hourly / string_configs).
 */
export interface DonutInput {
  /** IEC health_score for the window. null = no data in window. */
  healthScore: number | null
  /** Admin flag: string is wired and producing (vs. empty PV port). */
  isUsed: boolean
  /** Admin flag: non-standard orientation, excluded from peer comparison. */
  peerExcluded: boolean
  /**
   * Computed: did this string spend > DONUT_OPEN_CIRCUIT_THRESHOLD of window
   * samples in an open-circuit state (V > 0 with I < ACTIVE_CURRENT_THRESHOLD)?
   */
  openCircuit: boolean
  /**
   * Optional pre-computed bucket — used ONLY by the live "Last-3h" donut, which
   * buckets on the SR 0.94/0.85 anchor (bucketSrScore), NOT the V1 daily 95/85/60
   * bands. When set, it overrides the V1 score path below (after the exclusion /
   * open-circuit / no-data overrides) so the live-SR donut stays in lockstep with
   * the live plant chart + SR alert severities, decoupled from the daily metric.
   * Daily (settled / NOC) inputs leave this undefined → V1 score path.
   */
  bucket?: DonutBucket
}

export interface DonutCounts {
  healthy: number
  abnormal: number
  critical: number
  /** Subset of `abnormal` — strings with no data in window. Surface for tooltip. */
  noData: number
}

export interface DonutBreakdown {
  healthy: { byScore: number }
  abnormal: { byScore: number; noData: number }
  critical: { byScore: number; openCircuit: number }
}

export interface DonutAggregate {
  totalStrings: number
  counts: DonutCounts
  breakdown: DonutBreakdown
  excluded: { unused: number; nonStandard: number }
}

/**
 * Bucket a single string's window-aggregated state into one of the 3 donut
 * buckets, or null if the string is excluded from the donut entirely.
 *
 * Pure function. No I/O. Safe to call inside tight loops.
 */
export function bucketDonutStatus(input: DonutInput): DonutBucket | null {
  // Rule #1 — admin marked the port as unused (no panel wired)
  if (!input.isUsed) return null

  // Rule #2 — admin excluded from peer comparison (non-standard orientation)
  if (input.peerExcluded) return null

  // Rule #3 — open-circuit override (real wiring fault, may not reflect in score)
  if (input.openCircuit) return 'critical'

  // Rule #4 — no data in window, but string is supposed to be reporting.
  // The donut folds no-data into Abnormal (not its own slice) — kept here, not
  // delegated, so we preserve this taxonomy choice. (insufficient_data would
  // map to 'no_data', which the donut surfaces as the noData subset of abnormal
  // via aggregateForDonut; this guard ensures the bucket itself is 'abnormal'.)
  if (input.healthScore === null) return 'abnormal'

  // Live-SR override — the live "Last-3h" donut supplies an SR-anchored bucket
  // (bucketSrScore at 0.94/0.85); use it directly so the live donut is NOT moved
  // onto the V1 daily bands (which would contradict the live chart + SR alerts).
  if (input.bucket) return input.bucket

  // Rule #5 — score path delegates to the V1 classifier. is_used/peer_excluded
  // already handled above (rules #1/#2), so flag them false here; the donut
  // buckets {normal→healthy, watch+underperforming→abnormal, serious+dead→
  // critical} come straight from perfBandToDonutBucket — the SAME source the
  // /analysis cells use, so a string's arc and its cell can never disagree.
  const band = classifyStringPerformance(input.healthScore, {
    isUsed: true,
    peerExcluded: false,
    insufficientData: false,
  })
  const bucket = perfBandToDonutBucket(band)
  // band is one of normal/watch/underperforming/serious_fault/dead here
  // (non-null score, used, comparable) → bucket is healthy|abnormal|critical.
  return (bucket ?? 'abnormal') as DonutBucket
}

/**
 * Aggregate a list of string inputs into donut-ready counts + breakdown.
 * The breakdown lets the UI explain "why" each bucket has its count
 * (e.g., "4 critical = 2 by score + 2 by 0A fault").
 *
 * totalStrings is the number of strings VISIBLE in the donut — i.e., it
 * does not include excluded (unused or non-standard) strings. Those are
 * surfaced separately under `excluded` so the UI can show a footnote.
 */
export function aggregateForDonut(strings: DonutInput[]): DonutAggregate {
  const counts: DonutCounts = { healthy: 0, abnormal: 0, critical: 0, noData: 0 }
  const breakdown: DonutBreakdown = {
    healthy: { byScore: 0 },
    abnormal: { byScore: 0, noData: 0 },
    critical: { byScore: 0, openCircuit: 0 },
  }
  const excluded = { unused: 0, nonStandard: 0 }
  let totalStrings = 0

  for (const s of strings) {
    if (!s.isUsed) {
      excluded.unused += 1
      continue
    }
    if (s.peerExcluded) {
      excluded.nonStandard += 1
      continue
    }

    const bucket = bucketDonutStatus(s)
    if (bucket === null) continue // defensive — shouldn't reach with above guards

    totalStrings += 1
    counts[bucket] += 1

    if (bucket === 'critical') {
      if (s.openCircuit) breakdown.critical.openCircuit += 1
      else breakdown.critical.byScore += 1
    } else if (bucket === 'abnormal') {
      if (s.healthScore === null) {
        breakdown.abnormal.noData += 1
        counts.noData += 1
      } else {
        breakdown.abnormal.byScore += 1
      }
    } else {
      breakdown.healthy.byScore += 1
    }
  }

  return { totalStrings, counts, breakdown, excluded }
}
