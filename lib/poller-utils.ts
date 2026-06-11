import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import {
  isActive, filterActive, computeGap, classifyAlertSeverity,
  readingSignature, VENDOR_TS_MAX_FUTURE_SKEW_MS,
  MIN_PEERS_FOR_COMPARISON, MIN_AVG_FOR_COMPARISON,
  MAX_STRING_CURRENT_A, MAX_STRING_POWER_W,
  clampToFleetCoords,
  classifySrAlertSeverityWithHysteresis,
  ALERT_MIN_SUN_ELEVATION_DEG, DEAD_STRING_RECOVERY_A,
  type DeviceWriteAction, type AlertSeverity,
} from '@/lib/string-health'
import { isDaylight, solarElevationDeg } from '@/lib/solar-geometry'
import { scoreLiveSr, type LiveStringInput } from '@/lib/string-health-live'
import { buildPerfInputsFromHourly, type HourlyMedianRow } from '@/lib/settled-day-performance'
import { scoreStringPerformance, computeOperatingAvailability, median } from '@/lib/string-performance'
import {
  PERF_WINDOW_START_HOUR_PKT, PERF_WINDOW_END_HOUR_PKT, PERF_EXPECTED_READINGS,
} from '@/lib/string-health'

/**
 * Persist per-device freshness signals (for connectivity status on the plant
 * page + NOC). Computes the reading signature; if it changed vs prevSig, stamps
 * reading_changed_at=now + stores the new sig. Stores vendor_last_data_at when
 * provided AND not future-skewed beyond tolerance (fast logger clocks are
 * garbage — see VENDOR_TS_MAX_FUTURE_SKEW_MS). ALWAYS stamps last_seen_at —
 * "the poll cycle saw this device in the vendor API" — which is what keeps
 * frozen (still seen, values stuck) distinguishable from offline (gone) now
 * that the write gate stops re-writing duplicate measurements.
 *
 * prevSig is passed in by the caller (pollers already select the device row) to
 * avoid an extra read. Restart-safe because the prior sig lives in the DB.
 */
export async function recordDeviceFreshness(
  deviceId: string,
  strings: { string_number: number; voltage: number; current: number; power: number }[],
  vendorLastDataAt: Date | null,
  prevSig: string | null,
): Promise<void> {
  const sig = readingSignature(strings)
  const data: { vendor_last_data_at?: Date; reading_changed_at?: Date; last_reading_sig?: string; last_seen_at: Date } = {
    last_seen_at: new Date(),
  }
  // Reject vendor timestamps in the future beyond clock-skew tolerance — a
  // fast logger clock (seen live: Growatt ~2h ahead) would otherwise pin the
  // device "live" forever. reading_changed_at (our clock) stays the honest signal.
  if (vendorLastDataAt && vendorLastDataAt.getTime() <= Date.now() + VENDOR_TS_MAX_FUTURE_SKEW_MS) {
    data.vendor_last_data_at = vendorLastDataAt
  }
  if (sig !== prevSig) {
    data.reading_changed_at = new Date()
    data.last_reading_sig = sig
  }
  await prisma.devices.update({ where: { id: deviceId }, data })
}

/**
 * Lighter sibling of recordDeviceFreshness for SKIPPED writes (duplicate
 * replay / night phantom / stale vendor feed): stamps last_seen_at (+ the
 * vendor ts when valid) but deliberately does NOT touch the reading signature
 * or reading_changed_at — untrusted data must not look like fresh data.
 */
export async function recordDeviceSeen(
  deviceId: string,
  vendorLastDataAt: Date | null,
): Promise<void> {
  const data: { last_seen_at: Date; vendor_last_data_at?: Date } = { last_seen_at: new Date() }
  if (vendorLastDataAt && vendorLastDataAt.getTime() <= Date.now() + VENDOR_TS_MAX_FUTURE_SKEW_MS) {
    data.vendor_last_data_at = vendorLastDataAt
  }
  await prisma.devices.update({ where: { id: deviceId }, data })
}

/**
 * Sun position for the WRITE GATE: plant coords are used only when they are
 * plausibly Pakistani (clampToFleetCoords); null or out-of-country coords fall
 * back to the fleet centroid. The threshold assumes the coords are the plant's
 * PHYSICAL location — never pass vendor defaults through unclamped.
 */
export function sunUpForWriteGate(
  plants: { latitude: unknown; longitude: unknown } | null | undefined,
  now: Date = new Date(),
): boolean {
  const { lat, lng } = clampToFleetCoords(plants?.latitude, plants?.longitude)
  return isDaylight(lat, lng, now)
}

/**
 * Alerts ARM only when the sun is comfortably up at the plant (clamped
 * coords). Below ALERT_MIN_SUN_ELEVATION_DEG, strings wake/sleep minutes
 * apart and the detectors mass-fire (283 false CRITICALs measured in this
 * morning's first 35 minutes). Data is still WRITTEN at all hours — only the
 * accusations wait for established daylight.
 */
export function alertsArmed(
  plants: { latitude: unknown; longitude: unknown } | null | undefined,
  now: Date = new Date(),
): boolean {
  const { lat, lng } = clampToFleetCoords(plants?.latitude, plants?.longitude)
  return solarElevationDeg(lat, lng, now) >= ALERT_MIN_SUN_ELEVATION_DEG
}

