import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { GrowattClient } from '@/lib/growatt-client'
import { PROVIDERS, DEVICE_TYPE_IDS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates } from '@/lib/poller-utils'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000

// Growatt plant status -> our DB health_state
// Growatt: 1=online, 3=bat online (SPH-S), 0=waiting, 4=offline, 2=fault
// Our DB: 1=disconnected, 2=faulty, 3=healthy
function mapGrowattPlantHealth(status: number): number {
  if (status === 1) return 3  // Online → Healthy
  if (status === 3) return 3  // Bat Online (SPH-S) → Healthy
  if (status === 2) return 2  // Fault → Faulty
  return 1                    // 0 (Waiting), 4 (Offline), unknown → Disconnected
}

// Growatt device status -> our DB health_state
function mapGrowattDeviceHealth(status: number, statusText?: string): number {
  if (statusText === 'Normal' || statusText === 'Bat Online') return 3
  if (status === 1) return 3  // Normal
  if (status === 3) return 3  // Bat Online
  if (status === 2) return 2  // Fault
  return 1                    // 0 (Waiting), unknown → Disconnected
}

function mapDeviceType(deviceType: string): number {
  if (deviceType === 'sph-s') return DEVICE_TYPE_IDS.GROWATT_SPHS_INVERTER
  return DEVICE_TYPE_IDS.GROWATT_MAX_INVERTER
}

export async function pollGrowatt(): Promise<void> {
  console.log('[Growatt] Starting poll cycle...')

  if (!process.env.GROWATT_API_TOKEN) {
    console.log('[Growatt] No GROWATT_API_TOKEN configured, skipping')
    return
  }

  const client = new GrowattClient()
  const now = Date.now()

  try {
    let plantsSyncedThisCycle = false

    if (now - lastPlantSync > HOUR_MS) {
      await syncPlants(client)
      lastPlantSync = now
      plantsSyncedThisCycle = true
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncDevices(client)
      lastDeviceSync = now
    }

    // Only fetch plant health separately if syncPlants didn't already run this cycle
    if (!plantsSyncedThisCycle) {
      await syncPlantHealth(client)
    }

    await fetchStringData(client)

    console.log('[Growatt] Poll cycle complete.')
  } catch (error) {
    console.error('[Growatt] Error during poll cycle:', error)
  }
}

async function syncPlants(client: GrowattClient): Promise<void> {
  console.log('[Growatt] Syncing plants...')
  const plants = await client.getPlantList()

  await prisma.$transaction(
    plants.map((plant) => {
      const plantId = String(plant.plant_id)
      return prisma.plants.upsert({
        where: { id: plantId },
        update: {
          plant_name: plant.name,
          capacity_kw: plant.peak_power ? new Decimal(plant.peak_power) : null,
          address: plant.city || null,
          health_state: mapGrowattPlantHealth(plant.status),
          provider: PROVIDERS.GROWATT,
          last_synced: new Date(),
        },
        create: {
          id: plantId,
          plant_name: plant.name,
          capacity_kw: plant.peak_power ? new Decimal(plant.peak_power) : null,
          address: plant.city || null,
          health_state: mapGrowattPlantHealth(plant.status),
          provider: PROVIDERS.GROWATT,
          last_synced: new Date(),
        },
      })
    })
  )

  console.log(`[Growatt] Synced ${plants.length} plants`)
}

