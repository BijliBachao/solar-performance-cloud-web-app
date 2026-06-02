/**
 * String Health Classification — Single Source of Truth
 *
 * ALL string health thresholds and classification logic lives HERE.
 * No other file may define thresholds or inline classification logic.
 *
 * Used by:
 *   - lib/poller-utils.ts (alerts, daily/hourly aggregates)
 *   - app/api/plants/[code]/strings/route.ts (live status)
 *   - app/api/plants/[code]/monthly-health/route.ts (monthly diagnosis)
 *   - app/api/admin/analysis/string-level/route.ts (analysis bucketing)
 *   - app/api/dashboard/analysis/string-level/route.ts (org analysis)
 *   - components/shared/InverterDetailSection.tsx (display)
 *   - components/shared/MonthlyHealthReport.tsx (display)
 *   - components/shared/FaultDiagnosisPanel.tsx (display)
 *   - components/shared/PerformanceCell.tsx (cell colors)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Minimum current (amps) for a string to be considered "active/producing" */
export const ACTIVE_CURRENT_THRESHOLD = 0.1

/**
 * Upper bound for a single-string current reading (amps).
 * Above this indicates a CT (current transformer) sensor malfunction —
 * a miscalibrated or broken sensor reporting impossibly high values.
 *
 * Physical reality check:
 *   - Typical residential/commercial PV string: 6–12 A
 *   - Utility-grade parallel string bundles: up to 20–30 A
 *   - 50 A is a conservative upper bound — any value above is a fault
 *
 * Usage: exclude such rows from fleet-level aggregates (energy today,
 * live power, sparklines) so dashboards show real values. Rows remain
 * in the DB for per-string diagnostic views where the fault must be visible.
 */
export const MAX_STRING_CURRENT_A = 50

/**
 * Upper bound for a single-string power reading (watts).
 *
 * Physics check:
 *   - Max reasonable string voltage: ~500 V
 *   - Max reasonable string current: ~50 A (see MAX_STRING_CURRENT_A)
 *   - P = V × I → 500 V × 50 A = 25 kW per string hard ceiling
 *
 * Some CT faults report current below the current threshold while
 * reporting absurd power (e.g., 5 A of "current" but 50 kW of "power" —
 * which violates Ohm's law). This second filter catches those rows.
 *
 * Usage: combine with MAX_STRING_CURRENT_A in all aggregate queries so
 * the fleet sums / energy totals / hero sparkline reflect physics, not
 * broken sensors.
 */
export const MAX_STRING_POWER_W = 25_000

/**
 * Fleet Health coverage floor — fraction of yesterday's reporting
 * strings that must also report today for the fleet-health KPI to be
 * meaningful. Below this, we return null and show "N of M strings
 * reporting" instead of a misleading average over the tiny set.
 */
export const HEALTH_COVERAGE_MIN_RATIO = 0.5

/** Minimum number of active strings required for peer comparison */
export const MIN_PEERS_FOR_COMPARISON = 2

/** Minimum average current (amps) for peer comparison to be meaningful */
export const MIN_AVG_FOR_COMPARISON = 1.0

// ── Real-time gap thresholds (% below peer average) ─────────────────
/** Gap % above which a string is CRITICAL */
export const GAP_CRITICAL = 50
/** Gap % above which a string is WARNING */
export const GAP_WARNING = 25
/** Gap % above which an alert is INFO (alerts only, live view stays NORMAL) */
export const GAP_INFO = 10

// ── Health score buckets (daily/monthly historical views) ───────────
/** Health score >= this is "Healthy" */
export const HEALTH_HEALTHY = 90
/** Health score >= this (but < HEALTH_HEALTHY) is "Warning". Below = Critical */
export const HEALTH_WARNING = 50

// ── Display gradation stops (cell coloring in tables) ───────────────
/** Score >= this gets mild yellow (between HEALTHY and WARNING) */
export const HEALTH_CAUTION = 75
/** Score >= this gets deep red (below WARNING) */
export const HEALTH_SEVERE = 25

// ── Plant health_state database values ──────────────────────────────
export const PLANT_HEALTH_HEALTHY = 3
export const PLANT_HEALTH_FAULTY = 2
export const PLANT_HEALTH_DISCONNECTED = 1

