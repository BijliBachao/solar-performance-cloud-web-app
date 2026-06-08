/**
 * String-health DAILY algorithm — Performance-to-Peers (P2P).
 *
 * Used for the Analysis tab, the per-plant donut Prev-day mode, and the NOC
 * fleet donut. For each device-day it:
 *   1. finds the peak-production window (hours whose inverter-total power is
 *      ≥ PEAK_WINDOW_THRESHOLD of the day's peak),
 *   2. averages each string's per-panel power over that window only (so a
 *      24-h average can't smear a peak-time deficit into "healthy"),
 *   3. groups strings by MPPT and compares each against the group MEDIAN.
 *
 * Why this exists: the legacy daily score was
 *   string_avg_current_24h / inverter_avg_current_24h, capped at 100.
 * That smears peak performance across the whole day, ignores panel-count
 * differences, ignores MPPT topology, and anchors on a whole-inverter average.
 * Result: a genuinely weak string (the client's CSI PV10 — worst at peak)
 * reads ~98.6 % "Healthy". This module fixes all of that.
 *
 * Median (not max) anchoring: a single misreading-high string shouldn't drag
 * the whole group's reference up. The LIVE scorer (lib/string-health-live.ts)
 * uses the SAME group-median anchor (since 2026-06-08), so the live donut and
 * the daily view agree by construction.
 *
 * Industry anchor: Alcañiz et al. 2022 (Performance-to-Peers, median-anchored);
 * SolarEdge ±6 % mismatch threshold.
 *
 * PURE — no I/O. The caller loads hourly data and passes it in.
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-ALGORITHM-V2.md §4d
 */

import {
  getEffectivePanelCount,
  perPanelPower,
  bucketSrScore,
  MIN_PEERS_FOR_MPPT_GROUP,
  MIN_PER_PANEL_W_FOR_COMPARISON,
  PEAK_WINDOW_THRESHOLD,
  P2P_CAP,
  type StringStatus,
} from '@/lib/string-health'
import { getMpptGroupKey } from '@/lib/inverter-topology'
import type { SrBucket } from '@/lib/string-health-live'

/** One hour of aggregated data for a single string (from string_hourly). */
export interface DailyHourlySample {
  /** Hour bucket — any stable integer key for the hour (e.g., 0-23 PKT, or epoch-hour). */
  hour: number
  /** Mean string power for that hour, in watts. */
  avg_power_W: number
}

export interface DailyStringInput {
  string_number: number
  /** Optional admin-entered panel count. Null/missing → default fallback. */
  panel_count: number | null | undefined
  /** Admin flag: this physical port is wired to panels. */
  is_used: boolean
  /** Admin flag: exclude from peer comparison (non-standard orientation). */
  exclude_from_peer_comparison: boolean
  /** Hourly power series for the day. May be empty (string had no data). */
  hourly: DailyHourlySample[]
}

export interface DailyStringResult {
  string_number: number
  /** P2P ratio (string per-panel-W / group median per-panel-W), capped at 1.5. */
  p2p: number | null
  /**
   * Score persisted to string_daily.performance for backwards compat:
   * round(p2p × 100, 1). Null when there is no comparable score.
   */
  score_persisted: number | null
  bucket: SrBucket | null
  status: StringStatus
  /** True if panel_count was missing and we used the default. */
  panel_count_is_default: boolean
  /** True if the MPPT topology was a max-strings fallback (lower confidence). */
  topology_is_fallback: boolean
  /** Reason the score is null when applicable (UX badge text). */
  no_score_reason?:
    | 'string_excluded_unused'
    | 'string_peer_excluded'
    | 'no_production_today'
    | 'no_data_in_peak_window'
    | 'insufficient_peers'
    | 'low_irradiance_group'
}

export interface DailyScoringContext {
  deviceId: string
  /** Inverter model from devices.model (may be null for non-Huawei providers). */
  inverterModel: string | null
  /** Inverter max_strings (used for fallback topology when model is null). */
  inverterMaxStrings: number | null
}

/** Median of a non-empty numeric array. Caller guarantees length ≥ 1. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Score every string on a single inverter for one day using the P2P algorithm.
 * Pure function — no I/O. Caller provides already-loaded hourly data.
 */