async function syncDevices(client: GrowattClient): Promise<void> {
  console.log('[Growatt] Syncing devices...')
  const devices = await client.getDeviceList()

  if (devices.length === 0) {
    console.log('[Growatt] No devices found from API')
    return
  }

  // Build device-to-plant mapping from V4 queryDeviceList (has plantId field)
  // If plantId not available, fall back to V1 device/list per plant
  let devicePlantMap = new Map<string, string>()

  // First try: use plantId from V4 response
  for (const device of devices) {
    if (device.plantId) {
      devicePlantMap.set(device.deviceSn, String(device.plantId))
    }
  }

  // Fallback: if any devices lack plantId, query V1 per plant
  const unmappedDevices = devices.filter(d => !devicePlantMap.has(d.deviceSn))
  if (unmappedDevices.length > 0) {
    console.log(`[Growatt] ${unmappedDevices.length} devices without plantId, using V1 fallback...`)
    const plants = await prisma.plants.findMany({
      where: { provider: PROVIDERS.GROWATT },
      select: { id: true },
    })

    for (const plant of plants) {
      try {
        const plantDevices = await client.getDevicesByPlant(plant.id)
        for (const pd of plantDevices) {
          if (pd.device_sn && !devicePlantMap.has(pd.device_sn)) {
            devicePlantMap.set(pd.device_sn, plant.id)
          }
        }
      } catch (error) {
        console.error(`[Growatt] Failed to get devices for plant ${plant.id}:`, error)
      }
    }
  }

  const upserts = []
  for (const device of devices) {
    const plantId = devicePlantMap.get(device.deviceSn)
    if (!plantId) {
      console.warn(`[Growatt] No plant mapping for device ${device.deviceSn}, skipping`)
      continue
    }

    upserts.push(
      prisma.devices.upsert({
        where: { id: device.deviceSn },
        update: {
          device_name: device.deviceSn,
          plant_id: plantId,
          device_type_id: mapDeviceType(device.deviceType),
          provider: PROVIDERS.GROWATT,
          last_synced: new Date(),
        },
        create: {
          id: device.deviceSn,
          plant_id: plantId,
          device_name: device.deviceSn,
          device_type_id: mapDeviceType(device.deviceType),
          max_strings: null,
          provider: PROVIDERS.GROWATT,
          last_synced: new Date(),
        },
      })
    )
  }

  if (upserts.length > 0) {
    await prisma.$transaction(upserts)
  }

  console.log(`[Growatt] Synced ${upserts.length} devices (${devices.length} total from API)`)
}

async function syncPlantHealth(client: GrowattClient): Promise<void> {
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.GROWATT },
    select: { id: true },
  })

  if (plants.length === 0) return

  try {
    // Plant health comes from the plant list (status field)
    const apiPlants = await client.getPlantList()
    for (const plant of apiPlants) {
      const plantId = String(plant.plant_id)
      await prisma.plants.update({
        where: { id: plantId },
        data: { health_state: mapGrowattPlantHealth(plant.status) },
      })
    }
  } catch (error) {
    console.error('[Growatt] Failed to sync plant health:', error)
  }
}