/**
 * Plant connectivity recency window. A plant that has reported within this
 * window is "connected" regardless of a stale/lagging vendor status flag —
 * vendor plant-status fields routinely report Offline/Waiting at sunrise and
 * overnight even while data is streaming (confirmed live 2026-05-24/25:
 * 9 of 11 Growatt plants flagged "disconnected" had reported within 6 min).
 * Only genuine silence (> this window) is treated as disconnected.
 */
export const RECENT_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Vendor-feed staleness threshold. If the inverter's `lastReportTime` (as
 * reported by the vendor cloud's realtime endpoint) is older than this, the
 * cloud is serving a cached snapshot and the poller MUST skip writes —
 * otherwise the same frozen V/I/P payload gets re-written every cycle and
 * every string looks "dead" against itself.
 *
 * Confirmed live 2026-06-01 via direct probe of /open-api/device/data: all
 * 5 CSI inverters had identical lastReportTime in a 10-min window on
 * 2026-05-25, returning the same cached realData on every poll for 6+ days.
 * 26 spurious CRITICAL alerts had accumulated before the gate landed.
 *
 * 2 h is a defensive ceiling — healthy vendors update every 5–10 min, and a
 * 2 h gap during operational hours is real silence, not jitter. Tighter
 * thresholds (e.g. 30 min) would false-positive on legitimate vendor blips.
 */
export const VENDOR_FEED_STALE_MS = 2 * 60 * 60 * 1000

/**
 * Pure check: is the vendor's `lastReportTime` older than VENDOR_FEED_STALE_MS?
 * Returns true for null/undefined/empty/unparseable values (we cannot prove
 * freshness → treat as stale, fail-safe). CSI returns "2026-05-25 14:17:28"
 * without TZ marker — `new Date(str)` parses as UTC on EC2 (UTC host),
 * matching the existing mapCsiHealthState convention.
 */
export function isVendorFeedStale(
  lastReportTime: string | Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastReportTime) return true
  const ts =
    lastReportTime instanceof Date
      ? lastReportTime.getTime()
      : new Date(lastReportTime).getTime()
  if (!Number.isFinite(ts)) return true
  return nowMs - ts > VENDOR_FEED_STALE_MS
}

/**
 * Action a poller should take for one device given the vendor's own
 * "last data update" epoch (ms) and the epoch we last wrote for that device.
 *
 *  - 'stale'     → vendor timestamp is older than VENDOR_FEED_STALE_MS: a true
 *                  multi-hour freeze (datalogger offline / cloud serving a dead
 *                  cache). Skip writes, downgrade the plant. Same failure mode
 *                  as CSI 2026-05-25.
 *  - 'duplicate' → vendor timestamp is fresh but UNCHANGED since our last write:
 *                  the vendor publishes slower than we poll (verified live on
 *                  Solis 2026-06-02 — device 1308675217950504187 advanced its
 *                  dataTimestamp only every ~10-30 min while we poll every 5).
 *                  Writing again would store a duplicate physical reading,
 *                  inflating sample counts and skewing aggregates. Skip the
 *                  write, but DO NOT downgrade — the inverter is alive.
 *  - 'fresh'     → new vendor sample since last write: record and proceed.
 *
 * MISSING/UNPARSEABLE timestamp → 'fresh' (FAIL-OPEN). Unlike isVendorFeedStale
 * (which fails safe for CSI's only freshness signal), this helper guards a feed
 * we KNOW reliably carries a timestamp; a transient missing field must not
 * black out an otherwise-working provider. Callers should log the anomaly.
 */
