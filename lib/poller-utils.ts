import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import {
  isActive, filterActive, computeGap, classifyAlertSeverity,
  canCompare, computePerformance, computeAvailability, computeHealthScore,
  MIN_PEERS_FOR_COMPARISON, MIN_AVG_FOR_COMPARISON,
} from '@/lib/string-health'

/** Safe parseFloat that returns 0 instead of NaN */
export function safeFloat(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

export async function generateAlerts(
  deviceId: string,
  plantId: string,
  measurements: Array<{
    string_number: number
    current: Decimal
    voltage: Decimal
    power: Decimal
  }>
): Promise<void> {
  if (measurements.length === 0) return

  const activeStrings = measurements.filter(m => isActive(Number(m.current)))
  const totalCurrent = activeStrings.reduce((sum, m) => sum + Number(m.current), 0)
  const avgCurrentAll = activeStrings.length > 0 ? totalCurrent / activeStrings.length : 0

  // Build severity map
  const currentSeverities = new Map<number, { severity: string; gapPercent: number }>()

  const canDoComparison = activeStrings.length >= MIN_PEERS_FOR_COMPARISON && avgCurrentAll >= MIN_AVG_FOR_COMPARISON

  // ── Part 1: Compare active strings against each other (leave-one-out) ──
  if (canDoComparison) {
    for (const measurement of activeStrings) {
      const current = Number(measurement.current)
      const othersTotal = totalCurrent - current
      const othersCount = activeStrings.length - 1
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
  if (canDoComparison) {
    const deadStrings = measurements.filter(m => !isActive(Number(m.current)))
    for (const measurement of deadStrings) {
      const current = Number(measurement.current)
      const gapPercent = Math.min(computeGap(current, avgCurrentAll), 100)
      currentSeverities.set(measurement.string_number, {
        severity: 'CRITICAL',
        gapPercent,
      })
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
      : `String ${stringNumber} is ${state.gapPercent.toFixed(1)}% below average`

    await prisma.alerts.create({
      data: {
        device_id: deviceId,
        plant_id: plantId,
        string_number: stringNumber,
        severity: state.severity,
        message,
        expected_value: new Decimal(avgCurrentAll.toFixed(3)),
        actual_value: measurement.current,
        gap_percent: new Decimal(state.gapPercent.toFixed(1)),
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
function getPKTDateForDB(): Date {
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
  const allMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: hourStart },
    },
    select: { string_number: true, voltage: true, current: true, power: true },
  })

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
  const allMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: dayStart },
    },
    select: { string_number: true, voltage: true, current: true, power: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  })

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