// Alert message taxonomy thresholds (alert-system audit 2026-06-05).
// Reverse current: sustained negative amps = backfeed through the string
// (failed bypass diode / wiring fault) — 0.5A floor keeps sensor noise out.
// Open circuit: a string showing real array voltage but no current is a
// broken conductor/fuse/connector, not a dead panel — 50V floor is far above
// measurement noise yet far below any operating string voltage (300-700V).
export const REVERSE_CURRENT_ALERT_A = 0.5
export const OPEN_CIRCUIT_MIN_VOLTAGE_V = 50

/**
 * When the write gate (or a vendor-ts stale gate) rejects a device's feed, the
 * data behind its open string-health alerts is no longer trusted — resolve
 * them so operators don't stare at phantom CRITICALs for the duration of a
 * freeze. Alerts re-open naturally from fresh data once the feed recovers
 * (generateAlerts runs again on the first trusted snapshot). Also acts as the
 * deploy-time cleanup: devices already frozen resolve their phantom alerts on
 * their first gated cycle.
 */
export async function resolveAlertsForUntrustedFeed(deviceId: string): Promise<void> {
  await prisma.alerts.updateMany({
    where: { device_id: deviceId, resolved_at: null },
    // resolved_by discriminates "feed went untrusted" from "string actually
    // recovered" in the alert history (alert-system audit 2026-06-05).
    data: { resolved_at: new Date(), resolved_by: 'system:untrusted-feed' },
  })
}

/**
 * The gap resolveAlertsForUntrustedFeed can't cover: an OFFLINE device gets no
 * poller cycle at all (the vendor stops reporting it), so alerts opened before
 * the feed died can never resolve. Found live 2026-06-05 06:05 PKT: ~96 zombie
 * dusk-storm alerts on Ali Enterprises, dark since 20:10 the previous evening,
 * dominating the /admin "Active Alerts" count.
 *
 * String judgments are only meaningful on a live feed — the outage itself is
 * already represented by op_status (offline/frozen) on every screen. When the
 * feed returns and a string is still faulty, the next trusted cycle re-opens
 * its alert. Frozen devices are included as a belt-and-braces (their per-cycle
 * gate path normally handles them); idle (night) devices are NOT — alerts on
 * an honestly-sleeping plant persist until dawn re-evaluation.
 *
 * Runs once per pollAll() cycle from run-poller.ts.
 */
export async function sweepAlertsOnDarkDevices(): Promise<number> {
  const { loadFleetConnectivity } = await import('@/lib/donut-data-loader')
  const conn = await loadFleetConnectivity()
  const darkIds = conn.devices
    .filter((d) => d.status === 'offline' || d.status === 'frozen')
    .map((d) => d.deviceId)
  if (darkIds.length === 0) return 0
  const res = await prisma.alerts.updateMany({
    where: { device_id: { in: darkIds }, resolved_at: null },
    data: { resolved_at: new Date(), resolved_by: 'system:dark-feed-sweep' },
  })
  if (res.count > 0) {
    console.log(`[AlertSweep] Resolved ${res.count} zombie alert(s) across ${darkIds.length} dark device(s) (offline/frozen feeds)`)
  }
  return res.count
}

// ── Alert persistence (N-of-M dawn-ramp guard, audit 2026-06-08) ──
// At dawn, strings on one MPPT wake unevenly; a lagger reads below its peer
// median for a cycle or two, then catches up. The first armed cycle after the
// median-anchor alert engine shipped created 43 transient peer alerts (vs 9 the
// prior day). Standard NOC practice (CUSUM / N-of-M) is to require a deficit to
// PERSIST before raising a NEW alert. We track, per (device,string), how many
// consecutive cycles it has been in a problem state; a new alert is only created
// once that count reaches ALERT_PERSISTENCE_CYCLES. Resolution is NOT gated —
// recovered strings clear immediately. State is process-local (resets on the
// PM2 deploy restart, same as the write-gate log state) — a worst case of one
// extra deploy-time cycle of delay, never a missed sustained fault.
export const ALERT_PERSISTENCE_CYCLES = 2
const alertPersistenceState = new Map<string, number>()

/** Test-only: clear the process-local persistence counters so each test starts
 *  from a clean slate (the map is module-level and survives between calls). */
export function __resetAlertPersistence(): void {
  alertPersistenceState.clear()
}

// One log line per device per stall (and one on recovery) — same pattern as the
// CSI/Solis stale-feed logging. Keyed by deviceId (globally unique across providers).
const writeGateLogState = new Map<string, DeviceWriteAction>()

/** Log write-gate transitions without per-cycle spam. Call with EVERY gate
 *  verdict (including 'write', which logs recovery + clears state). */
export function logWriteGate(provider: string, deviceId: string, action: DeviceWriteAction): void {
  const prev = writeGateLogState.get(deviceId)
  if (action === 'write') {
    if (prev) console.log(`[${provider}] ${deviceId} write gate cleared (${prev}) — resuming writes`)
    writeGateLogState.delete(deviceId)
    return
  }
  if (prev !== action) {
    writeGateLogState.set(deviceId, action)
    const why = action === 'skip_duplicate'
      ? 'duplicate snapshot (vendor replaying cached data) — skipping writes until values change'
      : 'night phantom (sun down but vendor reports production) — skipping replayed daytime data'
    console.warn(`[${provider}] ${deviceId} write gate: ${why}`)
  }
}