export type VendorFeedAction = 'fresh' | 'duplicate' | 'stale'
export function classifyVendorFeed(
  dataTimestampMs: number | null | undefined,
  lastSeenMs: number | null | undefined,
  nowMs: number = Date.now(),
): VendorFeedAction {
  if (dataTimestampMs == null || !Number.isFinite(dataTimestampMs) || dataTimestampMs <= 0) {
    return 'fresh' // fail-open: cannot judge → let the write through
  }
  if (nowMs - dataTimestampMs > VENDOR_FEED_STALE_MS) return 'stale'
  if (lastSeenMs != null && dataTimestampMs === lastSeenMs) return 'duplicate'
  return 'fresh'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inverter connectivity / data-freshness (plant page + NOC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Spec: docs/superpowers/specs/2026-06-02-inverter-connectivity-freshness-visibility-design.md
// Two signals make a freeze visible on ALL providers (verified 2026-06-02:
// Huawei/Sungrow expose no vendor data-timestamp): the vendor's own data-time
// where available, plus value-change detection via a reading signature.

export type ConnectivityStatus = 'live' | 'frozen' | 'offline' | 'idle'

/**
 * Stable, order-independent signature of a device's strings. Identical readings
 * → identical signature; any V/I/P change → different signature. Pure JS hash
 * (no node:crypto) so this module stays safe to import from any bundle. Persist
 * to devices.last_reading_sig for restart-safe value-change detection.
 */
export function readingSignature(
  strings: { string_number: number; voltage: number; current: number; power: number }[],
): string {
  const body = [...strings]
    .sort((a, b) => a.string_number - b.string_number)
    .map((s) => `${s.string_number}:${s.voltage.toFixed(2)}:${s.current.toFixed(3)}:${s.power.toFixed(2)}`)
    .join('|')
  // Two independent FNV-1a passes (different offsets) → 16 hex chars. Collision
  // risk is negligible for consecutive-reading comparison of one device.
  const fnv = (str: string, seed: number): string => {
    let h = seed >>> 0
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  return fnv(body, 0x811c9dc5) + fnv(body, 0x9e3779b1)
}

/**
 * Inverter connectivity status.
 * @param effectiveFreshAtMs newest evidence of genuinely-new data
 *   = max(vendor_last_data_at, reading_changed_at) in epoch ms, or null.
 * @param lastWriteAtMs MAX(string_measurements.timestamp) — when WE last wrote, or null.
 * @param sunUp from lib/solar-geometry.ts isDaylight() for the plant lat/long.
 *
 *   idle    — sun down: no data expected, not an alarm.
 *   live    — fresh data within VENDOR_FEED_STALE_MS (2h).
 *   frozen  — stale data ≥2h but still receiving rows (<STALE_MS): stuck-but-responding.
 *   offline — stale data and not receiving rows (or never any): no response / gated-stopped.
 */
export function classifyConnectivity(
  effectiveFreshAtMs: number | null,
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
): ConnectivityStatus {
  if (!sunUp) return 'idle'
  // age <= 2h is "live" — matches isVendorFeedStale's `age > 2h` staleness cutoff
  // (a feed the gate calls fresh is live here; one it calls stale is not).
  if (effectiveFreshAtMs != null && nowMs - effectiveFreshAtMs <= VENDOR_FEED_STALE_MS) return 'live'
  if (lastWriteAtMs != null && nowMs - lastWriteAtMs < STALE_MS) return 'frozen'
  return 'offline'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Algorithm v2 — Self-Referencing Ratio (SR) / Performance-to-Peers (P2P)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-ALGORITHM-V2.md
// Industry anchor: SolarEdge ±6% mismatch threshold + Buerhop 2023 SR
// + Alcañiz 2022 P2P.

/**
 * Default panel count used when string_configs.panel_count is null.
 * The fleet currently has ~50% of strings without panel_count populated.
 * The default lets the algorithm work for everyone; the UI surfaces a
 * "panel count incomplete" badge per inverter so admins know to fill it in.
 */
export const PANEL_COUNT_DEFAULT = 16

/** SR/P2P ratio >= this is Healthy. Anchored on SolarEdge ±6% mismatch. */
export const SR_HEALTHY = 0.94
/** SR/P2P ratio >= this is Abnormal. Below = Critical. */
export const SR_ABNORMAL = 0.85

/** Minimum number of peers within an MPPT group before we trust the comparison. */
export const MIN_PEERS_FOR_MPPT_GROUP = 2

/**
 * Hour qualifies as "peak production" when the inverter's total hourly power
 * is at least this fraction of the day's peak. Filters out dawn / dusk / cloudy
 * periods where comparisons are noisy.
 */
export const PEAK_WINDOW_THRESHOLD = 0.5

/**
 * Per-panel power floor (W) below which we consider production "too low to
 * meaningfully compare". Avoids dividing by ~0 when a whole MPPT group is in
 * deep shade.
 */
export const MIN_PER_PANEL_W_FOR_COMPARISON = 5

/** Upper clamp for an SR/P2P ratio — keeps arithmetic stable when a peer pool
 * has a very weak anchor (a string can read ≥1.5× the group median/max). */
export const P2P_CAP = 1.5

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Algorithm v2 primitives (pure functions; safe in hot loops)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns the effective panel count for a string, falling back to
 * PANEL_COUNT_DEFAULT when admin hasn't populated string_configs.panel_count.
 * The `isDefault` flag lets callers surface the "panel count incomplete" badge.
 */
export function getEffectivePanelCount(
  panelCount: number | null | undefined,
): { count: number; isDefault: boolean } {
  if (panelCount && panelCount > 0 && Number.isFinite(panelCount)) {
    return { count: panelCount, isDefault: false }
  }
  return { count: PANEL_COUNT_DEFAULT, isDefault: true }
}

/**
 * Per-panel power in watts. The fundamental normalisation that makes strings
 * with different panel counts comparable. A 17-panel string and a 16-panel
 * string at the same irradiance and panel rating have similar per-panel-W —
 * but very different absolute current and power.
 */
export function perPanelPower(power_W: number, panelCount: number): number {
  return power_W / Math.max(panelCount, 1)
}

/**
 * Bucket an SR/P2P ratio into the donut taxonomy.
 * Returns null when the score is undefined/null (no-data — caller handles).
 * Same 3-bucket taxonomy as the donut v2 work; this just adds a different
 * input mapping (SR ratio instead of 0-100 health_score).
 */
export function bucketSrScore(
  sr: number | null | undefined,
): 'healthy' | 'abnormal' | 'critical' | null {
  if (sr === null || sr === undefined || !Number.isFinite(sr)) return null
  if (sr >= SR_HEALTHY) return 'healthy'
  if (sr >= SR_ABNORMAL) return 'abnormal'
  return 'critical'
}

/**
 * Map an SR/P2P ratio onto the legacy 0–100 health_score scale so that the
 * existing `bucketHealthScore` (HEALTH_HEALTHY=90 / HEALTH_WARNING=50) and the
 * donut SQL (which bucket on the same boundaries) reproduce the P2P buckets
 * EXACTLY — letting the daily algorithm flow through every existing consumer
 * (Analysis tab, Prev-day donut, NOC donut, dashboard) with no read-side change.
 *
 * Breakpoints are anchored so bucketHealthScore(map(p2p)) === bucketSrScore(p2p):
 *   p2p ≥ SR_HEALTHY (0.94)  → [90,100]  → healthy
 *   p2p ≥ SR_ABNORMAL (0.85) → [50,90)   → warning  (== "abnormal")
 *   p2p <  SR_ABNORMAL       → [0,50)    → critical
 *   p2p == null              → null      → no_data
 * Piecewise-linear and monotonic, so averages/sparklines stay meaningful.
 */
export function p2pToHealthScore(p2p: number | null | undefined): number | null {
  if (p2p === null || p2p === undefined || !Number.isFinite(p2p)) return null
  let raw: number
  if (p2p >= SR_HEALTHY) {
    const frac = Math.min((p2p - SR_HEALTHY) / (P2P_CAP - SR_HEALTHY), 1)
    raw = 90 + frac * 10
  } else if (p2p >= SR_ABNORMAL) {
    raw = 50 + ((p2p - SR_ABNORMAL) / (SR_HEALTHY - SR_ABNORMAL)) * 40
  } else {
    raw = Math.max(0, (p2p / SR_ABNORMAL) * 50)
  }
  // FLOOR to 2 decimals (not round). The result is persisted as Decimal(5,2)
  // and re-bucketed by consumers at the 90/50 boundaries. Since the band
  // boundaries map EXACTLY to 90 and 50, rounding-half-up could lift a value
  // just under a threshold (e.g. p2p 0.9399 → 89.9956 → 90.00 → "healthy"),
  // silently mis-bucketing the borderline strings this feature exists to flag.
  // Flooring keeps sub-threshold values below the threshold.
  return Math.floor(raw * 100) / 100
}

// ── Analysis query constants ────────────────────────────────────────
/** Maximum date range for analysis queries (days) */
export const MAX_DATE_RANGE_DAYS = 45
/** Lookback window to classify a string as "active" (days with recent data) */
export const ACTIVE_LOOKBACK_DAYS = 14

// ── Staleness (real-time only) ──────────────────────────────────────
/** Milliseconds after which a measurement is stale vs freshest on device */
export const STALE_MS = 15 * 60 * 1000

// ── Time primitives ─────────────────────────────────────────────────
/** One hour in milliseconds — use when composing window durations */
export const MS_PER_HOUR = 60 * 60 * 1000

// ── Dashboard windows ───────────────────────────────────────────────
/** Hero card sparkline length (hours displayed — last N hours of fleet power) */
export const HERO_SPARKLINE_HOURS = 24
/**
 * Hero card query lookback (hours fetched from DB).
 * Must be ≥ 2 × HERO_SPARKLINE_HOURS so we can compare "last completed hour"
 * against the same hour yesterday without gaps at the boundary.
 */
export const HERO_SPARKLINE_LOOKBACK_HOURS = 48
/** Days of history for dashboard sparklines (energy, health) AND rolling-avg baseline */
export const DASHBOARD_HISTORY_DAYS = 7

// ── Producing vs standby ────────────────────────────────────────────
/**
 * Power floor (kW) below which a plant is considered STANDBY / not producing.
 *
 * Why: at night / dawn / dusk, inverters still ping with standby current
 * (few hundred mW per string). Reporting ≠ producing. An 85 kW plant
 * showing 0.2 kW is not "live" in any meaningful sense — it's electrical
 * noise that an enterprise viewer would read as "up and running".
 *
 * Used by: live plant-status classification on the dashboard, fleet power
 * accumulation (skip standby plants), and KPI null-out when nobody is
 * producing.
 */
export const STANDBY_POWER_FLOOR_KW = 0.5

/** Tri-state live status for plant cards */
export type PlantLiveStatus = 'PRODUCING' | 'IDLE' | 'OFFLINE'

/**
 * Classify a plant's live status.
 *   - isReporting  = had a measurement in the last STALE_MS window
 *   - currentPowerKw = sum of latest per-string power readings
 *
 * Returns:
 *   PRODUCING — reporting AND above the standby floor (real generation)
 *   IDLE      — reporting but below the floor (standby / night)
 *   OFFLINE   — not reporting in the staleness window
 */
export function classifyPlantLive(
  isReporting: boolean,
  currentPowerKw: number,
): PlantLiveStatus {
  if (!isReporting) return 'OFFLINE'
  if (currentPowerKw >= STANDBY_POWER_FLOOR_KW) return 'PRODUCING'
  return 'IDLE'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * String runtime status. Vocabulary aligned with IEC 62446-1 (fault types)
 * and IEC 61724-1 (performance monitoring).
 *   - OPEN_CIRCUIT : voltage present but 0 A — wiring/connector/fuse fault
 *   - OFFLINE      : no recent signal (replaces the older 'DISCONNECTED'
 *                    label which implied intentional disconnection; in
 *                    practice we only know comms are lost)
 */
export type StringStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'OFFLINE'
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO'
export type HealthBucket = 'healthy' | 'warning' | 'critical' | 'no_data'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Predicates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Is this string actively producing current? */
export function isActive(currentAmps: number): boolean {
  return currentAmps > ACTIVE_CURRENT_THRESHOLD
}

/** Is this current reading within physically reasonable bounds (no CT sensor fault)? */
export function isSensorReadingValid(currentAmps: number | null | undefined): boolean {
  if (currentAmps == null) return true
  return currentAmps < MAX_STRING_CURRENT_A
}

/** Is this measurement stale relative to the freshest on the device? */
export function isStale(timestampMs: number, freshestTimestampMs: number): boolean {
  return freshestTimestampMs > 0 && (freshestTimestampMs - timestampMs) > STALE_MS
}

/** Filter an array of currents to only active values */
export function filterActive(currents: number[]): number[] {
  return currents.filter(c => isActive(c))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Averages
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StringReading {
  string_number: number
  current: number
  voltage: number
}

/**
 * Leave-one-out peer average: average of all OTHER active strings,
 * excluding the string being evaluated. More fair than self-inclusive.
 * Returns null if not enough peers.
 */
export function leaveOneOutAvg(
  readings: StringReading[],
  excludeStringNumber: number,
): number | null {
  const peers = readings.filter(
    r => isActive(r.current) && r.string_number !== excludeStringNumber
  )
  if (peers.length < 1) return null
  return peers.reduce((sum, r) => sum + r.current, 0) / peers.length
}

/**
 * Average current of all active strings (self-inclusive).
 * Used for display summaries and KPI pills.
 */
export function activeAvg(readings: StringReading[]): number {
  const active = readings.filter(r => isActive(r.current))
  if (active.length === 0) return 0
  return active.reduce((sum, r) => sum + r.current, 0) / active.length
}

/**
 * Can we do a meaningful peer comparison?
 * Requires ≥MIN_PEERS active strings with avg ≥MIN_AVG.
 */
export function canCompare(readings: StringReading[]): boolean {
  const active = readings.filter(r => isActive(r.current))
  if (active.length < MIN_PEERS_FOR_COMPARISON) return false
  const avg = active.reduce((sum, r) => sum + r.current, 0) / active.length
  return avg >= MIN_AVG_FOR_COMPARISON
}

/** Compute gap percentage: how far below the reference average */
export function computeGap(current: number, referenceAvg: number): number {
  if (referenceAvg <= 0) return 0
  return Math.max(0, ((referenceAvg - current) / referenceAvg) * 100)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Real-time Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RealtimeResult {
  status: StringStatus
  gapPercent: number
}

/**
 * Classify a single string's real-time status.
 * Used by the live plant detail view.
 */
export function classifyRealtime(
  current: number,
  voltage: number,
  peerAvg: number | null,
  stale: boolean,
): RealtimeResult {
  if (stale) return { status: 'OFFLINE', gapPercent: 100 }

  if (!isActive(current)) {
    if (voltage > 0) return { status: 'OPEN_CIRCUIT', gapPercent: 100 }
    return { status: 'OFFLINE', gapPercent: 100 }
  }

  if (peerAvg !== null && peerAvg > 0) {
    const gapPercent = computeGap(current, peerAvg)
    if (gapPercent > GAP_CRITICAL) return { status: 'CRITICAL', gapPercent }
    if (gapPercent > GAP_WARNING) return { status: 'WARNING', gapPercent }
    return { status: 'NORMAL', gapPercent }
  }

  return { status: 'NORMAL', gapPercent: 0 }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Alert Severity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Classify alert severity from gap %. Returns null if gap not significant. */
export function classifyAlertSeverity(gapPercent: number): AlertSeverity | null {
  if (gapPercent > GAP_CRITICAL) return 'CRITICAL'
  if (gapPercent > GAP_WARNING) return 'WARNING'
  if (gapPercent > GAP_INFO) return 'INFO'
  return null
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IEC 61724 Daily Scores
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Performance = stringAvgCurrent / inverterAvgCurrent × 100, capped at 100 */
export function computePerformance(stringAvg: number, inverterAvg: number): number | null {
  if (inverterAvg <= 0) return null
  return Math.min((stringAvg / inverterAvg) * 100, 100)
}

/** Availability = stringMeasurements / maxMeasurements × 100, capped at 100 */
export function computeAvailability(stringCount: number, maxCount: number): number | null {
  if (maxCount <= 0) return null
  return Math.min((stringCount / maxCount) * 100, 100)
}

/** Health Score = Performance × Availability / 100, capped at 100 */
export function computeHealthScore(perf: number | null, avail: number | null): number | null {
  if (perf === null || avail === null) return null
  return Math.min((perf * avail) / 100, 100)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Health Score Bucketing (for historical views)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Classify a health score into a display bucket */
export function bucketHealthScore(score: number | null | undefined): HealthBucket {
  if (score === null || score === undefined) return 'no_data'
  if (score >= HEALTH_HEALTHY) return 'healthy'
  if (score >= HEALTH_WARNING) return 'warning'
  return 'critical'
}
