import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { SungrowClient } from '@/lib/sungrow-client'
import { PROVIDERS, DEVICE_TYPE_IDS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates } from '@/lib/poller-utils'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000

// Sungrow ps_status → our DB health_state
// Our DB: 1=disconnected, 2=faulty, 3=healthy
function mapSungrowHealthState(status: number): number {
  if (status === 1) return 3 // normal → healthy
  if (status === 2) return 2 // fault → faulty
  return 1                   // unknown → disconnected
}

// Point IDs for string-level data on Sungrow inverters
// String current: IDs 70-85 (strings 1-16), 92-93 (strings 17-18), 313-326 (strings 19-32)
// String voltage: IDs 96-111 (strings 1-16), 112-113 (strings 17-18), 7166-7179 (strings 19-32)

const STRING_CURRENT_IDS: Record<number, number> = {}
const STRING_VOLTAGE_IDS: Record<number, number> = {}

for (let i = 0; i < 16; i++) {
  STRING_CURRENT_IDS[i + 1] = 70 + i
  STRING_VOLTAGE_IDS[i + 1] = 96 + i
}
STRING_CURRENT_IDS[17] = 92
STRING_CURRENT_IDS[18] = 93
STRING_VOLTAGE_IDS[17] = 112
STRING_VOLTAGE_IDS[18] = 113
for (let i = 0; i < 14; i++) {
  STRING_CURRENT_IDS[19 + i] = 313 + i
  STRING_VOLTAGE_IDS[19 + i] = 7166 + i
}

// All point IDs we need (string current + voltage)
const ALL_POINT_IDS = [
  ...Object.values(STRING_CURRENT_IDS),
  ...Object.values(STRING_VOLTAGE_IDS),
]

export async function pollSungrow(): Promise<void> {
  console.log('[Sungrow] Starting poll cycle...')

  if (!process.env.SUNGROW_APP_KEY || !process.env.SUNGROW_SECRET_KEY) {
    console.log('[Sungrow] No SUNGROW_APP_KEY/SUNGROW_SECRET_KEY configured, skipping')
    return
  }
  if (!process.env.SUNGROW_USERNAME || !process.env.SUNGROW_PASSWORD) {
    console.log('[Sungrow] No SUNGROW_USERNAME/SUNGROW_PASSWORD configured, skipping')
    return
  }

  const client = new SungrowClient()
  const now = Date.now()

  try {
    let plantsSyncedThisCycle = false

    if (now - lastPlantSync > HOUR_MS) {
      await syncSungrowPlants(client)
      lastPlantSync = now
      plantsSyncedThisCycle = true
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncSungrowDevices(client)
      lastDeviceSync = now
    }

    if (!plantsSyncedThisCycle) {
      await syncSungrowPlantHealth(client)
    }

    await fetchSungrowStringData(client)

    console.log('[Sungrow] Poll cycle complete.')
  } catch (error) {
    console.error('[Sungrow] Error during poll cycle:', error)
  }
}

async function syncSungrowPlants(client: SungrowClient): Promise<void> {
  console.log('[Sungrow] Syncing plants...')
  const stations = await client.getPowerStationList()

  await prisma.$transaction(
    stations.map((station) =>
      prisma.plants.upsert({
        where: { id: station.ps_id },
        update: {
          plant_name: station.ps_name,
          capacity_kw: station.total_capacity_kw
            ? new Decimal(station.total_capacity_kw)
            : null,
          latitude: station.latitude ? new Decimal(station.latitude) : null,
          longitude: station.longitude ? new Decimal(station.longitude) : null,
          address: station.ps_location || null,
          health_state: mapSungrowHealthState(station.ps_status),
          provider: PROVIDERS.SUNGROW,
          last_synced: new Date(),
        },
        create: {
          id: station.ps_id,
          plant_name: station.ps_name,
          capacity_kw: station.total_capacity_kw
            ? new Decimal(station.total_capacity_kw)
            : null,
          latitude: station.latitude ? new Decimal(station.latitude) : null,
          longitude: station.longitude ? new Decimal(station.longitude) : null,
          address: station.ps_location || null,
          health_state: mapSungrowHealthState(station.ps_status),
          provider: PROVIDERS.SUNGROW,
          last_synced: new Date(),
        },
      })
    )
  )

  console.log(`[Sungrow] Synced ${stations.length} plants`)
}

