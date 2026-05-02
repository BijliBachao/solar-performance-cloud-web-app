import { prisma } from '@/lib/prisma'
import { huaweiClient } from '@/lib/huawei-client'
import { Decimal } from '@prisma/client/runtime/library'
import { PROVIDERS } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, getPKTDateForDB, safeArray, safeObject, safeFloat } from '@/lib/poller-utils'
import { ACTIVE_CURRENT_THRESHOLD } from '@/lib/string-health'

let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
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

    if (now - lastAlarmSync > HOUR_MS) {
      await fetchHuaweiAlarms()
      lastAlarmSync = now
    }

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
    if (kpis.length > 0) {
      await prisma.$transaction(
        kpis.map((kpi) =>
          prisma.plants.update({
            where: { id: kpi.stationCode },
            data: { health_state: kpi.healthState },
          })
        )
      )
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

      for (const data of safeArray<any>(realtimeData)) {
        if (!data) continue
        const device = typeDevices.find((d) => d.id === data.devId)
        if (!device) continue

        try {
          // Guard against Huawei returning a device with no dataItemMap at all
          // (happens during partial outages — without this, every property
          // access below throws TypeError and crashes this device's processing).
          const dim = safeObject(data.dataItemMap)

          const maxStrings = device.max_strings || detectMaxStrings(dim)
          // Update max_strings if not yet set or if we found MORE (daytime has more data)
          if (maxStrings > 0 && (!device.max_strings || maxStrings > device.max_strings)) {
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
            const voltage = safeFloat(dim[`pv${s}_u`])
            const current = safeFloat(dim[`pv${s}_i`])

            if (voltage > 0 || current > 0) {
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
          }

          if (measurements.length > 0) {
            await generateAlerts(device.id, device.plant_id, measurements)
            await updateHourlyAggregates(device.id, device.plant_id, maxStrings)
            await updateDailyAggregates(device.id, device.plant_id, maxStrings)
          }

          // Save hardware daily counter — source of truth for "today's energy" display
          const nativeKwh = dim['day_cap'] ?? dim['e_day'] ?? null
          if (nativeKwh !== null && safeFloat(nativeKwh) > 0) {
            await prisma.device_daily.upsert({
              where: { device_id_date: { device_id: device.id, date: getPKTDateForDB() } },
              update: { native_kwh: new Decimal(nativeKwh) },
              create: {
                device_id: device.id,
                plant_id: device.plant_id,
                date: getPKTDateForDB(),
                native_kwh: new Decimal(nativeKwh),
                provider: PROVIDERS.HUAWEI,
              },
            })
          }
        } catch (error) {
          console.error(`[Huawei] Failed to process device ${device.id}:`, error)
        }
      }
    }
  }

  console.log('[Huawei] String data fetch complete')
}

function detectMaxStrings(dataItemMap: Record<string, number | null>): number {
  // Find highest string number with meaningful current (> 0.1A)
  // Voltage alone is unreliable (residual values on unused ports)
  let max = 0
  for (const key of Object.keys(dataItemMap)) {
    const match = key.match(/^pv(\d+)_i$/)
    if (match) {
      const value = dataItemMap[key]
      if (value !== null && value !== undefined && value > ACTIVE_CURRENT_THRESHOLD) {
        const num = parseInt(match[1], 10)
        if (num > max) max = num
      }
    }
  }
  return max
}

async function fetchHuaweiAlarms(): Promise<void> {
  console.log('[Huawei] Fetching vendor alarms...')
  try {
    // Get all Huawei plant codes
    const plants = await prisma.plants.findMany({
      where: { provider: PROVIDERS.HUAWEI },
      select: { id: true },
    })
    if (plants.length === 0) return

    // Build devName → {device_id, plant_id} map
    const huaweiDevices = await prisma.devices.findMany({
      where: { provider: PROVIDERS.HUAWEI },
      select: { id: true, plant_id: true, device_name: true },
    })
    const deviceByName = new Map(huaweiDevices.map(d => [d.device_name, d]))

    const plantCodes = plants.map(p => p.id)
    const activeAlarms = await huaweiClient.getActiveAlarms(plantCodes)

    // Huawei severity: 1=Critical, 2=Major, 3=Minor, 4=Warning
    const mapSeverity = (sev: number): string => {
      if (sev <= 2) return 'CRITICAL'
      if (sev === 3) return 'WARNING'
      return 'INFO'
    }

    const activeIds = new Set<string>()

    for (const alarm of activeAlarms) {
      const device = deviceByName.get(alarm.devName)
      if (!device) continue

      const vid = String(alarm.alarmId)
      activeIds.add(vid)

      try {
        await prisma.vendor_alarms.upsert({
          where: { provider_vendor_alarm_id: { provider: PROVIDERS.HUAWEI, vendor_alarm_id: vid } },
          update: {},
          create: {
            device_id: device.id,
            plant_id: device.plant_id,
            provider: PROVIDERS.HUAWEI,
            vendor_alarm_id: vid,
            alarm_code: alarm.causeId ? String(alarm.causeId) : null,
            severity: mapSeverity(alarm.severity),
            message: alarm.alarmName || 'Unknown alarm',
            started_at: new Date(Number(alarm.raiseTime)),
            raw_data: alarm as any,
          },
        })
      } catch {
        // unique constraint race — safe to skip
      }
    }

    // Resolve any open Huawei alarms no longer in the active list
    const openHuaweiAlarms = await prisma.vendor_alarms.findMany({
      where: { provider: PROVIDERS.HUAWEI, resolved_at: null },
      select: { id: true, vendor_alarm_id: true },
    })
    const toResolve = openHuaweiAlarms.filter(a => !activeIds.has(a.vendor_alarm_id))
    if (toResolve.length > 0) {
      await prisma.vendor_alarms.updateMany({
        where: { id: { in: toResolve.map(a => a.id) } },
        data: { resolved_at: new Date() },
      })
    }

    console.log(`[Huawei] ${activeAlarms.length} active alarms, resolved ${toResolve.length}`)
  } catch (error) {
    console.error('[Huawei] Failed to fetch vendor alarms:', error)
  }
}
