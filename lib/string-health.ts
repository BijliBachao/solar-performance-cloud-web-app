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
// Unified system-wide on the SolarEdge ±6% mismatch anchor (== SR_HEALTHY/
// SR_ABNORMAL on the 0–100 scale): Healthy ≥ 94, Warning ≥ 85, Critical < 85.
// ONE set of thresholds for every health_score / performance-% consumer.
/** Health score >= this is "Healthy" */
export const HEALTH_HEALTHY = 94
/** Health score >= this (but < HEALTH_HEALTHY) is "Warning". Below = Critical */
export const HEALTH_WARNING = 85

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
 * Fleet-default coordinates (central Punjab, Pakistan) for CONNECTIVITY
 * DISPLAY ONLY. The fleet is 100% Pakistani; when a plant has no coordinates,
 * isDaylight()'s fail-open-to-daytime (correct for alarm gating — never
 * suppress a real daytime fault) would make the plant's normal nightly
 * silence read as offline/frozen all night on the NOC. Using the fleet
 * centroid keeps night-time connectivity honest. Do NOT use these for alarm
 * suppression or performance math.
 */
export const FLEET_DEFAULT_LAT = 31.5
export const FLEET_DEFAULT_LNG = 74.3

// Pakistan bounding box (generous). The ENTIRE fleet is Pakistani; coordinates
// outside this box are vendor-default garbage (Beijing 39.9/116.4 confirmed
// live on multiple plants). Garbage coords poison EVERY sun-gated decision:
// Beijing's sun rises ~3h before Pakistan's (false "offline" from ~01:45 PKT)
// and sets ~3h earlier (would discard real evening production in the write
// gate). Clamp before ANY isDaylight() call — write gate AND display.
const PK_LAT_MIN = 23, PK_LAT_MAX = 37.5
const PK_LNG_MIN = 60, PK_LNG_MAX = 78

/** True when the raw (Decimal/string/null) coords are a plausible Pakistani
 *  location — i.e. real, not missing and not vendor-default garbage (Beijing).
 *  A `false` here means any sun-gated UI reading is a regional estimate. */
export function coordsArePlausible(latRaw: unknown, lngRaw: unknown): boolean {
  const lat = latRaw != null ? Number(latRaw) : NaN
  const lng = lngRaw != null ? Number(lngRaw) : NaN
  return lat >= PK_LAT_MIN && lat <= PK_LAT_MAX && lng >= PK_LNG_MIN && lng <= PK_LNG_MAX
}

/** Plant coords if plausibly Pakistani, else the fleet centroid. Accepts the
 *  raw (possibly Decimal/string/null) DB values. */
export function clampToFleetCoords(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } {
  const lat = latRaw != null ? Number(latRaw) : NaN
  const lng = lngRaw != null ? Number(lngRaw) : NaN
  return coordsArePlausible(latRaw, lngRaw) ? { lat, lng } : { lat: FLEET_DEFAULT_LAT, lng: FLEET_DEFAULT_LNG }
}

/**
 * Max tolerated FUTURE skew on a vendor data-timestamp. Found live 2026-06-04:
 * Growatt EEL9E41056's logger clock runs ~2h fast, making its vendor ts land in
 * the future — which would classify the device "live" forever (a dead device
 * would never go offline). Beyond this tolerance the vendor ts is garbage:
 * ignore it (don't persist, don't classify on it) and let reading_changed_at —
 * stamped with OUR clock — drive freshness honestly.
 */
export const VENDOR_TS_MAX_FUTURE_SKEW_MS = 10 * 60 * 1000

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Device write gate (DQ v2, 2026-06-05)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Root cause (live finding 2026-06-05 00:15 PKT): when a datalogger goes
// quiet, several vendor clouds (Sungrow/Growatt/Huawei confirmed) keep
// serving the LAST daytime snapshot from their realtime endpoints. Our
// pollers ingested it every cycle → ~192k phantom night rows/week, phantom
// kWh in daily aggregates, and brand-new-day P2P scores computed from
// yesterday-afternoon variance ("7 critical strings" at midnight).