/** Safe parseFloat that returns 0 instead of NaN */
export function safeFloat(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

/**
 * Safe array coercion at vendor-data boundaries. Returns the input if it's an
 * array, else returns []. Use this where a vendor API claims to return an array
 * but might send null, undefined, or a wrapped object on edge cases (rate-limit
 * payloads, partial outages, malformed paginated responses).
 *
 * Without this guard, `for (const x of vendor.maybeList)` throws "is not
 * iterable" and the whole poll cycle dies. With it, we silently get an empty
 * iteration and the next inverter / next provider keeps working.
 */
export function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : []
}

/**
 * Safe object coercion at vendor-data boundaries. Returns the input if it's a
 * non-null plain object, else returns {}. Useful for guarding against vendors
 * sending `data: null` where we expect a key/value bag (e.g. Sungrow's
 * `device_point` map, Huawei's `dataItemMap`, Growatt's per-type device groups).
 */
export function safeObject(v: any): Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

/** Safe parseInt that returns 0 instead of NaN. Use for vendor-reported counts,
 *  status codes, plant IDs that should be integers but sometimes arrive as
 *  strings or null. */
export function safeInt(v: any): number {
  const n = parseInt(v, 10)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

/**
 * fetch() wrapped with a hard timeout. Without this, a vendor that hangs
 * the socket forever (TCP keepalive doesn't help; Node.js has no global
 * fetch timeout) blocks one of the parallel workers in processInBatches
 * indefinitely, eventually starving the whole provider's poll cycle.
 *
 * 30s default is generous for normal vendor responses (~1-3s) but bounded
 * enough to surface a hang within one poll interval.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = 30000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run `processor` over `items` with at most `concurrency` calls in flight at
 * once. Errors are caught per-item and logged with `context` so a single bad
 * device cannot poison the rest of the batch — same isolation model as the
 * existing per-device try/catch, but parallelised.
 *
 * Concurrency is bounded by the shared RDS connection budget — see
 * POLLER_DEVICE_CONCURRENCY in lib/constants.ts for the rationale.
 */
export async function processInBatches<T>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<void>,
  context: string,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const results = await Promise.allSettled(batch.map(processor))
    for (const [j, result] of results.entries()) {
      if (result.status === 'rejected') {
        console.error(`[${context}] Batch item ${i + j} failed:`, result.reason)
      }
    }
  }
}

/**
 * Drop physically-impossible sensor readings (CT faults) so they don't
 * pollute downstream aggregates, peer averages, or alerts. A measurement
 * is rejected if:
 *   • current ≥ MAX_STRING_CURRENT_A  (50 A  — e.g. 108 A / 998 A CT faults)
 *   • power   ≥ MAX_STRING_POWER_W    (25 kW — physically impossible per string)
 *
 * Rationale: a broken CT reporting 998 A used to be included in
 * inverter averages, pushing Performance to the 100% cap and making
 * the string look perfectly healthy in string_daily. The raw
 * measurement row stays in string_measurements (audit trail), but
 * aggregates and alert comparisons must ignore it.
 *
 * This matches the two-axis filter applied in the read-side queries
 * for /api/dashboard/main and /api/plants/[code]/history, so data
 * flowing into the DB aggregates is now consistent with data flowing
 * out.
 */
function dropSensorFaults<T extends { current: any; power?: any }>(rows: T[]): T[] {
  return rows.filter((m) => {
    const c = Number(m.current)
    if (!isNaN(c) && c >= MAX_STRING_CURRENT_A) return false
    if (m.power != null) {
      const p = Number(m.power)
      if (!isNaN(p) && p >= MAX_STRING_POWER_W) return false
    }
    return true
  })
}

/**
 * Per-device admin flag sets used by all three poller helpers. Hoisting the
 * fetch out of the helpers into the calling poller turns 3 redundant queries
 * per device per cycle into 1 — and lets the per-device pipeline be safely
 * parallelised without multiplying the query count.
 */
export interface StringConfigSets {
  unusedSet: Set<number>
  peerExcludedSet: Set<number>
  /** string_number → admin-entered panel_count (absent when not configured). */
  panelCountByString: Map<number, number>
}

export async function loadStringConfigs(deviceId: string): Promise<StringConfigSets> {
  const adminConfigs = await prisma.string_configs.findMany({
    where: { device_id: deviceId },
    select: { string_number: true, is_used: true, exclude_from_peer_comparison: true, panel_count: true },
  })
  return {
    unusedSet: new Set(
      adminConfigs.filter(c => c.is_used === false).map(c => c.string_number),
    ),
    peerExcludedSet: new Set(
      adminConfigs
        .filter(c => c.exclude_from_peer_comparison === true)
        .map(c => c.string_number),
    ),
    panelCountByString: new Map(
      adminConfigs
        .filter(c => c.panel_count != null)
        .map(c => [c.string_number, c.panel_count as number]),
    ),
  }
}