export function scoreDailyP2P(
  inputs: DailyStringInput[],
  ctx: DailyScoringContext,
): DailyStringResult[] {
  const topologyIsFallback = !ctx.inverterModel || ctx.inverterModel.trim() === ''

  // ── Step 1: Peak-production window ──────────────────────────────────
  // Inverter-total power per hour = sum over USED strings (unused ports carry
  // induction noise that must not inflate or distort the day's peak).
  const hourTotals = new Map<number, number>()
  for (const s of inputs) {
    if (!s.is_used) continue
    for (const h of s.hourly) {
      if (!Number.isFinite(h.avg_power_W) || h.avg_power_W <= 0) continue
      hourTotals.set(h.hour, (hourTotals.get(h.hour) ?? 0) + h.avg_power_W)
    }
  }

  const dayMaxTotal = hourTotals.size > 0 ? Math.max(...hourTotals.values()) : 0
  const peakHours = new Set<number>()
  if (dayMaxTotal > 0) {
    const cutoff = PEAK_WINDOW_THRESHOLD * dayMaxTotal
    for (const [hour, total] of hourTotals) {
      if (total >= cutoff) peakHours.add(hour)
    }
  }

  // Per-string annotation: per-panel power averaged over the peak window only.
  type Annotated = {
    input: DailyStringInput
    per_panel_W: number | null // null = no data in peak window
    panel_count_is_default: boolean
    mpptGroupKey: string
  }

  const annotated: Annotated[] = inputs.map((s) => {
    const { count, isDefault } = getEffectivePanelCount(s.panel_count)
    const mpptGroupKey = getMpptGroupKey(
      ctx.deviceId,
      ctx.inverterModel,
      ctx.inverterMaxStrings,
      s.string_number,
    )

    let per_panel_W: number | null = null
    if (peakHours.size > 0) {
      const peakSamples = s.hourly.filter(
        (h) => peakHours.has(h.hour) && Number.isFinite(h.avg_power_W),
      )
      if (peakSamples.length > 0) {
        const meanPowerW =
          peakSamples.reduce((acc, h) => acc + h.avg_power_W, 0) / peakSamples.length
        per_panel_W = perPanelPower(meanPowerW, count)
      }
    }

    return { input: s, per_panel_W, panel_count_is_default: isDefault, mpptGroupKey }
  })

  // No production anywhere today → no daily score for any string.
  if (peakHours.size === 0) {
    return inputs.map((s) => ({
      string_number: s.string_number,
      p2p: null,
      score_persisted: null,
      bucket: null,
      status: 'OFFLINE' as StringStatus,
      panel_count_is_default: getEffectivePanelCount(s.panel_count).isDefault,
      topology_is_fallback: topologyIsFallback,
      no_score_reason: 'no_production_today' as const,
    }))
  }

  // ── Step 2: Build peer pools by MPPT group ──────────────────────────
  // Comparable = used, not peer-excluded, and has data in the peak window.
  const isComparable = (a: Annotated) =>
    a.input.is_used &&
    !a.input.exclude_from_peer_comparison &&
    a.per_panel_W !== null

  const groupedPool = new Map<string, Annotated[]>()
  for (const a of annotated) {
    if (!isComparable(a)) continue
    const arr = groupedPool.get(a.mpptGroupKey) || []
    arr.push(a)
    groupedPool.set(a.mpptGroupKey, arr)
  }

  // Groups below the peer minimum collapse into a device-wide fallback pool.
  const deviceWideFallback: Annotated[] = []
  for (const [key, pool] of groupedPool) {
    if (pool.length < MIN_PEERS_FOR_MPPT_GROUP) {
      deviceWideFallback.push(...pool)
      groupedPool.delete(key)
    }
  }
  const fallbackPoolValid = deviceWideFallback.length >= MIN_PEERS_FOR_MPPT_GROUP

  // ── Step 3: Median (anchor) + MAX (low-irradiance gate) per-panel-W per group ──
  // The ratio anchors on the MEDIAN, but the deep-shade gate reads the group
  // MAX — identical to scoreLiveSr (audit 2026-06-08), so a borderline group is
  // suppressed on the daily/NOC donut exactly when it is on the live donut.
  const medianByGroup = new Map<string, number>()
  const maxByGroup = new Map<string, number>()
  for (const [key, pool] of groupedPool) {
    medianByGroup.set(key, median(pool.map((a) => a.per_panel_W!)))
    maxByGroup.set(key, Math.max(...pool.map((a) => a.per_panel_W!)))
  }
  const fallbackMedian = fallbackPoolValid
    ? median(deviceWideFallback.map((a) => a.per_panel_W!))
    : 0
  const fallbackMax = fallbackPoolValid
    ? Math.max(...deviceWideFallback.map((a) => a.per_panel_W!))
    : 0

  // ── Step 4: Score each string ───────────────────────────────────────
  return annotated.map((a) => {
    const base = {
      string_number: a.input.string_number,
      panel_count_is_default: a.panel_count_is_default,
      topology_is_fallback: topologyIsFallback,
    }

    // Override layers (mirror the LIVE algorithm's exclusion order).
    if (!a.input.is_used) {
      return { ...base, p2p: null, score_persisted: null, bucket: null, status: 'OFFLINE', no_score_reason: 'string_excluded_unused' }
    }
    if (a.input.exclude_from_peer_comparison) {
      return { ...base, p2p: null, score_persisted: null, bucket: null, status: 'NORMAL', no_score_reason: 'string_peer_excluded' }
    }
    if (a.per_panel_W === null) {
      // Producing day overall, but this string had no data during peak hours.
      return { ...base, p2p: null, score_persisted: null, bucket: null, status: 'OFFLINE', no_score_reason: 'no_data_in_peak_window' }
    }

    const inMpptGroup = groupedPool.has(a.mpptGroupKey)
    if (!inMpptGroup && !fallbackPoolValid) {
      return { ...base, p2p: null, score_persisted: null, bucket: null, status: 'NORMAL', no_score_reason: 'insufficient_peers' }
    }

    const medianW = inMpptGroup ? medianByGroup.get(a.mpptGroupKey)! : fallbackMedian
    const maxW = inMpptGroup ? maxByGroup.get(a.mpptGroupKey)! : fallbackMax
    if (maxW < MIN_PER_PANEL_W_FOR_COMPARISON) {
      // Even the best string in the group is barely producing — comparison
      // meaningless. Gate on MAX (mirrors scoreLiveSr) so live and daily agree.
      return { ...base, p2p: null, score_persisted: null, bucket: null, status: 'NORMAL', no_score_reason: 'low_irradiance_group' }
    }

    const p2p = Math.min(a.per_panel_W / medianW, P2P_CAP)
    return {
      ...base,
      p2p,
      score_persisted: Math.round(p2p * 100 * 10) / 10,
      bucket: bucketSrScore(p2p),
      status: 'NORMAL' as StringStatus,
    }
  })
}
