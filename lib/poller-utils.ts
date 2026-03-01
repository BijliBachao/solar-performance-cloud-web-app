import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

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
  const activeStrings = measurements.filter(
    (m) => Number(m.current) > 0.1
  )
  if (activeStrings.length < 2) return

  const totalCurrent = activeStrings.reduce((sum, m) => sum + Number(m.current), 0)

  // Skip alert generation during low-light conditions (Fix #18)
  const avgCurrentAll = totalCurrent / activeStrings.length
  if (avgCurrentAll < 1) return

  // Build a map of string_number -> current severity for this cycle
  const currentSeverities = new Map<number, { severity: string; gapPercent: number }>()

  for (const measurement of activeStrings) {
    const current = Number(measurement.current)
    // Compute average EXCLUDING the string being tested (Fix #13)
    const othersTotal = totalCurrent - current
    const othersCount = activeStrings.length - 1
    if (othersCount <= 0) continue
    const othersAvg = othersTotal / othersCount

    if (othersAvg <= 0) continue

    const gapPercent = ((othersAvg - current) / othersAvg) * 100

    let severity: string | null = null
    if (gapPercent > 50) severity = 'CRITICAL'
    else if (gapPercent > 25) severity = 'WARNING'
    else if (gapPercent > 10) severity = 'INFO'

    if (severity) {
      currentSeverities.set(measurement.string_number, { severity, gapPercent })
    }
  }

  // Fetch all open alerts for this device
  const openAlerts = await prisma.alerts.findMany({
    where: {
      device_id: deviceId,
      resolved_at: null,
    },
  })

  // Track which string+severity combos need a new alert
  const resolvedSet = new Set<string>() // "stringNumber:severity" keys that were resolved

  // Resolve alerts for strings that have recovered or changed severity
  for (const alert of openAlerts) {
    const currentState = currentSeverities.get(alert.string_number)
    if (!currentState || currentState.severity !== alert.severity) {
      // String recovered (gap < 10%) or severity changed — resolve
      await prisma.alerts.update({
        where: { id: alert.id },
        data: { resolved_at: new Date() },
      })
      resolvedSet.add(`${alert.string_number}:${alert.severity}`)
    }
  }

  // Create new alerts where needed
  for (const measurement of activeStrings) {
    const currentState = currentSeverities.get(measurement.string_number)
    if (!currentState) continue

    // Skip if an open alert with the same severity already exists and wasn't resolved
    const alreadyOpen = openAlerts.some(
      (a) =>
        a.string_number === measurement.string_number &&
        a.severity === currentState.severity &&
        !resolvedSet.has(`${a.string_number}:${a.severity}`)
    )
    if (alreadyOpen) continue

    const current = Number(measurement.current)
    const othersTotal = totalCurrent - current
    const othersCount = activeStrings.length - 1
    const othersAvg = othersTotal / othersCount

    await prisma.alerts.create({
      data: {
        device_id: deviceId,
        plant_id: plantId,
        string_number: measurement.string_number,
        severity: currentState.severity,
        message: `String ${measurement.string_number} is ${currentState.gapPercent.toFixed(1)}% below average`,
        expected_value: new Decimal(othersAvg.toFixed(3)),
        actual_value: measurement.current,
        gap_percent: new Decimal(currentState.gapPercent.toFixed(1)),
      },
    })
  }
}

// Pakistan timezone offset (UTC+5)
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
    const currents = measurements.map((m) => Number(m.current)).filter((c) => c > 0)
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

  // Fetch ALL measurements for this device today in one query
  const allMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: dayStart },
    },
    select: { string_number: true, voltage: true, current: true, power: true },
  })

  if (allMeasurements.length === 0) return

  // Compute inverter-wide average current (for health score)
  const allCurrents = allMeasurements
    .map((m) => Number(m.current))
    .filter((c) => c > 0)
  const inverterAvgCurrent = avg(allCurrents)

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
    const currents = measurements.map((m) => Number(m.current)).filter((c) => c > 0)
    const powers = measurements.map((m) => Number(m.power)).filter((p) => p > 0)

    const stringAvgCurrent = avg(currents)
    const healthScore = inverterAvgCurrent > 0
      ? Math.min((stringAvgCurrent / inverterAvgCurrent) * 100, 100)
      : 100

    const data = {
      avg_voltage: new Decimal(avg(voltages).toFixed(2)),
      avg_current: new Decimal(avg(currents).toFixed(3)),
      avg_power: new Decimal(avg(powers).toFixed(2)),
      min_current: safeMin(currents) !== null ? new Decimal(safeMin(currents)!.toFixed(3)) : null,
      max_current: safeMax(currents) !== null ? new Decimal(safeMax(currents)!.toFixed(3)) : null,
      health_score: new Decimal(healthScore.toFixed(2)),
    }

    upserts.push(
      prisma.string_daily.upsert({
        where: {
          device_id_string_number_date: {
            device_id: deviceId,
            string_number: stringNumber,
            date: dayStart,
          },
        },
        update: data,
        create: {
          device_id: deviceId,
          plant_id: plantId,
          string_number: stringNumber,
          date: dayStart,
          ...data,
        },
      })
    )
  }

  await prisma.$transaction(upserts)
}