/** A real string produces ~0 W at night (sensor noise < tens of watts).
 *  Above this with the sun down, the snapshot is a replayed daytime reading. */
export const NIGHT_MAX_PHANTOM_W = 50

/** Night-phantom requires REPLAY-CLASS current too. Found by adversarial
 *  wind-tunnel (2026-06-05 04:45 PKT): a real night leak whose V sensor
 *  reads residual string voltage (V=620, I=0.8A → "496W") would have been
 *  eaten by the power-only check — violating the never-drop-a-real-signal
 *  promise. Physics: every observed daytime replay carries multi-amp
 *  production currents (2.4–13A); real night anomalies are sub-amp leakage
 *  (positive) or backfeed (negative). Requiring BOTH power > 50W AND
 *  current > 1A keeps 100% of replay blocking while guaranteeing every
 *  sub-amp night event is stored and surfaced. */
export const NIGHT_PHANTOM_MIN_CURRENT_A = 1.0

/** Daily P2P scores need at least this many distinct productive hours before
 *  they mean anything — also prevents a brand-new PKT day from being scored
 *  off its first scraps of (possibly garbage) data. */
export const MIN_PRODUCTIVE_HOURS_FOR_DAILY_SCORE = 2
/** An hour counts as "productive" when a string's hourly avg power exceeds this. */
export const MIN_PRODUCTIVE_POWER_W = 10

export type DeviceWriteAction = 'write' | 'skip_duplicate' | 'skip_night_phantom'

/**
 * Should this device's snapshot be written to string_measurements?
 *
 *   skip_duplicate     — signature identical to the previous poll. Real solar
 *     NEVER repeats every string to 0.01 W twice in a row; identical = the
 *     vendor replayed a cached snapshot (or republished an unchanged sample —
 *     Solis slow-publisher). Nothing new to store. Safe for energy math: the
 *     trapezoidal integral skips gaps > 1h, so a skipped frozen stretch adds
 *     ZERO phantom kWh instead of hours of it.
 *   skip_night_phantom — sun is down at the plant but the snapshot claims real
 *     production (> NIGHT_MAX_PHANTOM_W on any string): a replayed daytime
 *     reading that happens to differ from the previous one. PV panels do not
 *     produce in the dark. (IEC 61724-1 §12 night gate, write-path wiring.)
 *   write              — everything else, including honest night zeros.
 *
 * Order matters: duplicate first — it's the more specific diagnosis and needs
 * no sun calculation. Callers must pass sunUp computed with the FLEET-DEFAULT
 * coordinate fallback (not isDaylight's fail-open-day) so coordless plants are
 * still night-gated.
 */