export async function generateAlerts(
  deviceId: string,
  plantId: string,
  rawMeasurements: Array<{
    string_number: number
    current: Decimal
    voltage: Decimal
    power: Decimal
  }>,
  configs?: StringConfigSets,
  /** Sun comfortably up at the plant (alertsArmed). Defaults true for
   *  back-compat; pollers pass the real value. When false, NOTHING is
   *  created or resolved — dawn/dusk readings are not verdict material. */
  armed: boolean = true,
  /** Inverter model + max_strings, so Part-1 peer comparison uses the SAME
   *  per-MPPT / per-panel-power / median engine as the donut (scoreLiveSr).
   *  Optional for back-compat; null → device-wide fallback grouping. */
  deviceMeta?: { model: string | null; max_strings: number | null; strings_are_mppts?: boolean },
  /** Consecutive problem-cycles required before a NEW alert is created
   *  (dawn-ramp guard). Pollers use the default; tests pass 1 for immediacy. */
  minPersistenceCycles: number = ALERT_PERSISTENCE_CYCLES,
): Promise<void> {
  if (!armed) return
  if (rawMeasurements.length === 0) return

  // Two admin flags affect alert generation differently:
  //
  //   is_used=false (Phase A) — empty PV port. Induction-leak noise (~0.05–0.5 A)
  //     would trigger 96%-below-peers CRITICAL alerts. Removed from peer pool
  //     AND from all alert generation.
  //
  //   exclude_from_peer_comparison=true (Phase B) — non-standard orientation
  //     (wall, east/west, shaded). Lower output is expected, not a fault. Removed
  //     from the PEER POOL only — still gets dead-string detection (Part 2) so a
  //     real 0 A fault on a wall-mounted string is still flagged.
  const { unusedSet, peerExcludedSet, panelCountByString } = configs ?? (await loadStringConfigs(deviceId))
  const usedRaw = unusedSet.size > 0
    ? rawMeasurements.filter(m => !unusedSet.has(m.string_number))
    : rawMeasurements
  if (usedRaw.length === 0) return

  // Exclude sensor-fault rows before peer comparison — a single broken
  // CT at 998 A would otherwise dominate the inverter average and make
  // every healthy peer look "below average" (false CRITICAL alerts).
  const measurements = dropSensorFaults(usedRaw)
  if (measurements.length === 0) return

  // Peer pool = all non-unused, non-peer-excluded active strings.
  const peerPool = measurements.filter(m => !peerExcludedSet.has(m.string_number))
  const peerActive = peerPool.filter(m => isActive(Number(m.current)))
  const peerTotalCurrent = peerActive.reduce((sum, m) => sum + Number(m.current), 0)
  const peerAvgCurrent = peerActive.length > 0 ? peerTotalCurrent / peerActive.length : 0

  // Open alerts are fetched BEFORE classification: (a) hysteresis needs the
  // existing severity per string; (b) the old flow early-returned when no
  // current issues existed, so a device whose LAST faulty string recovered
  // never resolved its alert (it lingered until some other fault appeared) —
  // fixed by always evaluating resolution below.
  const openAlerts = await prisma.alerts.findMany({
    where: { device_id: deviceId, resolved_at: null },
  })
  const existingSeverity = new Map<number, AlertSeverity>()
  const existingDeadAlert = new Set<number>()
  for (const a of openAlerts) {
    existingSeverity.set(a.string_number, a.severity as AlertSeverity)
    // gap_percent NULL discriminates dead-string alerts from peer-comparison
    if (a.severity === 'CRITICAL' && a.gap_percent == null) existingDeadAlert.add(a.string_number)
  }

  // Build severity map. gapPercent is null for non-peer-comparable alerts
  // (Part 2 fires on peer-excluded strings, OR when the peer pool is too thin
  // to compute a meaningful "% below peers" — a real dead string is still a
  // dead string regardless of whether we have healthy peers to compare to).
  const currentSeverities = new Map<
    number,
    { severity: string; gapPercent: number | null; expectedCurrent?: number }
  >()

  const canDoComparison = peerActive.length >= MIN_PEERS_FOR_COMPARISON && peerAvgCurrent >= MIN_AVG_FOR_COMPARISON

  // ── Part 1: Peer comparison via the SHARED engine (scoreLiveSr) ──
  // Alerts now use the SAME comparison as the donut/live view: per-MPPT,
  // per-panel POWER, MEDIAN anchor (audit 2026-06-08). This replaces the old
  // raw-current, whole-inverter, leave-one-out compare that flagged healthy
  // low-current strings as "below average" (different panel counts / V-I
  // operating points / MPPTs) — the FANZ-class false positives. The gap fed to
  // the hysteresis bands is the SR deficit (1 - sr), so a string at 70% of its
  // peer-group median = 30% gap. Dead/open-circuit strings return null sr here
  // and are handled by Part 2 (absolute near-zero current, with deadband).
  const srInputs: LiveStringInput[] = measurements.map((m) => ({
    string_number: m.string_number,
    voltage: Number(m.voltage),
    current: Number(m.current),
    power: Number(m.power),
    panel_count: panelCountByString.get(m.string_number) ?? null,
    is_used: true, // unused already filtered out above
    exclude_from_peer_comparison: peerExcludedSet.has(m.string_number),
    stale: false,
  }))
  const srResults = scoreLiveSr(srInputs, {
    deviceId,
    inverterModel: deviceMeta?.model ?? null,
    inverterMaxStrings: deviceMeta?.max_strings ?? null,
    stringsAreMppts: deviceMeta?.strings_are_mppts ?? false,
    armed: true, // generateAlerts already returned early when disarmed
  })
  for (const r of srResults) {
    if (r.sr == null) continue // open-circuit/offline/excluded/too-few-peers → Part 2 or no fault
    const gapPercent = Math.max(0, Math.min((1 - r.sr) * 100, 100))
    // Severity maps to the SAME SR buckets as the donut (critical→CRITICAL,
    // abnormal→WARNING) so the coloured ring and the alert list never
    // contradict each other (audit 2026-06-08). SR-level hysteresis kills
    // threshold-hover flapping.
    const severity = classifySrAlertSeverityWithHysteresis(
      r.sr,
      existingSeverity.get(r.string_number) ?? null,
    )
    if (severity) {
      // expected_value stays in AMPS (the UI's unit) and reconciles exactly
      // with gap_percent: expected = actualCurrent / sr, so actual/expected = sr
      // and (1 - actual/expected)*100 = gap_percent. Within an MPPT the shared
      // voltage makes the current ratio == the per-panel-power ratio.
      const meas = measurements.find((m) => m.string_number === r.string_number)
      const cur = meas ? Number(meas.current) : 0
      const expectedCurrent = r.sr > 0 ? cur / r.sr : undefined
      currentSeverities.set(r.string_number, { severity, gapPercent, expectedCurrent })
    }
  }

  // ── Part 2: Dead/near-dead strings (current ≤ threshold) ──────
  // Fires for ALL non-unused strings — independent of peer pool size and
  // independent of the peer-excluded flag. A 0 A string is dead whether or
  // not we have peers to compare against, and even an inverter with all
  // strings flagged peer-excluded should still surface a real cable break.
  //
  // Dead-string alerts ALWAYS carry gap_percent=null — this is the discriminator
  // that lets the NEXT cycle's existingDeadAlert recognise them and apply the
  // recovery deadband (audit 2026-06-08 #2: storing a peer gap here when a peer
  // pool existed made existingDeadAlert miss the alert, re-enabling the 0.1A
  // flap). A dead string's "gap" isn't a peer ratio anyway — the message says
  // "near-zero current". Dead detection with a recovery deadband: a string with
  // an OPEN dead-string alert stays "dead" until its current clears 2x the
  // active threshold (0.09A <-> 0.11A flap killer).
  const deadStrings = measurements.filter(m => {
    const amps = Number(m.current)
    if (existingDeadAlert.has(m.string_number)) return amps <= DEAD_STRING_RECOVERY_A
    return !isActive(amps)
  })
  for (const measurement of deadStrings) {
    // Part 2 runs AFTER Part 1, so this overwrites any peer-comparison entry —
    // a near-zero string is reported as dead (gap null), not as "% below".
    currentSeverities.set(measurement.string_number, { severity: 'CRITICAL', gapPercent: null })
  }

  // ── Part 3: Resolve / Create alerts ────────────────────────────
  // NOTE: no early return on empty currentSeverities — full recovery must
  // resolve the device's remaining open alerts (pre-existing bug, fixed).
  if (currentSeverities.size === 0 && openAlerts.length === 0) return

  // Resolve recovered or changed-severity alerts — ONE updateMany, not one
  // round-trip per alert. A fault-heavy morning at fleet scale used to fire
  // dozens of serialized single-row writes per device against the shared RDS
  // (CQ audit 2026-06-05 finding #1: the N+1 write storm).
  const toResolve = openAlerts.filter((alert) => {
    const currentState = currentSeverities.get(alert.string_number)
    return !currentState || currentState.severity !== alert.severity
  })
  if (toResolve.length > 0) {
    // Two resolution reasons, stamped separately so the history can tell
    // them apart: the string genuinely recovered vs the alert was superseded
    // by a different-severity row (band change). Usually only one group is
    // non-empty, so this stays a single write in practice.
    const recovered = toResolve.filter((a) => !currentSeverities.get(a.string_number))
    const reclassified = toResolve.filter((a) => currentSeverities.get(a.string_number))
    for (const [group, reason] of [
      [recovered, 'system:recovered'],
      [reclassified, 'system:severity-change'],
    ] as const) {
      if (group.length > 0) {
        await prisma.alerts.updateMany({
          where: { id: { in: group.map((a) => a.id) } },
          data: { resolved_at: new Date(), resolved_by: reason },
        })
      }
    }
  }
  const resolvedSet = new Set(toResolve.map((a) => `${a.string_number}:${a.severity}`))

  // Persistence bookkeeping (dawn-ramp guard): for every string the device
  // reported this cycle, increment its consecutive problem-cycle counter if it
  // is in a problem state, else reset it. A NEW alert (below) only fires once
  // the counter reaches minPersistenceCycles — absorbing transient dawn laggers.
  for (const m of measurements) {
    const key = `${deviceId}:${m.string_number}`
    if (currentSeverities.has(m.string_number)) {
      // Cap at the gate threshold — once it's high enough to fire, growing the
      // counter further is meaningless (avoids unbounded ints on a long fault).
      const next = Math.min((alertPersistenceState.get(key) ?? 0) + 1, minPersistenceCycles)
      alertPersistenceState.set(key, next)
    } else {
      alertPersistenceState.delete(key)
    }
  }

  // Create new alerts — collect rows, then ONE createMany.
  const creates: Array<{
    device_id: string; plant_id: string; string_number: number; severity: string
    message: string; expected_value: Decimal | null; actual_value: Decimal; gap_percent: Decimal | null
  }> = []
  for (const [stringNumber, state] of currentSeverities) {
    const alreadyOpen = openAlerts.some(
      (a) =>
        a.string_number === stringNumber &&
        a.severity === state.severity &&
        !resolvedSet.has(`${a.string_number}:${a.severity}`)
    )
    if (alreadyOpen) continue

    // Dawn-ramp guard: require the problem to persist before raising a NEW
    // alert. (Already-open alerts skip this — they've persisted; escalations
    // and resolutions are immediate.)
    const persistKey = `${deviceId}:${stringNumber}`
    if ((alertPersistenceState.get(persistKey) ?? 0) < minPersistenceCycles) continue

    const measurement = measurements.find((m) => m.string_number === stringNumber)
    if (!measurement) continue

    const current = Number(measurement.current)
    const voltage = Number(measurement.voltage)
    // Message taxonomy (alert-system audit 2026-06-05): the system already
    // measures voltage, so say what the data shows instead of one generic
    // "near-zero" — reverse current (backfeed/wiring, seen live at −17.46A on
    // Popular Sole INV-2) and open circuit (full voltage, no current: fuse/
    // connector) are the two most field-actionable diagnoses.
    const message =
      current <= -REVERSE_CURRENT_ALERT_A
        ? `String ${stringNumber} showing reverse current (${current.toFixed(3)}A) — possible backfeed/wiring fault`
        : !isActive(current)
          ? voltage >= OPEN_CIRCUIT_MIN_VOLTAGE_V
            ? `String ${stringNumber} open circuit suspected — ${voltage.toFixed(0)}V but near-zero current (${current.toFixed(3)}A)`
            : `String ${stringNumber} producing near-zero current (${current.toFixed(3)}A)`
          : `String ${stringNumber} is ${(state.gapPercent ?? 0).toFixed(1)}% below average`

    // gap_percent NULL on the alert row also serves as the discriminator for
    // peer-comparison vs dead-string alerts — used by the admin auto-resolve
    // logic to scope which alerts get cleared on flag toggles.
    // Guard against non-finite values reaching the DB: new Decimal(NaN/Infinity)
    // does NOT throw at construction but rejects the whole createMany, which
    // would silently drop the device's entire alert batch (audit 2026-06-08).
    const finiteDec = (n: number | null | undefined, dp: number): Decimal | null =>
      n != null && Number.isFinite(n) ? new Decimal(n.toFixed(dp)) : null
    creates.push({
      device_id: deviceId,
      plant_id: plantId,
      string_number: stringNumber,
      severity: state.severity,
      message,
      expected_value: state.expectedCurrent != null
        ? finiteDec(state.expectedCurrent, 3)
        : (state.gapPercent !== null ? finiteDec(peerAvgCurrent, 3) : null),
      actual_value: measurement.current,
      gap_percent: state.gapPercent !== null ? finiteDec(state.gapPercent, 1) : null,
    })
  }
  if (creates.length > 0) {
    // skipDuplicates: the partial unique index `alerts_open_unique_idx`
    // (migration 2026-06-09) forbids two OPEN alerts for the same
    // (device_id, string_number, severity). We already de-dup against
    // openAlerts above, so this only matters under a rare race between
    // overlapping cycles — and there it must be a silent no-op, never a
    // failed batch that drops the device's other new alerts.
    await prisma.alerts.createMany({ data: creates, skipDuplicates: true })
  }
}

