/**
 * String-health LIVE algorithm — Self-Referencing Ratio (SR).
 *
 * Used for the Plant-tab live chart and the Last-3h donut. Computes
 * per-panel power for each string, groups by MPPT (or inverter if unknown),
 * and compares each string against the BEST peer in its group.
 *
 * Industry anchor:
 *   - Buerhop et al. 2023 (Progress in Photovoltaics, Forschungszentrum Jülich):
 *     validated on 9 MWp plant with 1,719 strings using exactly this SR method
 *   - SolarEdge ±6% mismatch threshold: same idea at module level
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-ALGORITHM-V2.md §4c
 */

import {
  getEffectivePanelCount,
  perPanelPower,
  bucketSrScore,
  MIN_PEERS_FOR_MPPT_GROUP,
  MIN_PER_PANEL_W_FOR_COMPARISON,
  ACTIVE_CURRENT_THRESHOLD,
  type StringStatus,
} from '@/lib/string-health'
import { getMpptGroupKey } from '@/lib/inverter-topology'

export type SrBucket = 'healthy' | 'abnormal' | 'critical'

export interface LiveStringInput {
  string_number: number
  voltage: number
  current: number
  power: number
  /** Optional admin-entered panel count. Null/missing → default fallback. */
  panel_count: number | null | undefined
  /** Admin flag: this physical port is wired to panels. */
  is_used: boolean
  /** Admin flag: exclude from peer comparison (non-standard orientation). */
  exclude_from_peer_comparison: boolean
  /** True if this string's latest reading is older than STALE_MS. */
  stale: boolean
}

export interface LiveStringResult {
  string_number: number
  /** The SR ratio (0 to ~1, capped at 1.5 to keep arithmetic stable) */
  sr: number | null
  bucket: SrBucket | null
  /** Detected status (drives override priorities below) */
  status: StringStatus
  /** True if panel_count was missing and we used the default */
  panel_count_is_default: boolean
  /** True if the MPPT topology was a max-strings fallback (lower confidence) */
  topology_is_fallback: boolean
  /** True when a critical SR verdict was suppressed because the string is at or
   *  above its peer-group MEDIAN — the max-anchor pinned by one overperformer
   *  cannot make a median-or-better string "the weak one" (audit 2026-06-07). */
  contradiction_suppressed?: boolean
  /** Reason the score is null when applicable (UX badge text) */
  no_score_reason?:
    | 'string_excluded_unused'
    | 'string_peer_excluded'
    | 'string_stale'
    | 'string_open_circuit'
    | 'string_offline'
    | 'insufficient_peers'
    | 'low_irradiance_group'
    | 'low_sun'
}

export interface LiveScoringContext {
  deviceId: string
  /** Inverter model from devices.model (may be null for non-Huawei providers) */
  inverterModel: string | null
  /** Inverter max_strings (used for fallback topology when model is null) */
  inverterMaxStrings: number | null
  /** Sun-elevation arming for the plant. When false (sun below the string-health
   *  floor), NO string is scored — open-circuit standby (V present, ~0 A) and the
   *  dawn/dusk ramp are NOT faults. Computed by the caller from clamped plant
   *  coords, exactly like the alert path's alertsArmed (audit 2026-06-07: the
   *  live donut had no sun gate, so CSI standby voltage read as a sea of
   *  "open-circuit critical" at FANZ). */
  armed: boolean
}

/**
 * Score every string on a single inverter using the SR algorithm.
 * Pure function — no I/O. Caller provides already-loaded data.
 *
 * Algorithm:
 *   1. Filter peer pool: is_used=true AND exclude_from_peer_comparison=false AND !stale
 *   2. For each string, compute per_panel_W = power / effective_panel_count
 *   3. Group peer pool by MPPT (or by device if topology unknown)
 *   4. For each MPPT group:
 *        - If group has < MIN_PEERS, merge with other strings on the inverter (fallback)
 *        - If group has 0 producing peers, mark all in group as low_irradiance_group (no score)
 *        - Else: SR_string = string.per_panel_W / max(peer.per_panel_W)
 *
 * Overrides (applied AFTER scoring):
 *   - is_used = false        → no score, status = OFFLINE (excluded entirely)
 *   - peer_excluded = true   → no score, status = NORMAL (treated as fine)
 *   - stale                  → no score, status = OFFLINE
 *   - V > 0, I < threshold   → no score, status = OPEN_CIRCUIT (Critical override)
 *   - V == 0, I == 0         → no score, status = OFFLINE (nighttime)
 */
