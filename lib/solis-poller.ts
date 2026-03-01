import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { SolisClient } from '@/lib/solis-client'
import { PROVIDERS, DEVICE_TYPE_IDS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates } from '@/lib/poller-utils'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000

// Solis health state → our DB health_state
// Solis: 1=online, 2=offline, 3=alarm
// Our DB: 1=disconnected, 2=faulty, 3=healthy
function mapSolisHealthState(solisState: number): number {
  switch (solisState) {
    case 1: return 3 // online → healthy
    case 2: return 1 // offline → disconnected
    case 3: return 2 // alarm → faulty
    default: return 1 // unknown → disconnected
  }
}

export async function pollSolis(): Promise<void> {
  console.log('[Solis] Starting poll cycle...')

  if (!process.env.SOLIS_API_ID || !process.env.SOLIS_API_SECRET) {
    console.log('[Solis] No SOLIS_API_ID/SOLIS_API_SECRET configured, skipping')
    return
  }

  const client = new SolisClient()
  const now = Date.now()

  try {
    let plantsSyncedThisCycle = false

    if (now - lastPlantSync > HOUR_MS) {
      await syncSolisPlants(client)
      lastPlantSync = now
      plantsSyncedThisCycle = true
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncSolisDevices(client)
      lastDeviceSync = now
    }

    // Only fetch plant health separately if syncSolisPlants didn't already run this cycle
    if (!plantsSyncedThisCycle) {
      await syncSolisPlantHealth(client)
    }

    await fetchSolisStringData(client)

    console.log('[Solis] Poll cycle complete.')
  } catch (error) {
    console.error('[Solis] Error during poll cycle:', error)
  }
}

async function syncSolisPlants(client: SolisClient): Promise<void> {
  console.log('[Solis] Syncing plants...')
  const stations = await client.getStationList()

  await prisma.$transaction(
    stations.map((station) =>
      prisma.plants.upsert({
        where: { id: station.id },
        update: {
          plant_name: station.stationName,
          capacity_kw: station.capacity ? new Decimal(station.capacity) : null,
          health_state: mapSolisHealthState(station.state),
          provider: PROVIDERS.SOLIS,
          last_synced: new Date(),
        },
        create: {
          id: station.id,
          plant_name: station.stationName,
          capacity_kw: station.capacity ? new Decimal(station.capacity) : null,
          health_state: mapSolisHealthState(station.state),
          provider: PROVIDERS.SOLIS,
          last_synced: new Date(),
        },
      })
    )
  )

  console.log(`[Solis] Synced ${stations.length} plants`)
}

async function syncSolisPlantHealth(client: SolisClient): Promise<void> {
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.SOLIS },
    select: { id: true },
  })

  if (plants.length === 0) return

  try {
    const stations = await client.getStationList()
    for (const station of stations) {
      await prisma.plants.update({
        where: { id: station.id },
        data: { health_state: mapSolisHealthState(station.state) },
      })
    }
  } catch (error) {
    console.error('[Solis] Failed to sync plant health:', error)
  }
}

async function syncSolisDevices(client: SolisClient): Promise<void> {
  console.log('[Solis] Syncing devices...')
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.SOLIS },
    select: { id: true },
  })

  if (plants.length === 0) {
    console.log('[Solis] No plants found, skipping device sync')
    return
  }

  let totalInverters = 0

  for (const plant of plants) {
    const inverters = await client.getInverterList(plant.id)

    if (inverters.length > 0) {
      await prisma.$transaction(
        inverters.map((inv) => {
          const maxStrings = (inv.dcInputType ?? 0) + 1
          return prisma.devices.upsert({
            where: { id: inv.id },
            update: {
              device_name: inv.sn,
              plant_id: plant.id,
              device_type_id: DEVICE_TYPE_IDS.SOLIS_INVERTER,
              max_strings: maxStrings,
              provider: PROVIDERS.SOLIS,
              last_synced: new Date(),
            },
            create: {
              id: inv.id,
              plant_id: plant.id,
              device_name: inv.sn,
              device_type_id: DEVICE_TYPE_IDS.SOLIS_INVERTER,
              max_strings: maxStrings,
              provider: PROVIDERS.SOLIS,
              last_synced: new Date(),
            },
          })
        })
      )
      totalInverters += inverters.length
    }
  }

  console.log(`[Solis] Synced ${totalInverters} inverters`)
}

async function fetchSolisStringData(client: SolisClient): Promise<void> {
  console.log('[Solis] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.SOLIS,
      device_type_id: DEVICE_TYPE_IDS.SOLIS_INVERTER,
    },
    select: {
      id: true,
      plant_id: true,
      max_strings: true,
    },
  })

  if (devices.length === 0) {
    console.log('[Solis] No inverters found, skipping string data fetch')
    return
  }

  for (const device of devices) {
    try {
      const detail = await client.getInverterDetail(device.id)
      const maxStrings = device.max_strings || (detail.dcInputType ?? 0) + 1

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
        const voltage = detail[`uPv${s}`] ?? 0
        const current = detail[`iPv${s}`] ?? 0
        const power = detail[`pow${s}`] ?? 0 // Solis provides power directly

        if (voltage > 0 || current > 0) {
          measurements.push({
            device_id: device.id,
            plant_id: device.plant_id,
            string_number: s,
            voltage: new Decimal(Number(voltage).toFixed(2)),
            current: new Decimal(Number(current).toFixed(3)),
            power: new Decimal(Number(power).toFixed(2)),
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
      console.error(`[Solis] Failed to fetch string data for device ${device.id}:`, error)
    }
  }

  console.log('[Solis] String data fetch complete')
}