// Pakistan Standard Time (PKT) is UTC+5 with no daylight saving transitions.
// Hardcoded offset is safe because Pakistan has not observed DST since 2010.
// If DST is ever reintroduced, replace with a proper timezone library.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

function getPKTHourStart(): Date {
  const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
  const hourStart = new Date(Date.UTC(
    nowPKT.getUTCFullYear(),
    nowPKT.getUTCMonth(),
    nowPKT.getUTCDate(),
    nowPKT.getUTCHours(),
    0, 0, 0
  ))
  // Convert back to UTC for DB query
  hourStart.setTime(hourStart.getTime() - PKT_OFFSET_MS)
  return hourStart
}

function getPKTDayStart(): Date {
  const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
  const dayStart = new Date(Date.UTC(
    nowPKT.getUTCFullYear(),
    nowPKT.getUTCMonth(),
    nowPKT.getUTCDate(),
    0, 0, 0, 0
  ))
  // Convert back to UTC for DB query
  dayStart.setTime(dayStart.getTime() - PKT_OFFSET_MS)
  return dayStart
}

// Returns PKT date as UTC midnight — safe for PostgreSQL DATE column storage.
// getPKTDayStart() returns e.g. 2026-03-27T19:00:00Z (Mar 28 midnight PKT in UTC),
// which PostgreSQL DATE truncates to 2026-03-27 (wrong). This function returns
// 2026-03-28T00:00:00Z so DATE truncation gives the correct PKT date.
export function getPKTDateForDB(): Date {
  const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
  return new Date(Date.UTC(
    nowPKT.getUTCFullYear(),
    nowPKT.getUTCMonth(),
    nowPKT.getUTCDate(),
    0, 0, 0, 0
  ))
}

