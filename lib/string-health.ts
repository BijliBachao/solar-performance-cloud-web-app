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