export function scoreLiveSr(
  inputs: LiveStringInput[],
  ctx: LiveScoringContext,
): LiveStringResult[] {
  // ── Step 1: Compute per-panel power per string + classify status ──
  type Annotated = LiveStringInput & {
    per_panel_W: number
    panel_count_is_default: boolean
    mpptGroupKey: string
    initialStatus: StringStatus
    excluded: boolean
  }

  const annotated: Annotated[] = inputs.map((s) => {
    const { count, isDefault } = getEffectivePanelCount(s.panel_count)
    const per_panel_W = perPanelPower(s.power, count)
    const mpptGroupKey = getMpptGroupKey(
      ctx.deviceId,
      ctx.inverterModel,
      ctx.inverterMaxStrings,
      s.string_number,
    )

    // Classify status from raw V/I (independent of peer comparison)
    let initialStatus: StringStatus
    let excluded = false
    if (!s.is_used) {
      initialStatus = 'OFFLINE' // unused port — treated as if it doesn't exist
      excluded = true
    } else if (s.stale) {
      initialStatus = 'OFFLINE'
      excluded = true
    } else if (s.current < ACTIVE_CURRENT_THRESHOLD && s.voltage > 0) {
      initialStatus = 'OPEN_CIRCUIT'
      excluded = true
    } else if (s.current < ACTIVE_CURRENT_THRESHOLD) {
      initialStatus = 'OFFLINE' // V=0 && I=0 → nighttime
      excluded = true
    } else if (s.exclude_from_peer_comparison) {
      initialStatus = 'NORMAL' // admin says don't compare — trust it
      excluded = true
    } else {
      initialStatus = 'NORMAL' // candidate for peer comparison
    }

    return {
      ...s,
      per_panel_W,
      panel_count_is_default: isDefault,
      mpptGroupKey,
      initialStatus,
      excluded,
    }
  })

  // ── Step 2: Build peer pools by MPPT group (only NORMAL, non-excluded) ──
  const groupedPool = new Map<string, Annotated[]>()
  for (const s of annotated) {
    if (s.excluded || s.initialStatus !== 'NORMAL') continue
    const arr = groupedPool.get(s.mpptGroupKey) || []
    arr.push(s)
    groupedPool.set(s.mpptGroupKey, arr)
  }

  // Determine if any MPPT group is too small — those fall back to inverter-level
  const deviceWideFallback: Annotated[] = []
  for (const [key, pool] of groupedPool) {
    if (pool.length < MIN_PEERS_FOR_MPPT_GROUP) {
      deviceWideFallback.push(...pool)
      groupedPool.delete(key)
    }
  }
  // The fallback pool itself needs to meet MIN_PEERS — otherwise just don't compare
  const fallbackPoolValid = deviceWideFallback.length >= MIN_PEERS_FOR_MPPT_GROUP

  // ── Step 3: Compute peer max per group ──
  const peerMaxByGroup = new Map<string, number>()
  for (const [key, pool] of groupedPool) {
    const maxW = Math.max(...pool.map((s) => s.per_panel_W))
    peerMaxByGroup.set(key, maxW)
  }

  const fallbackPeerMax = fallbackPoolValid
    ? Math.max(...deviceWideFallback.map((s) => s.per_panel_W))
    : 0

  // Group MEDIANS — the contradiction guard's reference. The SR anchor is the
  // group MAX (one overperformer can pin it high); a string flagged critical
  // against that max while sitting at/above the group MEDIAN is a max-anchor
  // false positive, not a real fault, so we suppress it (audit 2026-06-07).
  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const peerMedianByGroup = new Map<string, number>()
  for (const [key, pool] of groupedPool) {
    peerMedianByGroup.set(key, median(pool.map((s) => s.per_panel_W)))
  }
  const fallbackPeerMedian = fallbackPoolValid
    ? median(deviceWideFallback.map((s) => s.per_panel_W))
    : 0

  // ── Step 4: Score each string ──
  const topologyIsFallback = !ctx.inverterModel || ctx.inverterModel.trim() === ''

  return annotated.map((s) => {
    // Sun gate (uniform with the alert path): below the elevation floor no string
    // is scored. CSI inverters hold standby voltage with ~0 A overnight/at dawn,
    // which the OPEN_CIRCUIT override would otherwise flag CRITICAL for every
    // string. Suppress to an unscored OFFLINE state (status OFFLINE ⇒ the donut's
    // openCircuit flag is false ⇒ counts as no-data, never critical).
    if (!ctx.armed) {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: 'OFFLINE',
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'low_sun',
      }
    }

    // Handle exclusions / non-comparable states first
    if (!s.is_used) {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: s.initialStatus,
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'string_excluded_unused',
      }
    }
    if (s.stale) {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: s.initialStatus,
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'string_stale',
      }
    }
    if (s.initialStatus === 'OPEN_CIRCUIT') {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: 'critical', // override: physical fault wins
        status: s.initialStatus,
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'string_open_circuit',
      }
    }
    if (s.initialStatus === 'OFFLINE') {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: s.initialStatus,
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'string_offline',
      }
    }
    if (s.exclude_from_peer_comparison) {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: 'NORMAL',
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'string_peer_excluded',
      }
    }

    // Determine which peer pool to use
    const inMpptGroup = groupedPool.has(s.mpptGroupKey)
    const peerMax = inMpptGroup
      ? peerMaxByGroup.get(s.mpptGroupKey)!
      : fallbackPeerMax

    if (!inMpptGroup && !fallbackPoolValid) {
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: 'NORMAL',
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'insufficient_peers',
      }
    }

    if (peerMax < MIN_PER_PANEL_W_FOR_COMPARISON) {
      // Whole MPPT group is in low-light / deep shade — can't compare
      return {
        string_number: s.string_number,
        sr: null,
        bucket: null,
        status: 'NORMAL',
        panel_count_is_default: s.panel_count_is_default,
        topology_is_fallback: topologyIsFallback,
        no_score_reason: 'low_irradiance_group',
      }
    }

    const sr = s.per_panel_W / peerMax
    const cappedSr = Math.min(sr, 1.5) // keep arithmetic stable
    let bucket = bucketSrScore(cappedSr)

    // Contradiction guard: a string can only be "critical" if it is genuinely
    // below its peers. If it is flagged critical against the group MAX yet sits
    // at/above the group MEDIAN, the max was pinned by an outlier overperformer
    // and this string is not the weak one — suppress to healthy + flag.
    let contradictionSuppressed = false
    if (bucket === 'critical') {
      const med = inMpptGroup
        ? peerMedianByGroup.get(s.mpptGroupKey)!
        : fallbackPeerMedian
      if (med > 0 && s.per_panel_W >= med) {
        bucket = 'healthy'
        contradictionSuppressed = true
      }
    }

    return {
      string_number: s.string_number,
      sr: cappedSr,
      bucket,
      status: 'NORMAL',
      panel_count_is_default: s.panel_count_is_default,
      topology_is_fallback: topologyIsFallback,
      ...(contradictionSuppressed ? { contradiction_suppressed: true } : {}),
    }
  })
}