const avg = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

const safeMin = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => Math.min(a, b), Infinity) : null

const safeMax = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => Math.max(a, b), -Infinity) : null

export async function updateHourlyAggregates(
  deviceId: string,
  plantId: string,
  _maxStrings: number,
  configs?: StringConfigSets,
): Promise<void> {
  const hourStart = getPKTHourStart()

  // Fetch ALL measurements for this device in one query
  const rawMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: hourStart },
    },
    select: { string_number: true, voltage: true, current: true, power: true },
  })

  if (rawMeasurements.length === 0) return

  // Skip admin-flagged unused strings — don't pollute string_hourly with
  // induction-leak noise from physically-empty PV ports.
  const { unusedSet } = configs ?? (await loadStringConfigs(deviceId))
  const usedRaw = unusedSet.size > 0
    ? rawMeasurements.filter(m => !unusedSet.has(m.string_number))
    : rawMeasurements
  if (usedRaw.length === 0) return

  // Drop physically-impossible sensor readings before aggregation so
  // string_hourly.avg_power / avg_current / max_current stay honest.
  const allMeasurements = dropSensorFaults(usedRaw)
  if (allMeasurements.length === 0) return

  // Group by string_number
  const byString = new Map<number, typeof allMeasurements>()
  for (const m of allMeasurements) {
    const group = byString.get(m.string_number) || []
    group.push(m)
    byString.set(m.string_number, group)
  }

  // Batch upserts
  const upserts = []
  for (const [stringNumber, measurements] of byString) {
    const voltages = measurements.map((m) => Number(m.voltage)).filter((v) => v > 0)
    const currents = filterActive(measurements.map((m) => Number(m.current)))
    const powers = measurements.map((m) => Number(m.power)).filter((p) => p > 0)

    // V1: median-within-hour current + how many active readings landed in the hour.
    // The settled/live daily metric is median-of-medians over these (8AM–4PM PKT),
    // and completeness = Σ reading_count / 96. Median is over active readings (filterActive),
    // matching avg_current's basis; reading_count counts ALL 5-min samples received so a
    // dead string reporting ~0A is still 100% complete (and correctly flagged Dead).
    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
      median_current: currents.length > 0 ? new Decimal(median(currents).toFixed(3)) : null,
      reading_count: measurements.length,
    }

    upserts.push(
      prisma.string_hourly.upsert({
        where: {
          device_id_string_number_hour: {
            device_id: deviceId,
            string_number: stringNumber,
            hour: hourStart,
          },
        },
        update: data,
        create: {
          device_id: deviceId,
          plant_id: plantId,
          string_number: stringNumber,
          hour: hourStart,
          ...data,
        },
      })
    )
  }

  await prisma.$transaction(upserts)
}