async function syncSungrowPlantHealth(client: SungrowClient): Promise<void> {
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.SUNGROW },
    select: { id: true },
  })

  if (plants.length === 0) return

  try {
    const stations = await client.getPowerStationList()
    for (const station of stations) {
      await prisma.plants.update({
        where: { id: station.ps_id },
        data: { health_state: mapSungrowHealthState(station.ps_status) },
      })
    }
  } catch (error) {
    console.error('[Sungrow] Failed to sync plant health:', error)
  }
}

async function syncSungrowDevices(client: SungrowClient): Promise<void> {
  console.log('[Sungrow] Syncing devices...')
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.SUNGROW },
    select: { id: true },
  })

  if (plants.length === 0) {
    console.log('[Sungrow] No plants found, skipping device sync')
    return
  }

  let totalInverters = 0

  for (const plant of plants) {
    const inverters = await client.getDeviceList(plant.id)

    if (inverters.length > 0) {
      await prisma.$transaction(
        inverters.map((inv) =>
          // Use device_sn as DB id (real-time API uses sn_list)
          prisma.devices.upsert({
            where: { id: inv.device_sn },
            update: {
              device_name: inv.device_name,
              plant_id: plant.id,
              device_type_id: DEVICE_TYPE_IDS.SUNGROW_INVERTER,
              provider: PROVIDERS.SUNGROW,
              last_synced: new Date(),
            },
            create: {
              id: inv.device_sn,
              plant_id: plant.id,
              device_name: inv.device_name,
              device_type_id: DEVICE_TYPE_IDS.SUNGROW_INVERTER,
              max_strings: null,
              provider: PROVIDERS.SUNGROW,
              last_synced: new Date(),
            },
          })
        )
      )
      totalInverters += inverters.length
    }
  }

  console.log(`[Sungrow] Synced ${totalInverters} inverters`)
}

async function fetchSungrowStringData(client: SungrowClient): Promise<void> {
  console.log('[Sungrow] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.SUNGROW,
      device_type_id: DEVICE_TYPE_IDS.SUNGROW_INVERTER,
    },
    select: {
      id: true,       // device_sn
      plant_id: true,
      max_strings: true,
    },
  })

  if (devices.length === 0) {
    console.log('[Sungrow] No inverters found, skipping string data fetch')
    return
  }

  for (const device of devices) {
    try {
      const results = await client.getDeviceRealTimeData(
        [device.id], // device_sn
        ALL_POINT_IDS
      )

      if (results.length === 0) continue
      const dp = results[0]

      // Detect active strings from data
      let detectedStrings = 0
      for (let s = 32; s >= 1; s--) {
        const cid = STRING_CURRENT_IDS[s]
        const vid = STRING_VOLTAGE_IDS[s]
        if (!cid || !vid) continue
        const current = parseFloat(dp[`p${cid}`]) || 0
        const voltage = parseFloat(dp[`p${vid}`]) || 0
        if (current > 0 || voltage > 0) {
          detectedStrings = s
          break
        }
      }

      const maxStrings = device.max_strings || detectedStrings || 24

      // Update max_strings if discovered
      if (detectedStrings > 0 && detectedStrings !== device.max_strings) {
        await prisma.devices.update({
          where: { id: device.id },
          data: { max_strings: detectedStrings },
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
        const currentPointId = STRING_CURRENT_IDS[s]
        const voltagePointId = STRING_VOLTAGE_IDS[s]
        if (!currentPointId || !voltagePointId) continue

        const current = parseFloat(dp[`p${currentPointId}`]) || 0
        const voltage = parseFloat(dp[`p${voltagePointId}`]) || 0
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
      console.error(`[Sungrow] Failed to fetch string data for device ${device.id}:`, error)
    }
  }

  console.log('[Sungrow] String data fetch complete')
}
