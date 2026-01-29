import { prisma } from '@/lib/prisma'
import { huaweiClient } from '@/lib/huawei-client'
import { Decimal } from '@prisma/client/runtime/library'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000

export async function pollAll(): Promise<void> {
  console.log('[Poller] Starting poll cycle...')
  const now = Date.now()

  try {
    // Step 1: Sync plants (once per hour)
    if (now - lastPlantSync > HOUR_MS) {
      await syncPlants()
      lastPlantSync = now
    }

    // Step 2: Sync devices (once per hour)
    if (now - lastDeviceSync > HOUR_MS) {
      await syncDevices()
      lastDeviceSync = now
    }

    // Step 3: Fetch real-time string data (every poll)
    await fetchStringData()

    console.log('[Poller] Poll cycle complete.')
  } catch (error) {
    console.error('[Poller] Error during poll cycle:', error)
  }
}

async function syncPlants(): Promise<void> {
  console.log('[Poller] Syncing plants...')
  const plants = await huaweiClient.getPlantList()

  for (const plant of plants) {
    await prisma.plants.upsert({
      where: { id: plant.plantCode },
      update: {
        plant_name: plant.plantName,
        capacity_kw: plant.capacity ? new Decimal(plant.capacity) : null,
        address: plant.plantAddress || null,
        latitude: plant.latitude ? new Decimal(plant.latitude) : null,
        longitude: plant.longitude ? new Decimal(plant.longitude) : null,
        health_state: plant.healthState ?? null,
        last_synced: new Date(),
      },
      create: {
        id: plant.plantCode,
        plant_name: plant.plantName,
        capacity_kw: plant.capacity ? new Decimal(plant.capacity) : null,
        address: plant.plantAddress || null,
        latitude: plant.latitude ? new Decimal(plant.latitude) : null,
        longitude: plant.longitude ? new Decimal(plant.longitude) : null,
        health_state: plant.healthState ?? null,
        last_synced: new Date(),
      },
    })
  }

  console.log(`[Poller] Synced ${plants.length} plants`)
}

async function syncDevices(): Promise<void> {
  console.log('[Poller] Syncing devices...')
  const plants = await prisma.plants.findMany({ select: { id: true } })
  const plantCodes = plants.map((p) => p.id)

  if (plantCodes.length === 0) {
    console.log('[Poller] No plants found, skipping device sync')
    return
  }

  const devices = await huaweiClient.getDeviceList(plantCodes)
  const inverters = devices.filter(
    (d) => d.devTypeId === 1 || d.devTypeId === 38
  )

  for (const device of inverters) {
    await prisma.devices.upsert({
      where: { id: String(device.id) },
      update: {
        device_name: device.devName,
        last_synced: new Date(),
      },
      create: {
        id: String(device.id),
        plant_id: device.stationCode,
        device_name: device.devName,
        device_type_id: device.devTypeId,
        model: device.softwareVersion || null,
        max_strings: null,
        last_synced: new Date(),
      },
    })
  }

  console.log(
    `[Poller] Synced ${inverters.length} inverters out of ${devices.length} total devices`
  )
}

async function fetchStringData(): Promise<void> {
  console.log('[Poller] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: { device_type_id: { in: [1, 38] } },
    select: {
      id: true,
      plant_id: true,
      device_type_id: true,
      max_strings: true,
    },
  })

  if (devices.length === 0) {
    console.log('[Poller] No inverters found, skipping string data fetch')
    return
  }

  // Group devices by type for batch API calls
  const groupedByType = new Map<number, typeof devices>()
  for (const device of devices) {
    const group = groupedByType.get(device.device_type_id) || []
    group.push(device)
    groupedByType.set(device.device_type_id, group)
  }

  for (const [devTypeId, typeDevices] of groupedByType) {
    const devIds = typeDevices.map((d) => d.id)

    // Batch in groups of 100
    for (let i = 0; i < devIds.length; i += 100) {
      const batch = devIds.slice(i, i + 100)
      const realtimeData = await huaweiClient.getDeviceRealtimeData(
        batch,
        devTypeId
      )

      for (const data of realtimeData) {
        const device = typeDevices.find((d) => d.id === data.devId)
        if (!device) continue

        const maxStrings = device.max_strings || detectMaxStrings(data.dataItemMap)
        if (maxStrings > 0 && !device.max_strings) {
          await prisma.devices.update({
            where: { id: device.id },
            data: { max_strings: maxStrings },
          })
        }

        const measurements: Array<{
          device_id: string
          plant_id: string
          string_number: number
          voltage: Decimal
          current: Decimal
          power: Decimal
        }> = []

        for (let s = 1; s <= maxStrings; s++) {
          const voltage = data.dataItemMap[`pv${s}_u`] || 0
          const current = data.dataItemMap[`pv${s}_i`] || 0
          const power = voltage * current

          if (voltage > 0 || current > 0) {
            measurements.push({
              device_id: device.id,
              plant_id: device.plant_id,
              string_number: s,
              voltage: new Decimal(voltage.toFixed(2)),
              current: new Decimal(current.toFixed(3)),
              power: new Decimal(power.toFixed(2)),
            })
          }
        }

        // Bulk insert measurements
        if (measurements.length > 0) {
          await prisma.string_measurements.createMany({
            data: measurements.map((m) => ({
              ...m,
              timestamp: new Date(),
            })),
          })
        }

        // Generate alerts
        await generateAlerts(device.id, device.plant_id, measurements)

        // Update hourly and daily aggregates
        await updateHourlyAggregates(device.id, device.plant_id, maxStrings)
        await updateDailyAggregates(device.id, device.plant_id, maxStrings)
      }
    }
  }

  console.log('[Poller] String data fetch complete')
}

function detectMaxStrings(dataItemMap: Record<string, number | null>): number {
  let max = 0
  for (const key of Object.keys(dataItemMap)) {
    const match = key.match(/^pv(\d+)_[ui]$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > max) max = num
    }
  }
  return max
}

async function generateAlerts(
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

  for (const measurement of measurements) {
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

async function updateHourlyAggregates(
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

async function updateDailyAggregates(
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

  // Get all measurements for this device today for average comparison
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
