import { prisma } from '@/lib/prisma'
import { huaweiClient } from '@/lib/huawei-client'
import { Decimal } from '@prisma/client/runtime/library'
import { PROVIDERS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates } from '@/lib/poller-utils'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000

export async function pollHuawei(): Promise<void> {
  console.log('[Huawei] Starting poll cycle...')
  const now = Date.now()

  try {
    if (now - lastPlantSync > HOUR_MS) {
      await syncPlants()
      lastPlantSync = now
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncDevices()
      lastDeviceSync = now
    }

    await syncPlantHealth()
    await fetchStringData()

    console.log('[Huawei] Poll cycle complete.')
  } catch (error) {
    console.error('[Huawei] Error during poll cycle:', error)
  }
}

async function syncPlants(): Promise<void> {
  console.log('[Huawei] Syncing plants...')
  const plants = await huaweiClient.getPlantList()

  await prisma.$transaction(
    plants.map((plant) =>
      prisma.plants.upsert({
        where: { id: plant.plantCode },
        update: {
          plant_name: plant.plantName,
          capacity_kw: plant.capacity ? new Decimal(plant.capacity) : null,
          address: plant.plantAddress || null,
          latitude: plant.latitude ? new Decimal(plant.latitude) : null,
          longitude: plant.longitude ? new Decimal(plant.longitude) : null,
          health_state: plant.healthState ?? null,
          provider: PROVIDERS.HUAWEI,
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
          provider: PROVIDERS.HUAWEI,
          last_synced: new Date(),
        },
      })
    )
  )

  console.log(`[Huawei] Synced ${plants.length} plants`)
}

async function syncPlantHealth(): Promise<void> {
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.HUAWEI },
    select: { id: true },
  })
  const plantCodes = plants.map((p) => p.id)
  if (plantCodes.length === 0) return

  try {
    const kpis = await huaweiClient.getPlantRealKpi(plantCodes)
    for (const kpi of kpis) {
      await prisma.plants.update({
        where: { id: kpi.stationCode },
        data: { health_state: kpi.healthState },
      })
    }
  } catch (error) {
    console.error('[Huawei] Failed to sync plant health:', error)
  }
}

async function syncDevices(): Promise<void> {
  console.log('[Huawei] Syncing devices...')
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.HUAWEI },
    select: { id: true },
  })
  const plantCodes = plants.map((p) => p.id)

  if (plantCodes.length === 0) {
    console.log('[Huawei] No plants found, skipping device sync')
    return
  }

  const devices = await huaweiClient.getDeviceList(plantCodes)
  const inverters = devices.filter(
    (d) => d.devTypeId === 1 || d.devTypeId === 38
  )

  await prisma.$transaction(
    inverters.map((device) =>
      prisma.devices.upsert({
        where: { id: String(device.id) },
        update: {
          device_name: device.devName,
          plant_id: device.stationCode,
          device_type_id: device.devTypeId,
          provider: PROVIDERS.HUAWEI,
          last_synced: new Date(),
        },
        create: {
          id: String(device.id),
          plant_id: device.stationCode,
          device_name: device.devName,
          device_type_id: device.devTypeId,
          model: device.softwareVersion || null,
          max_strings: null,
          provider: PROVIDERS.HUAWEI,
          last_synced: new Date(),
        },
      })
    )
  )

  console.log(
    `[Huawei] Synced ${inverters.length} inverters out of ${devices.length} total devices`
  )
}

async function fetchStringData(): Promise<void> {
  console.log('[Huawei] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.HUAWEI,
      device_type_id: { in: [1, 38] },
    },
    select: {
      id: true,
      plant_id: true,
      device_type_id: true,
      max_strings: true,
    },
  })

  if (devices.length === 0) {
    console.log('[Huawei] No inverters found, skipping string data fetch')
    return
  }

  const groupedByType = new Map<number, typeof devices>()
  for (const device of devices) {
    const group = groupedByType.get(device.device_type_id) || []
    group.push(device)
    groupedByType.set(device.device_type_id, group)
  }

  for (const [devTypeId, typeDevices] of groupedByType) {
    const devIds = typeDevices.map((d) => d.id)

    for (let i = 0; i < devIds.length; i += 100) {
      const batch = devIds.slice(i, i + 100)
      const realtimeData = await huaweiClient.getDeviceRealtimeData(
        batch,
        devTypeId
      )

      for (const data of realtimeData) {
        const device = typeDevices.find((d) => d.id === data.devId)
        if (!device) continue

        try {
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

          if (measurements.length > 0) {
            await prisma.string_measurements.createMany({
              data: measurements.map((m) => ({
                ...m,
                timestamp: new Date(),
              })),
            })
          }

          await generateAlerts(device.id, device.plant_id, measurements)
          await updateHourlyAggregates(device.id, device.plant_id, maxStrings)
          await updateDailyAggregates(device.id, device.plant_id, maxStrings)
        } catch (error) {
          console.error(`[Huawei] Failed to process device ${device.id}:`, error)
        }
      }
    }
  }

  console.log('[Huawei] String data fetch complete')
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
