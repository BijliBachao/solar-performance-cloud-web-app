import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import {
  isActive, filterActive, computeGap, classifyAlertSeverity,
  canCompare, computeAvailability, p2pToHealthScore, readingSignature, VENDOR_TS_MAX_FUTURE_SKEW_MS,
  MIN_PEERS_FOR_COMPARISON, MIN_AVG_FOR_COMPARISON,
  MAX_STRING_CURRENT_A, MAX_STRING_POWER_W, MS_PER_HOUR,
  MIN_PRODUCTIVE_HOURS_FOR_DAILY_SCORE, MIN_PRODUCTIVE_POWER_W,
  clampToFleetCoords,
  type DeviceWriteAction,
} from '@/lib/string-health'
import { isDaylight } from '@/lib/solar-geometry'
import { scoreDailyP2P, type DailyStringInput } from '@/lib/string-health-daily'

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
    data: { resolved_at: new Date() },
  })
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
): Promise<void> {
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
  const { unusedSet, peerExcludedSet } = configs ?? (await loadStringConfigs(deviceId))
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

  // Build severity map. gapPercent is null for non-peer-comparable alerts
  // (Part 2 fires on peer-excluded strings, OR when the peer pool is too thin
  // to compute a meaningful "% below peers" — a real dead string is still a
  // dead string regardless of whether we have healthy peers to compare to).
  const currentSeverities = new Map<
    number,
    { severity: string; gapPercent: number | null }
  >()

  const canDoComparison = peerActive.length >= MIN_PEERS_FOR_COMPARISON && peerAvgCurrent >= MIN_AVG_FOR_COMPARISON

  // ── Part 1: Compare peer-pool strings against each other (leave-one-out) ──
  // Peer-excluded strings are not in peerActive, so they're skipped.
  if (canDoComparison) {
    for (const measurement of peerActive) {
      const current = Number(measurement.current)
      const othersTotal = peerTotalCurrent - current
      const othersCount = peerActive.length - 1
      if (othersCount <= 0) continue
      const othersAvg = othersTotal / othersCount
      if (othersAvg <= 0) continue

      const gapPercent = computeGap(current, othersAvg)
      const severity = classifyAlertSeverity(gapPercent)
      if (severity) {
        currentSeverities.set(measurement.string_number, { severity, gapPercent })
      }
    }
  }

  // ── Part 2: Dead/near-dead strings (current ≤ threshold) ──────
  // Fires for ALL non-unused strings — independent of peer pool size and
  // independent of the peer-excluded flag. A 0 A string is dead whether or
  // not we have peers to compare against, and even an inverter with all
  // strings flagged peer-excluded should still surface a real cable break.
  //
  // gapPercent is set ONLY when the string is in the peer pool AND the pool
  // is viable. Otherwise it's null — the alert message says "near-zero
  // current"; we don't claim a peer ratio when there isn't one.
  const deadStrings = measurements.filter(m => !isActive(Number(m.current)))
  for (const measurement of deadStrings) {
    const sn = measurement.string_number
    const inPeerPool = !peerExcludedSet.has(sn)
    if (canDoComparison && inPeerPool) {
      const current = Number(measurement.current)
      const gapPercent = Math.min(computeGap(current, peerAvgCurrent), 100)
      currentSeverities.set(sn, { severity: 'CRITICAL', gapPercent })
    } else {
      currentSeverities.set(sn, { severity: 'CRITICAL', gapPercent: null })
    }
  }

  // ── Part 3: Resolve / Create alerts ────────────────────────────
  if (currentSeverities.size === 0) return

  const openAlerts = await prisma.alerts.findMany({
    where: { device_id: deviceId, resolved_at: null },
  })

  const resolvedSet = new Set<string>()

  // Resolve recovered or changed-severity alerts
  for (const alert of openAlerts) {
    const currentState = currentSeverities.get(alert.string_number)
    if (!currentState || currentState.severity !== alert.severity) {
      await prisma.alerts.update({
        where: { id: alert.id },
        data: { resolved_at: new Date() },
      })
      resolvedSet.add(`${alert.string_number}:${alert.severity}`)
    }
  }

  // Create new alerts
  for (const [stringNumber, state] of currentSeverities) {
    const alreadyOpen = openAlerts.some(
      (a) =>
        a.string_number === stringNumber &&
        a.severity === state.severity &&
        !resolvedSet.has(`${a.string_number}:${a.severity}`)
    )
    if (alreadyOpen) continue

    const measurement = measurements.find((m) => m.string_number === stringNumber)
    if (!measurement) continue

    const current = Number(measurement.current)
    const message = !isActive(current)
      ? `String ${stringNumber} producing near-zero current (${current.toFixed(3)}A)`
      : `String ${stringNumber} is ${(state.gapPercent ?? 0).toFixed(1)}% below average`

    // gap_percent NULL on the alert row also serves as the discriminator for
    // peer-comparison vs dead-string alerts — used by the admin auto-resolve
    // logic to scope which alerts get cleared on flag toggles.
    await prisma.alerts.create({
      data: {
        device_id: deviceId,
        plant_id: plantId,
        string_number: stringNumber,
        severity: state.severity,
        message,
        expected_value: state.gapPercent !== null ? new Decimal(peerAvgCurrent.toFixed(3)) : null,
        actual_value: measurement.current,
        gap_percent: state.gapPercent !== null ? new Decimal(state.gapPercent.toFixed(1)) : null,
      },
    })
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

    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
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
  deviceMeta?: { model: string | null; max_strings: number | null },
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
  const { unusedSet, peerExcludedSet, panelCountByString } =
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

  // Max measurements any single string has today = "full day" reference for availability
  const maxMeasurements = Math.max(...Array.from(byString.values()).map((m) => m.length))

  // ── Daily Performance-to-Peers (Algorithm v2, spec §4d) ──────────────
  // health_score / performance now come from the MPPT-grouped, panel-normalised,
  // peak-window, median-anchored P2P — replacing the legacy 24h string/inverter
  // current ratio that smeared peak deficits into "healthy". scoreDailyP2P is the
  // single source of truth; we map its P2P ratio onto the 0-100 health_score scale
  // (p2pToHealthScore) so every existing consumer (Analysis, donut, dashboard)
  // buckets it unchanged.
  // Caller passes the device's model/max_strings (it already has them in scope);
  // fall back to a lookup only if not provided, to avoid a per-cycle query on the
  // shared RDS.
  const dev = deviceMeta ?? (await prisma.devices.findUnique({
    where: { id: deviceId },
    select: { model: true, max_strings: true },
  }))
  const dailyInputs: DailyStringInput[] = Array.from(byString.entries()).map(([sn, ms]) => {
    const hourBuckets = new Map<number, { sum: number; n: number }>()
    for (const m of ms) {
      const hourKey = Math.floor(m.timestamp.getTime() / MS_PER_HOUR)
      const b = hourBuckets.get(hourKey) ?? { sum: 0, n: 0 }
      b.sum += Number(m.power)
      b.n += 1
      hourBuckets.set(hourKey, b)
    }
    return {
      string_number: sn,
      panel_count: panelCountByString.get(sn) ?? null,
      is_used: true, // unused strings already filtered out above
      exclude_from_peer_comparison: peerExcludedSet.has(sn),
      hourly: Array.from(hourBuckets.entries()).map(([hour, b]) => ({ hour, avg_power_W: b.sum / b.n })),
    }
  })
  // ── Daily scoring gate (DQ v2) ────────────────────────────────────
  // A day is only scoreable once it has real production breadth: at least
  // MIN_PRODUCTIVE_HOURS distinct hours where some string averaged above the
  // power floor. Below that (e.g., the first poll cycles after PKT midnight,
  // or a day of pure night zeros) health_score stays NULL → the donut shows
  // honest "no data" instead of criticals computed from scraps.
  const productiveHours = new Set<number>()
  for (const di of dailyInputs) {
    for (const h of di.hourly) {
      if (h.avg_power_W > MIN_PRODUCTIVE_POWER_W) productiveHours.add(h.hour)
    }
  }
  const dayIsScoreable = productiveHours.size >= MIN_PRODUCTIVE_HOURS_FOR_DAILY_SCORE
  type P2PResult = ReturnType<typeof scoreDailyP2P>[number]
  const p2pByString = new Map<number, P2PResult>(
    dayIsScoreable
      ? scoreDailyP2P(dailyInputs, {
          deviceId,
          inverterModel: dev?.model ?? null,
          inverterMaxStrings: dev?.max_strings ?? null,
        }).map((r) => [r.string_number, r] as [number, P2PResult])
      : [],
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

    // Daily P2P (spec §4d) — replaces the legacy current-ratio performance.
    // performance = P2P × 100; health_score = same ratio mapped onto the 0-100
    // scale so existing bucketing (90/50) reproduces the P2P bucket exactly.
    const p2pResult = p2pByString.get(stringNumber)
    const mappedHealth = p2pToHealthScore(p2pResult?.p2p ?? null)
    const availScore = computeAvailability(measurements.length, maxMeasurements)

    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
      health_score: mappedHealth !== null ? new Decimal(mappedHealth.toFixed(2)) : null,
      performance: p2pResult?.score_persisted != null ? new Decimal(p2pResult.score_persisted.toFixed(2)) : null,
      availability: availScore !== null ? new Decimal(availScore.toFixed(2)) : null,
      energy_kwh: energyKwh > 0 ? new Decimal(energyKwh.toFixed(3)) : null,
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
