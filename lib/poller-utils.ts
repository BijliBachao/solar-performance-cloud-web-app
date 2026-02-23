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

  const avgCurrent =
    activeStrings.reduce((sum, m) => sum + Number(m.current), 0) /
    activeStrings.length

  if (avgCurrent <= 0) return

  for (const measurement of activeStrings) {
    const current = Number(measurement.current)
    const gapPercent = ((avgCurrent - current) / avgCurrent) * 100

    let severity: string | null = null
    if (gapPercent > 50) severity = 'CRITICAL'
    else if (gapPercent > 25) severity = 'WARNING'
    else if (gapPercent > 10) severity = 'INFO'

    if (severity) {
      const existingAlert = await prisma.alerts.findFirst({
        where: {
          device_id: deviceId,
          string_number: measurement.string_number,
          severity,
          resolved_at: null,
        },
      })

      if (!existingAlert) {
        await prisma.alerts.create({
          data: {
            device_id: deviceId,
            plant_id: plantId,
            string_number: measurement.string_number,
            severity,
            message: `String ${measurement.string_number} is ${gapPercent.toFixed(1)}% below average`,
            expected_value: new Decimal(avgCurrent.toFixed(3)),
            actual_value: measurement.current,
            gap_percent: new Decimal(gapPercent.toFixed(1)),
          },
        })
      }
    }
  }
}

export async function updateHourlyAggregates(
  deviceId: string,
  plantId: string,
  maxStrings: number
): Promise<void> {
  const now = new Date()
  const hourStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    0,
    0,
    0
  )

  for (let s = 1; s <= maxStrings; s++) {
    const measurements = await prisma.string_measurements.findMany({
      where: {
        device_id: deviceId,
        string_number: s,
        timestamp: { gte: hourStart },
      },
      select: { voltage: true, current: true, power: true },
    })

    if (measurements.length === 0) continue

    const voltages = measurements
      .map((m) => Number(m.voltage))
      .filter((v) => v > 0)
    const currents = measurements
      .map((m) => Number(m.current))
      .filter((c) => c > 0)
    const powers = measurements
      .map((m) => Number(m.power))
      .filter((p) => p > 0)

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    await prisma.string_hourly.upsert({
      where: {
        device_id_string_number_hour: {
          device_id: deviceId,
          string_number: s,
          hour: hourStart,
        },
      },
      update: {
        avg_voltage: new Decimal(avg(voltages).toFixed(2)),
        avg_current: new Decimal(avg(currents).toFixed(3)),
        avg_power: new Decimal(avg(powers).toFixed(2)),
        min_current:
          currents.length > 0
            ? new Decimal(Math.min(...currents).toFixed(3))
            : null,
        max_current:
          currents.length > 0
            ? new Decimal(Math.max(...currents).toFixed(3))
            : null,
      },
      create: {
        device_id: deviceId,
        plant_id: plantId,
        string_number: s,
        hour: hourStart,
        avg_voltage: new Decimal(avg(voltages).toFixed(2)),
        avg_current: new Decimal(avg(currents).toFixed(3)),
        avg_power: new Decimal(avg(powers).toFixed(2)),
        min_current:
          currents.length > 0
            ? new Decimal(Math.min(...currents).toFixed(3))
            : null,
        max_current:
          currents.length > 0
            ? new Decimal(Math.max(...currents).toFixed(3))
            : null,
      },
    })
  }
}

export async function updateDailyAggregates(
  deviceId: string,
  plantId: string,
  maxStrings: number
): Promise<void> {
  const now = new Date()
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  )

  const allDeviceMeasurements = await prisma.string_measurements.findMany({
    where: {
      device_id: deviceId,
      timestamp: { gte: dayStart },
      current: { gt: 0 },
    },
    select: { current: true },
  })

  const inverterAvgCurrent =
    allDeviceMeasurements.length > 0
      ? allDeviceMeasurements.reduce((sum, m) => sum + Number(m.current), 0) /
        allDeviceMeasurements.length
      : 0

  for (let s = 1; s <= maxStrings; s++) {
    const measurements = await prisma.string_measurements.findMany({
      where: {
        device_id: deviceId,
        string_number: s,
        timestamp: { gte: dayStart },
      },
      select: { voltage: true, current: true, power: true },
    })

    if (measurements.length === 0) continue

    const voltages = measurements
      .map((m) => Number(m.voltage))
      .filter((v) => v > 0)
    const currents = measurements
      .map((m) => Number(m.current))
      .filter((c) => c > 0)
    const powers = measurements
      .map((m) => Number(m.power))
      .filter((p) => p > 0)

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    const stringAvgCurrent = avg(currents)
    const healthScore =
      inverterAvgCurrent > 0
        ? (stringAvgCurrent / inverterAvgCurrent) * 100
        : 100

    await prisma.string_daily.upsert({
      where: {
        device_id_string_number_date: {
          device_id: deviceId,
          string_number: s,
          date: dayStart,
        },
      },
      update: {
        avg_voltage: new Decimal(avg(voltages).toFixed(2)),
        avg_current: new Decimal(avg(currents).toFixed(3)),
        avg_power: new Decimal(avg(powers).toFixed(2)),
        min_current:
          currents.length > 0
            ? new Decimal(Math.min(...currents).toFixed(3))
            : null,
        max_current:
          currents.length > 0
            ? new Decimal(Math.max(...currents).toFixed(3))
            : null,
        health_score: new Decimal(healthScore.toFixed(2)),
      },
      create: {
        device_id: deviceId,
        plant_id: plantId,
        string_number: s,
        date: dayStart,
        avg_voltage: new Decimal(avg(voltages).toFixed(2)),
        avg_current: new Decimal(avg(currents).toFixed(3)),
        avg_power: new Decimal(avg(powers).toFixed(2)),
        min_current:
          currents.length > 0
            ? new Decimal(Math.min(...currents).toFixed(3))
            : null,
        max_current:
          currents.length > 0
            ? new Decimal(Math.max(...currents).toFixed(3))
            : null,
        health_score: new Decimal(healthScore.toFixed(2)),
      },
    })
  }
}