/**
 * Summary stats for an inverter — used for the badge UI on Plant tab and
 * to decide whether to show the "panel count incomplete" warning.
 */
export interface LiveScoringSummary {
  inverter_id: string
  total_strings: number
  excluded_strings: number  // is_used=false + peer_excluded + stale + open_circuit
  scored_strings: number    // strings with a numeric SR
  using_default_panel_count: number
  topology_is_fallback: boolean
  bucket_counts: { healthy: number; abnormal: number; critical: number }
}

export function summarizeLiveScoring(
  deviceId: string,
  results: LiveStringResult[],
): LiveScoringSummary {
  const bucket_counts = { healthy: 0, abnormal: 0, critical: 0 }
  let excluded = 0
  let scored = 0
  let withDefault = 0
  let topologyFallback = false

  for (const r of results) {
    if (r.panel_count_is_default) withDefault++
    if (r.topology_is_fallback) topologyFallback = true
    if (r.bucket) {
      bucket_counts[r.bucket]++
      if (r.sr !== null) scored++
    }
    if (r.no_score_reason && r.no_score_reason !== 'string_peer_excluded') excluded++
  }

  return {
    inverter_id: deviceId,
    total_strings: results.length,
    excluded_strings: excluded,
    scored_strings: scored,
    using_default_panel_count: withDefault,
    topology_is_fallback: topologyFallback,
    bucket_counts,
  }
}