export function classifyDeviceWrite(
  strings: { string_number: number; voltage: number; current: number; power: number }[],
  prevSig: string | null,
  sunUp: boolean,
): DeviceWriteAction {
  if (strings.length > 0 && readingSignature(strings) === prevSig) return 'skip_duplicate'
  // Night phantom = production-class POWER *and* production-class CURRENT.
  // Power alone could eat a real leak with a quirky high-V sensor reading;
  // current alone could eat nothing real either way — together they match
  // exactly (and only) replayed daytime frames. See NIGHT_PHANTOM_MIN_CURRENT_A.
  if (
    !sunUp &&
    strings.some((s) => s.power > NIGHT_MAX_PHANTOM_W && s.current > NIGHT_PHANTOM_MIN_CURRENT_A)
  ) {
    return 'skip_night_phantom'
  }
  return 'write'
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
/** A feed whose last real data is older than this has missed at least one
 *  full daylight period — even at night that is a broken feed, not sleep.
 *  Longest Pakistani winter night ≈ 14h; +2h staleness margin. */
export const FEED_DEAD_BEYOND_NIGHT_MS = 16 * 60 * 60 * 1000

export function classifyConnectivity(
  effectiveFreshAtMs: number | null,
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
  /** Was the sun solidly up at the plant when the feed produced its LAST real
   *  data? true ⇒ the feed died during production hours. Computed by the
   *  caller from plant coords (deviceConnectivity). */
  effWasProductionHours: boolean = false,
): ConnectivityStatus {
  // 'live' is checked BEFORE 'idle': fresh data is empirical proof the inverter
  // is alive, which must win over the sun-elevation calc. This keeps the status
  // robust to wrong plant coordinates (vendor APIs sometimes return default
  // coords, e.g. Beijing 39.9/116.4, which would otherwise mis-gate a producing
  // daytime plant to 'idle'). age <= 2h is "live" — matches isVendorFeedStale's
  // `age > 2h` staleness cutoff (a feed the gate calls fresh is live here).
  if (effectiveFreshAtMs != null && nowMs - effectiveFreshAtMs <= VENDOR_FEED_STALE_MS) return 'live'
  if (!sunUp) {
    // Night does NOT amnesty a broken feed (24/7 doctrine, audit 2026-06-05):
    // a feed that died in PRODUCTION hours — or missed a whole daylight period
    // (Qadir: 3 days) — must stay frozen/offline overnight, or the NOC's
    // frozen count silently drops to zero at dusk and "re-discovers" the same
    // faults at dawn. Only honest dusk-sleepers (last real data near sunset)
    // read idle.
    const missedDaylight =
      effectiveFreshAtMs != null && nowMs - effectiveFreshAtMs > FEED_DEAD_BEYOND_NIGHT_MS
    if (!(effWasProductionHours || missedDaylight)) return 'idle'
  }
  // No fresh data: still receiving rows (stuck values) = frozen, else offline.
  if (lastWriteAtMs != null && nowMs - lastWriteAtMs < STALE_MS) return 'frozen'
  return 'offline'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Status Unification (2026-06-05) — ONE plant-status taxonomy, ONE engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Before this, four screens cooked four different statuses for the same
// physical situation (a sleeping plant at 2 AM read: NOC "idle", /admin/plants
// table "Offline" via a sun-blind >60-min recipe, its header "healthy" via
// vendor health_state, plant card "Standby" via a power floor). One taxonomy
// now serves every screen: Live · Idle (night) · Frozen feed · Offline ·
// Faulty — derived from the per-device connectivity engine (classify-
// Connectivity) + a vendor-fault overlay. Pages must NOT invent statuses.

export type PlantOpStatus = 'live' | 'idle' | 'frozen' | 'offline' | 'faulty'

/** The one user-facing vocabulary. Every screen renders these words. */
export const PLANT_OP_LABEL: Record<PlantOpStatus, string> = {
  live: 'Live',
  idle: 'Idle · night',
  frozen: 'Frozen feed',
  offline: 'Offline',
  faulty: 'Faulty',
}

/**
 * Roll a plant's per-device connectivity statuses up to ONE plant status.
 *
 * Rules (worst-issue-first — a roll-up exists to surface problems):
 *   faulty  — the vendor flags the plant faulty AND we have fresh contact
 *             evidence (≥1 device live/frozen). A fault flag with no recent
 *             data is unverifiable → fall through to connectivity (matches
 *             the long-standing "stale plant is Offline, not Faulty" rule).
 *   offline > frozen > live > idle — worst connectivity wins; a plant with
 *             3 live + 1 offline inverter shows OFFLINE (operator must see
 *             the problem; per-device detail lives on the plant page).
 *   no devices → offline.
 */
export function rollupPlantStatus(
  deviceStatuses: ConnectivityStatus[],
  healthState: number | null | undefined,
): PlantOpStatus {
  if (deviceStatuses.length === 0) return 'offline'
  const has = (s: ConnectivityStatus) => deviceStatuses.includes(s)
  const freshContact = has('live') || has('frozen')
  if (healthState === PLANT_HEALTH_FAULTY && freshContact) return 'faulty'
  if (has('offline')) return 'offline'
  if (has('frozen')) return 'frozen'
  if (has('live')) return 'live'
  return 'idle'
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
 * deep shade. Used by the DAILY scorer, which already restricts to the peak
 * window, so this only needs to be a near-zero backstop.
 */
export const MIN_PER_PANEL_W_FOR_COMPARISON = 5

/**
 * Per-panel power floor (W) for the LIVE/real-time SR scorer (live chart,
 * Last-3h donut, alerts). Unlike the daily scorer it has no peak-window, so it
 * needs a "meaningful production" floor to skip the morning/evening RAMP, where
 * strings on one MPPT warm up unevenly and low-angle row-shading makes healthy
 * strings legitimately lag — producing a flood of transient false "below-peer"
 * verdicts (live 2026-06-08: 100 peer-alerts across 27 plants at sun 17°).
 * Picked from live data: ramp tops out ~130 W/panel (p90) while midday p10 is
 * ~232, so 150 excludes ~96% of ramp strings and ~0% of midday GROUPS. Below
 * this the live scorer returns no verdict ("warming up"); dead-string and
 * open-circuit detection are unaffected (a dead string is dead at any light). */
export const SR_LIVE_MIN_PER_PANEL_W = 150

/** Upper clamp for an SR/P2P ratio — keeps arithmetic stable when a peer pool
 * has a very weak anchor (a string can read ≥1.5× the group median/max). */
export const P2P_CAP = 1.5

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// String Performance (Algorithm v3) — current vs peer-median current.
// Spec: Working/5_Tuesday_09_June_2026/STRING-PERFORMANCE-METRIC-REDESIGN-SPEC.md
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Performance % classification now shares the unified HEALTH_HEALTHY (94) /
// HEALTH_WARNING (85) bands — no separate PERF_* thresholds (removed 2026-06-10).
/** Display/clamp cap for Performance %. */
export const PERF_DISPLAY_CAP = 150
/** Device-summed hourly avg_current (A) above which an HOUR counts as "sun-up". */
export const MIN_CURRENT_FOR_COMPARISON = 1.0
/** Per-string hourly avg_current (A) above which the string counts as "producing". */
export const MIN_PRODUCING_CURRENT = 0.5
/** Minimum sun-up HOURS before a PKT day is scoreable. */
export const MIN_SUNUP_HOURS_FOR_DAILY_SCORE = 2

// ─── V1 String-Performance (intra-inverter, current-only) — LOCKED 2026-06-11 ──
// Reyyan V1 spec: median-of-medians, fixed 8AM–4PM PKT window, 60% completeness
// gate, display cap 100 (raw kept), bands 95/85/60/Dead. classifyStringPerformance
// is THE single source of truth — the /analysis cell, drill-down, per-plant donut,
// and NOC counts/rows ALL derive from it (via perfBandToDonutBucket). Nothing else
// may compare a performance % to a band threshold.
/** Fixed daily window (PKT, local Pakistan time). In UTC this is 03:00–11:00. */
export const PERF_WINDOW_START_HOUR_PKT = 8
export const PERF_WINDOW_END_HOUR_PKT = 16
/** 5-min readings expected across the 8h window: 8 × 12. */
export const PERF_EXPECTED_READINGS = 96
/** Day scored only when received/expected ≥ this; else "insufficient data". */
export const PERF_COMPLETENESS_GATE = 0.60
/** Customer-facing display cap. The raw (uncapped) value is stored separately. */
export const PERF_DISPLAY_MAX = 100
/** Status band lower bounds (the upper band owns each edge). Dead = below PERF_DEAD. */
export const PERF_NORMAL = 95
export const PERF_WATCH = 85
export const PERF_UNDERPERFORMING = 60
export const PERF_DEAD = 10

export type PerfBand =
  | 'normal' | 'watch' | 'underperforming' | 'serious_fault' | 'dead'
  | 'insufficient_data' | 'unused' | 'peer_excluded'

export interface PerfFlags { isUsed: boolean; peerExcluded: boolean; insufficientData: boolean }

/**
 * THE single source of truth for a string's V1 status. Every surface
 * (cell colour, drill-down, donut, NOC counts, tallies) MUST derive from this.
 * `displayPct` is the capped (≤100) performance; null = no score.
 */
export function classifyStringPerformance(displayPct: number | null, flags: PerfFlags): PerfBand {
  if (!flags.isUsed) return 'unused'
  if (flags.peerExcluded) return 'peer_excluded'
  if (flags.insufficientData || displayPct == null) return 'insufficient_data'
  if (displayPct < PERF_DEAD) return 'dead'
  if (displayPct < PERF_UNDERPERFORMING) return 'serious_fault'
  if (displayPct < PERF_WATCH) return 'underperforming'
  if (displayPct < PERF_NORMAL) return 'watch'
  return 'normal'
}

/** Rolls the 5 performance bands into the 3-bucket donut (+ no_data / excluded=null). */
export function perfBandToDonutBucket(
  band: PerfBand,
): 'healthy' | 'abnormal' | 'critical' | 'no_data' | null {
  switch (band) {
    case 'normal': return 'healthy'
    case 'watch':
    case 'underperforming': return 'abnormal'
    case 'serious_fault':
    case 'dead': return 'critical'
    case 'insufficient_data': return 'no_data'
    case 'unused':
    case 'peer_excluded': return null
  }
}

/**
 * Back-compat: map a V1 PerfBand to the legacy CellStatus the string-cell drill-down
 * (StringCellDetail.tsx) reads (healthy|warning|critical|no_data|peer_excluded|unused).
 * Centralized here so the drill-down routes never re-derive band→status from numbers.
 */
export function perfBandToBackCompatStatus(
  band: PerfBand,
): 'healthy' | 'warning' | 'critical' | 'no_data' | 'peer_excluded' | 'unused' {
  switch (band) {
    case 'normal': return 'healthy'
    case 'watch':
    case 'underperforming': return 'warning'
    case 'serious_fault':
    case 'dead': return 'critical'
    case 'insufficient_data': return 'no_data'
    case 'unused': return 'unused'
    case 'peer_excluded': return 'peer_excluded'
  }
}

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
// Alert quality (2026-06-05) — sun-armed generation + hysteresis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Measured live this dawn: 283 false CRITICALs in the first 35 minutes of
// daylight (strings wake minutes apart → dead-string detector mass-fires),
// and the worst string flapped 69 alerts in 7 days from gap values hovering
// at a threshold. Two fixes: (1) alerts only ARM when the sun is comfortably
// up; (2) severity transitions need to cross a boundary by a margin.

/** Alerts arm only above this sun elevation (~45 min after sunrise / before
 *  sunset at Pakistani latitudes). Below it, production is establishing or
 *  collapsing and peer/dead-string verdicts are dawn/dusk noise. */
export const ALERT_MIN_SUN_ELEVATION_DEG = 10

/** Hysteresis margin (percentage points): an existing alert keeps its
 *  severity until the gap crosses the band boundary by more than this. */
export const ALERT_HYSTERESIS_PP = 3

/** Dead-string recovery deadband: a string alerted as dead (≤ ACTIVE_CURRENT_
 *  THRESHOLD) only counts as recovered above 2× the threshold — kills the
 *  0.09 A ↔ 0.11 A flap. */
export const DEAD_STRING_RECOVERY_A = ACTIVE_CURRENT_THRESHOLD * 2

/**
 * Severity with hysteresis relative to an existing open alert for the same
 * string. No existing alert → plain thresholds (enter). With one:
 *   escalate   only when gap > newBandFloor + margin
 *   de-escalate only when gap < currentBandFloor − margin
 * In the sticky zone, the existing severity is kept — no churn.
 */
export function classifyAlertSeverityWithHysteresis(
  gapPercent: number,
  existing: AlertSeverity | null,
): AlertSeverity | null {
  const plain = classifyAlertSeverity(gapPercent)
  const order: AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL']
  if (existing == null || !order.includes(existing)) return plain
  if (plain === existing) return existing
  const bandFloor: Record<AlertSeverity, number> = {
    INFO: GAP_INFO, WARNING: GAP_WARNING, CRITICAL: GAP_CRITICAL,
  }
  const exIdx = order.indexOf(existing)
  const plIdx = plain == null ? -1 : order.indexOf(plain)
  if (plIdx > exIdx) {
    // escalation: must clear the higher band's floor by the margin
    return gapPercent > bandFloor[plain as AlertSeverity] + ALERT_HYSTERESIS_PP ? plain : existing
  }
  // de-escalation (incl. full recovery): must drop clearly below the
  // existing band's floor
  return gapPercent < bandFloor[existing] - ALERT_HYSTERESIS_PP ? plain : existing
}

/** Hysteresis margin in SR units (~3pp of gap) for the SR-bucket alert mapping. */
export const SR_ALERT_HYSTERESIS = 0.03

// ─── SR→alert boundaries, aligned to the V1 display bands (Task 18) ──────────
// The real-time peer alert maps an SR ratio (0–1) to a severity using the SAME
// cut-points the /analysis cell shows, expressed on the SR scale (band ÷ 100):
//   sr < PERF_UNDERPERFORMING/100 (0.60) ⇒ CRITICAL  (the cell's serious_fault)
//   PERF_UNDERPERFORMING/100 ≤ sr < PERF_WATCH/100 (0.85) ⇒ WARNING
//   sr ≥ PERF_WATCH/100 ⇒ no alert
// This guarantees an alert can NEVER say CRITICAL while the cell says Watch (nor
// the reverse). Derived from the central PERF_* constants — no inline numbers.
// NOTE: this is the ALERT-severity mapping only; the donut's live ring
// (bucketSrScore) deliberately keeps the 0.94/0.85 SR anchor.
export const SR_ALERT_CRITICAL = PERF_UNDERPERFORMING / 100
export const SR_ALERT_WARNING = PERF_WATCH / 100

/** Map an SR ratio to an alert severity using the V1 display bands (Task 18),
 *  so the alert list and the /analysis cell can never contradict each other:
 *  serious_fault (sr < SR_ALERT_CRITICAL=0.60) ⇒ CRITICAL; the watch+
 *  underperforming band [0.60, 0.85) ⇒ WARNING; ≥0.85 ⇒ no alert. Sticky
 *  hysteresis on the boundaries prevents threshold-hover flap. (INFO is unused
 *  for peer alerts.) The donut's bucketSrScore is untouched (0.94/0.85 ring). */
export function classifySrAlertSeverityWithHysteresis(
  sr: number,
  existing: AlertSeverity | null,
): AlertSeverity | null {
  const plain: AlertSeverity | null =
    sr < SR_ALERT_CRITICAL ? 'CRITICAL' : sr < SR_ALERT_WARNING ? 'WARNING' : null
  if (existing !== 'WARNING' && existing !== 'CRITICAL') return plain
  if (plain === existing) return existing
  if (existing === 'WARNING' && plain === 'CRITICAL') {
    // escalate only when sr drops clearly below the critical boundary
    return sr < SR_ALERT_CRITICAL - SR_ALERT_HYSTERESIS ? 'CRITICAL' : 'WARNING'
  }
  // de-escalation / recovery: sr must rise clearly above the EXISTING bucket's
  // upper boundary before we relax it (CRITICAL→ above SR_ALERT_CRITICAL,
  // WARNING→ above SR_ALERT_WARNING).
  const existingUpper = existing === 'CRITICAL' ? SR_ALERT_CRITICAL : SR_ALERT_WARNING
  return sr >= existingUpper + SR_ALERT_HYSTERESIS ? plain : existing
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Health Score Bucketing (for historical views)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Classify a daily health/performance score into the /analysis display bucket.
 *
 * V1 band cutover (2026-06-11): derived from the central V1 classifier so the
 * /analysis tally, the per-plant donut, the NOC console, and the per-string
 * cells can NEVER disagree. The 5 V1 bands fold into the 4 analysis buckets:
 *   normal               → healthy
 *   watch+underperforming→ warning  (the donut's 'abnormal')
 *   serious_fault+dead   → critical
 *   insufficient_data    → no_data
 * This is the DAILY-metric consumer — NOT the live-SR/alert path (which keeps
 * bucketSrScore / SR_HEALTHY / SR_ABNORMAL on the 0.94/0.85 anchor).
 */
export function bucketHealthScore(score: number | null | undefined): HealthBucket {
  const band = classifyStringPerformance(score ?? null, {
    isUsed: true,
    peerExcluded: false,
    insufficientData: false,
  })
  const donut = perfBandToDonutBucket(band)
  switch (donut) {
    case 'healthy': return 'healthy'
    case 'abnormal': return 'warning'
    case 'critical': return 'critical'
    default: return 'no_data' // no_data (and null, unreachable here) → no_data
  }
}
