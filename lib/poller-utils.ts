import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import {
  isActive, filterActive, computeGap, classifyAlertSeverity,
  canCompare, computePerformance, computeAvailability, computeHealthScore,
  MIN_PEERS_FOR_COMPARISON, MIN_AVG_FOR_COMPARISON,
  MAX_STRING_CURRENT_A, MAX_STRING_POWER_W,
} from '@/lib/string-health'

/** Safe parseFloat that returns 0 instead of NaN */
export function safeFloat(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
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

export async function generateAlerts(
  deviceId: string,
  plantId: string,
  rawMeasurements: Array<{
    string_number: number
    current: Decimal
    voltage: Decimal
    power: Decimal
  }>
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
  const adminConfigs = await prisma.string_configs.findMany({
    where: { device_id: deviceId },
    select: { string_number: true, is_used: true, exclude_from_peer_comparison: true },
  })
  const unusedSet = new Set(
    adminConfigs.filter(c => c.is_used === false).map(c => c.string_number),
  )
  const peerExcludedSet = new Set(
    adminConfigs.filter(c => c.exclude_from_peer_comparison === true).map(c => c.string_number),
  )
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
  _maxStrings: number
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
  const adminUnused = await prisma.string_configs.findMany({
    where: { device_id: deviceId, is_used: false },
    select: { string_number: true },
  })
  const unusedSet = new Set(adminUnused.map(c => c.string_number))
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
  _maxStrings: number
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
  const adminUnused = await prisma.string_configs.findMany({
    where: { device_id: deviceId, is_used: false },
    select: { string_number: true },
  })
  const unusedSet = new Set(adminUnused.map(c => c.string_number))
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

  // Compute inverter-wide average current (for performance score)
  const allCurrents = filterActive(allMeasurements.map((m) => Number(m.current)))
  const inverterAvgCurrent = avg(allCurrents)

  // Group by string_number
  const byString = new Map<number, typeof allMeasurements>()
  for (const m of allMeasurements) {
    const group = byString.get(m.string_number) || []
    group.push(m)
    byString.set(m.string_number, group)
  }

  // Max measurements any single string has today = "full day" reference for availability
  const maxMeasurements = Math.max(...Array.from(byString.values()).map((m) => m.length))

  // Batch upserts
  const upserts = []
  for (const [stringNumber, measurements] of byString) {
    const voltages = measurements.map((m) => Number(m.voltage)).filter((v) => v > 0)
    const currents = filterActive(measurements.map((m) => Number(m.current)))
    const powers = measurements.map((m) => Number(m.power)).filter((p) => p > 0)

    const stringAvgCurrent = avg(currents)

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

    // IEC 61724 aligned — from lib/string-health.ts (single source of truth)
    const perfScore = computePerformance(stringAvgCurrent, inverterAvgCurrent)
    const availScore = computeAvailability(measurements.length, maxMeasurements)
    const healthScore = computeHealthScore(perfScore, availScore)

    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
      health_score: healthScore !== null ? new Decimal(healthScore.toFixed(2)) : null,
      performance: perfScore !== null ? new Decimal(perfScore.toFixed(2)) : null,
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