async function fetchStringData(client: GrowattClient): Promise<void> {
  console.log('[Growatt] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.GROWATT,
      device_type_id: {
        in: [DEVICE_TYPE_IDS.GROWATT_MAX_INVERTER, DEVICE_TYPE_IDS.GROWATT_SPHS_INVERTER],
      },
    },
    select: {
      id: true,
      plant_id: true,
      device_type_id: true,
      max_strings: true,
    },
  })

  if (devices.length === 0) {
    console.log('[Growatt] No inverters found, skipping string data fetch')
    return
  }

  // Split devices by type for batch queries
  const maxDevices = devices.filter(d => d.device_type_id === DEVICE_TYPE_IDS.GROWATT_MAX_INVERTER)
  const sphDevices = devices.filter(d => d.device_type_id === DEVICE_TYPE_IDS.GROWATT_SPHS_INVERTER)

  // Batch query all MAX devices in one call
  if (maxDevices.length > 0) {
    try {
      const maxSns = maxDevices.map(d => d.id)
      const maxData = await client.getLastData(maxSns, 'max')
      console.log(`[Growatt] MAX batch: ${maxData.length} responses for ${maxSns.length} devices`)

      for (const deviceData of maxData) {
        const sn = deviceData.serialNum || deviceData.deviceSn || deviceData.sn
        const device = maxDevices.find(d => d.id === sn)
        if (!device) {
          console.warn(`[Growatt] MAX device SN "${sn}" not found in DB (keys: ${Object.keys(deviceData).filter(k => k.toLowerCase().includes('sn') || k.toLowerCase().includes('serial')).join(', ')})`)
          continue
        }

        try {
          await processDeviceData(device, deviceData, 'max')
        } catch (error) {
          console.error(`[Growatt] Failed to process MAX device ${sn}:`, error)
        }
      }
    } catch (error) {
      console.error('[Growatt] Failed to fetch MAX batch data:', error)
    }
  }

  // Query SPH-S device(s) separately
  if (sphDevices.length > 0) {
    try {
      const sphSns = sphDevices.map(d => d.id)
      const sphData = await client.getLastData(sphSns, 'sph-s')
      console.log(`[Growatt] SPH-S batch: ${sphData.length} responses for ${sphSns.length} devices`)

      for (const deviceData of sphData) {
        const sn = deviceData.serialNum || deviceData.deviceSn || deviceData.sn
        const device = sphDevices.find(d => d.id === sn)
        if (!device) {
          console.warn(`[Growatt] SPH-S device SN "${sn}" not found in DB (keys: ${Object.keys(deviceData).filter(k => k.toLowerCase().includes('sn') || k.toLowerCase().includes('serial')).join(', ')})`)
          continue
        }

        try {
          await processDeviceData(device, deviceData, 'sph-s')
        } catch (error) {
          console.error(`[Growatt] Failed to process SPH-S device ${sn}:`, error)
        }
      }
    } catch (error) {
      console.error('[Growatt] Failed to fetch SPH-S batch data:', error)
    }
  }

  console.log('[Growatt] String data fetch complete')
}

async function processDeviceData(
  device: { id: string; plant_id: string; device_type_id: number; max_strings: number | null },
  deviceData: any,
  deviceType: string
): Promise<void> {
  const strings = extractStrings(deviceData, deviceType)
  const maxStrings = device.max_strings || (strings.length > 0 ? Math.max(...strings.map(s => s.string_number)) : 0)

  // Update max_strings if not yet set and we found strings
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

  for (const s of strings) {
    if (s.voltage > 0 || s.current > 0) {
      measurements.push({
        device_id: device.id,
        plant_id: device.plant_id,
        string_number: s.string_number,
        voltage: new Decimal(s.voltage.toFixed(2)),
        current: new Decimal(s.current.toFixed(3)),
        power: new Decimal(s.power.toFixed(2)),
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
  await updateHourlyAggregates(device.id, device.plant_id, maxStrings || strings.length)
  await updateDailyAggregates(device.id, device.plant_id, maxStrings || strings.length)
}

interface StringReading {
  string_number: number
  voltage: number
  current: number
  power: number
}

function extractStrings(deviceData: any, deviceType: string): StringReading[] {
  const strings: StringReading[] = []

  // Level 1: Try individual string data first (best granularity, some MAX devices have this)
  if (deviceType === 'max') {
    for (let i = 1; i <= 32; i++) {
      const v = parseFloat(deviceData[`vString${i}`]) || 0
      const c = parseFloat(deviceData[`currentString${i}`]) || 0
      if (v > 0 || c > 0) {
        strings.push({
          string_number: i,
          voltage: v,
          current: c,
          power: v * c,
        })
      }
    }
  }

  // Level 2: Fall back to MPPT data (all devices have this)
  if (strings.length === 0) {
    const maxMppt = deviceType === 'sph-s' ? 3 : 16
    for (let i = 1; i <= maxMppt; i++) {
      const v = parseFloat(deviceData[`vpv${i}`]) || 0
      const c = parseFloat(deviceData[`ipv${i}`]) || 0
      const p = parseFloat(deviceData[`ppv${i}`]) || 0
      if (v > 0 || c > 0 || p > 0) {
        strings.push({
          string_number: i,
          voltage: v,
          current: c,
          power: p || (v * c),
        })
      }
    }
  }

  return strings
}
