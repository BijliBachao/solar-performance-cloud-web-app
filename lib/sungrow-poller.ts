import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { SungrowClient } from '@/lib/sungrow-client'
import { PROVIDERS, DEVICE_TYPE_IDS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, safeFloat, getPKTDateForDB } from '@/lib/poller-utils'

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

// All point IDs we need (string current + voltage only)
// p83022 (daily generation) is a station-level virtual point, not available via getDeviceRealTimeData.
// Daily yield is fetched separately via getPowerStationRealKpi after the device loop.
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
    if (stations.length > 0) {
      await prisma.$transaction(
        stations.map((station) =>
          prisma.plants.update({
            where: { id: station.ps_id },
            data: { health_state: mapSungrowHealthState(station.ps_status) },
          })
        )
      )
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

  // Track per-device measured power (W) for proportional daily yield distribution
  const devicePowerW = new Map<string, number>()

  for (const device of devices) {
    try {
      const results = await client.getDeviceRealTimeData(
        [device.id], // device_sn
        ALL_POINT_IDS
      )

      if (results.length === 0) continue
      const dp = results[0]

      // Detect active strings from data — only count strings with current
      // (Sungrow reports voltage on MPPT pairs but current only on primary string)
      let detectedStrings = 0
      for (let s = 32; s >= 1; s--) {
        const cid = STRING_CURRENT_IDS[s]
        if (!cid) continue
        const current = safeFloat(dp[`p${cid}`])
        if (current > 0) {
          detectedStrings = s
          break
        }
      }

      const maxStrings = device.max_strings || detectedStrings
      if (maxStrings === 0) continue // No strings detected, skip

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

        const current = safeFloat(dp[`p${currentPointId}`])
        const voltage = safeFloat(dp[`p${voltagePointId}`])

        // Sungrow MPPT topology: 2 strings share 1 MPPT, API reports current
        // on primary string only (odd-numbered). Secondary strings have voltage
        // but always 0 current — storing them creates misleading 0% health scores.
        // Only store strings that have measurable current (real individual data).
        if (current > 0) {
          const vDec = new Decimal(voltage).toDecimalPlaces(2)
          const cDec = new Decimal(current).toDecimalPlaces(3)
          measurements.push({
            device_id: device.id,
            plant_id: device.plant_id,
            string_number: s,
            voltage: vDec,
            current: cDec,
            power: vDec.mul(cDec).toDecimalPlaces(2),
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
        await generateAlerts(device.id, device.plant_id, measurements)
        await updateHourlyAggregates(device.id, device.plant_id, maxStrings)
        await updateDailyAggregates(device.id, device.plant_id, maxStrings)
      }

      // Track power for proportional daily yield distribution
      const totalPowerW = measurements.reduce((sum, m) => sum + Number(m.power), 0)
      devicePowerW.set(device.id, totalPowerW)
    } catch (error) {
      console.error(`[Sungrow] Failed to fetch string data for device ${device.id}:`, error)
    }
  }

  // Fetch plant-level daily yield via getPowerStationRealKpi and distribute to devices.
  // p83022 is a station-level virtual point — not available per device via real-time API.
  const plantIds = [...new Set(devices.map(d => d.plant_id))]
  for (const plantId of plantIds) {
    try {
      const { daily_kwh } = await client.getPowerStationRealKpi(plantId)
      if (!daily_kwh || daily_kwh <= 0) continue

      const plantDevices = devices.filter(d => d.plant_id === plantId)
      const date = getPKTDateForDB()

      if (plantDevices.length === 1) {
        // Single inverter — direct attribution
        await prisma.device_daily.upsert({
          where: { device_id_date: { device_id: plantDevices[0].id, date } },
          update: { native_kwh: new Decimal(daily_kwh) },
          create: { device_id: plantDevices[0].id, plant_id: plantId, date, native_kwh: new Decimal(daily_kwh), provider: PROVIDERS.SUNGROW },
        })
        console.log(`[Sungrow] Plant ${plantId}: ${daily_kwh} kWh → device ${plantDevices[0].id}`)
      } else {
        // Multi-inverter — distribute proportionally by measured string power
        const totalPower = plantDevices.reduce((sum, d) => sum + (devicePowerW.get(d.id) || 0), 0)
        for (const d of plantDevices) {
          const fraction = totalPower > 0
            ? (devicePowerW.get(d.id) || 0) / totalPower
            : 1 / plantDevices.length
          const deviceKwh = Math.round(daily_kwh * fraction * 1000) / 1000
          if (deviceKwh > 0) {
            await prisma.device_daily.upsert({
              where: { device_id_date: { device_id: d.id, date } },
              update: { native_kwh: new Decimal(deviceKwh) },
              create: { device_id: d.id, plant_id: plantId, date, native_kwh: new Decimal(deviceKwh), provider: PROVIDERS.SUNGROW },
            })
          }
        }
        console.log(`[Sungrow] Plant ${plantId}: ${daily_kwh} kWh distributed across ${plantDevices.length} inverters`)
      }
    } catch (error) {
      console.error(`[Sungrow] Failed to fetch/store daily yield for plant ${plantId}:`, error)
    }
  }

  console.log('[Sungrow] String data fetch complete')
}