export async function updateDailyAggregates(
  deviceId: string,
  plantId: string,
  _maxStrings: number,
  configs?: StringConfigSets,
  deviceMeta?: { model: string | null; max_strings: number | null; strings_are_mppts?: boolean },
): Promise<void> {
  const dayStart = getPKTDayStart()
  const pktDate = getPKTDateForDB()

  // Fetch ALL measurements for this device today (including timestamp for trapezoidal energy)
  const rawMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: dayStart },
    },
    select: { string_number: true, voltage: true, current: true, power: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  })

  if (rawMeasurements.length === 0) return

  // Skip admin-flagged unused strings — keep string_daily clean of induction
  // noise from empty PV ports.
  const { unusedSet, peerExcludedSet } =
    configs ?? (await loadStringConfigs(deviceId))
  const usedRaw = unusedSet.size > 0
    ? rawMeasurements.filter(m => !unusedSet.has(m.string_number))
    : rawMeasurements
  if (usedRaw.length === 0) return

  // Drop physically-impossible sensor readings before any daily math.
  // Without this, a single CT fault (108 A, 998 A, etc.) pushes the
  // string's computed Performance to the 100% cap and stores a
  // misleadingly-green row in string_daily. Also inflates avg_power
  // and the trapezoidal energy integral.
  const allMeasurements = dropSensorFaults(usedRaw)
  if (allMeasurements.length === 0) return

  // Group by string_number
  const byString = new Map<number, typeof allMeasurements>()
  for (const m of allMeasurements) {
    const group = byString.get(m.string_number) || []
    group.push(m)
    byString.set(m.string_number, group)
  }

  // Today's LIVE verdict — V1 current-vs-peer-median, computed via the SAME shared
  // window/median/completeness helper the settled-day job uses (buildPerfInputsFromHourly),
  // so live-today === the settled value once the day completes. Built from today's raw
  // 5-min readings: per-hour MEDIAN current (not mean) + reading_count, restricted to the
  // 8AM–4PM PKT window. Completeness is gated against expected-SO-FAR (12 readings ×
  // elapsed window-hours, min 1 hour's worth) — early in the window a thin partial day
  // is not punished as "insufficient". The 01:30 PKT settled-day job re-finalizes with the
  // full-day denominator. (Keeps the NOC today-donut alive intraday — review C-1.)
  const READINGS_PER_HOUR = PERF_EXPECTED_READINGS / (PERF_WINDOW_END_HOUR_PKT - PERF_WINDOW_START_HOUR_PKT)
  const hourlyRows: HourlyMedianRow[] = []
  for (const [sn, ms] of byString) {
    // Per hour: median over ACTIVE readings (matches updateHourlyAggregates'
    // filterActive basis) + reading_count of ALL received samples (spec §9:
    // completeness counts readings received regardless of value). This makes the
    // live-today median_current/reading_count identical to what the hourly
    // aggregator persists, so live === settled once the day completes (review C-1).
    const hb = new Map<number, { active: number[]; received: number }>()
    for (const m of ms) {
      const cur = Number(m.current)
      if (!Number.isFinite(cur)) continue
      const hk = Math.floor(m.timestamp.getTime() / 3_600_000)
      const e = hb.get(hk) ?? { active: [], received: 0 }
      e.received += 1
      if (isActive(cur)) e.active.push(cur)
      hb.set(hk, e)
    }
    for (const [hk, e] of hb) {
      hourlyRows.push({
        string_number: sn,
        hour: new Date(hk * 3_600_000),
        // no active readings → 0, matching the aggregator's NULL→0 that the
        // settled path applies before buildPerfInputsFromHourly.
        median_current: e.active.length > 0 ? median(e.active) : 0,
        reading_count: e.received,
      })
    }
  }
  // Elapsed window-hours so far today (PKT). At/after 4PM the full 8h are elapsed;
  // before 8AM none are (clamped to ≥1 hour so the denominator is never zero).
  const nowPktHour = new Date(Date.now() + PKT_OFFSET_MS).getUTCHours()
  const elapsedWindowHours = Math.min(
    Math.max(nowPktHour - PERF_WINDOW_START_HOUR_PKT, 0),
    PERF_WINDOW_END_HOUR_PKT - PERF_WINDOW_START_HOUR_PKT,
  )
  const expectedSoFar = Math.max(elapsedWindowHours, 1) * READINGS_PER_HOUR
  const { perfInputs: todayPerfInputs, availability: todayAvail, completeness: todayCompleteness } =
    buildPerfInputsFromHourly(hourlyRows, { unused: unusedSet, peerExcluded: peerExcludedSet }, expectedSoFar)
  const todayPerfByString = new Map(
    scoreStringPerformance(todayPerfInputs).map(r => [r.string_number, r] as const),
  )

  // Batch upserts
  const upserts = []
  for (const [stringNumber, measurements] of byString) {
    const voltages = measurements.map((m) => Number(m.voltage)).filter((v) => v > 0)
    const currents = filterActive(measurements.map((m) => Number(m.current)))
    const powers = measurements.map((m) => Number(m.power)).filter((p) => p > 0)

    // Trapezoidal energy integration: ((P_i + P_i+1) / 2) × Δt
    // More accurate than rectangular (P_i × Δt) — validated within 1.3% of inverter meter
    let energyWh = 0
    for (let i = 0; i < measurements.length - 1; i++) {
      const p1 = Number(measurements[i].power)
      const p2 = Number(measurements[i + 1].power)
      const t1 = measurements[i].timestamp.getTime()
      const t2 = measurements[i + 1].timestamp.getTime()
      const dtHours = (t2 - t1) / (1000 * 3600) // milliseconds to hours
      if (dtHours > 0 && dtHours < 1) { // skip gaps > 1 hour (missing data, not real interval)
        energyWh += ((p1 + p2) / 2) * dtHours
      }
    }
    const energyKwh = energyWh / 1000

    // Today's LIVE verdict for this string — same current-vs-peer-median pipeline
    // the settled-day job uses, so live-today === the value the 01:30 PKT settled
    // job will write when the day completes (review C-1). Null until the day has
    // enough comparable sun-up hours to score (prepSettledDayInputs → no_data).
    const perf = todayPerfByString.get(stringNumber)
    const av = todayAvail.get(stringNumber)
    const availPct = av ? computeOperatingAvailability(av.producingHours, av.sunUpHours) : null
    const comp = todayCompleteness.get(stringNumber) ?? null

    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
      energy_kwh: energyKwh > 0 ? new Decimal(energyKwh.toFixed(3)) : null,
      performance: perf?.performance != null ? new Decimal(perf.performance.toFixed(2)) : null, // DISPLAY ≤100
      health_score: perf?.performance != null ? new Decimal(perf.performance.toFixed(2)) : null,
      raw_performance: perf?.raw_performance != null ? new Decimal(perf.raw_performance.toFixed(2)) : null,
      data_completeness: comp != null ? new Decimal(comp.toFixed(2)) : null,
      availability: availPct != null ? new Decimal(availPct.toFixed(2)) : null,
    }

    upserts.push(
      prisma.string_daily.upsert({
        where: {
          device_id_string_number_date: {
            device_id: deviceId,
            string_number: stringNumber,
            date: pktDate,
          },
        },
        update: data,
        create: {
          device_id: deviceId,
          plant_id: plantId,
          string_number: stringNumber,
          date: pktDate,
          ...data,
        },
      })
    )
  }

  await prisma.$transaction(upserts)
}
