import { prisma } from '@/lib/prisma'
import { huaweiClient } from '@/lib/huawei-client'
import { Decimal } from '@prisma/client/runtime/library'
import { PROVIDERS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, getPKTDateForDB, loadStringConfigs, processInBatches, safeArray, safeObject, safeFloat, recordDeviceFreshness, recordDeviceSeen, logWriteGate, sunUpForWriteGate, resolveAlertsForUntrustedFeed } from '@/lib/poller-utils'
import { classifyDeviceWrite } from '@/lib/string-health'
import { ACTIVE_CURRENT_THRESHOLD } from '@/lib/string-health'
import { getHuaweiMaxStrings } from '@/lib/huawei-model-strings'

// These three "last sync" timestamps are intentionally process-local
// (module-scoped). PM2 fully restarts the worker on every deploy, which
// resets them to 0 — that's what makes "merge → deploy → wait one cycle"
// safe: the first post-deploy poll re-runs the full sync chain (plant
// list, device list including hardware model name, alarm list) before
// any string-level work, so a fix to syncDevices self-heals every device
// in the first 5-minute cycle after deploy. If pollers are ever moved
// off PM2 to a runtime that hot-reloads modules without restarting the
// process, these gates need to be moved into a database row.
let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
const HOUR_MS = 60 * 60 * 1000

// Models we've already warned about — keeps the unknown-model log to one
// line per process per model, so production logs don't fill up.
const warnedUnknownModels = new Set<string>()
function warnUnknownHuaweiModelOnce(model: string): void {
  if (warnedUnknownModels.has(model)) return
  warnedUnknownModels.add(model)
  console.warn(
    `[Huawei] Unknown inverter model "${model}" — falling back to runtime ` +
      `string-count detection. Add this model to lib/huawei-model-strings.ts ` +
      `with its physical PV input count from the Huawei datasheet.`
  )
}

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
    inverters.map((device) => {
      // Hardware model is what we want for the max-strings lookup.
      // Huawei docs: `model` and `invType` carry the hardware name (e.g.
      // SUN2000-100KTL-M2). We DELIBERATELY do not fall back to
      // `softwareVersion` (e.g. V500R023C00SPC156) — that's firmware and
      // storing it here is exactly the bug we're fixing. If both `model`
      // and `invType` are missing, leave `model` null and let the lookup
      // fall through to runtime detection (with one warning).
      // Updating on every sync (not just create) lets the next poll cycle
      // self-heal devices that were created before this fix shipped.
      const hardwareModel = device.model || device.invType || null
      const lookupMaxStrings = getHuaweiMaxStrings(hardwareModel)
      if (hardwareModel && lookupMaxStrings === null) {
        warnUnknownHuaweiModelOnce(hardwareModel)
      }

      return prisma.devices.upsert({
        where: { id: String(device.id) },
        update: {
          device_name: device.devName,
          plant_id: device.stationCode,
          device_type_id: device.devTypeId,
          provider: PROVIDERS.HUAWEI,
          last_synced: new Date(),
          // Refresh hardware model on every sync so the lookup stays accurate.
          ...(hardwareModel ? { model: hardwareModel } : {}),
          // When the lookup yields a definitive answer, that is the source of
          // truth. Lookup is authoritative; runtime detection is the fallback.
          ...(lookupMaxStrings !== null ? { max_strings: lookupMaxStrings } : {}),
        },
        create: {
          id: String(device.id),
          plant_id: device.stationCode,
          device_name: device.devName,
          device_type_id: device.devTypeId,
          model: hardwareModel,
          max_strings: lookupMaxStrings,
          provider: PROVIDERS.HUAWEI,
          last_synced: new Date(),
        },
      })
    })
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
      // Needed so processHuaweiDeviceData can prefer the model-based lookup
      // (authoritative) over the runtime detection (heuristic).
      model: true,
      // Prior reading signature — recordDeviceFreshness only bumps
      // reading_changed_at when the new signature differs from this.
      last_reading_sig: true,
      // Plant coords for the night write-gate (fleet-default fallback at the gate).
      plants: { select: { latitude: true, longitude: true } },
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

      // Pair each data row with its device record up-front so the parallel
      // workers don't all hammer typeDevices.find() for the same lookup.
      const pairs: Array<{ device: typeof devices[number]; data: any }> = []
      for (const data of safeArray<any>(realtimeData)) {
        if (!data) continue
        const device = typeDevices.find((d) => d.id === data.devId)
        if (device) pairs.push({ device, data })
      }

      await processInBatches(
        pairs,
        POLLER_DEVICE_CONCURRENCY,
        async ({ device, data }) => {
          await processHuaweiDeviceData(device, data)
        },
        'Huawei',
      )
    }
  }

  console.log('[Huawei] String data fetch complete')
}

async function processHuaweiDeviceData(
  device: {
    id: string; plant_id: string; device_type_id: number; max_strings: number | null
    model: string | null; last_reading_sig: string | null
    plants: { latitude: unknown; longitude: unknown } | null
  },
  data: any,
): Promise<void> {
  // Guard against Huawei returning a device with no dataItemMap at all
  // (happens during partial outages — without this, every property
  // access below throws TypeError and crashes this device's processing).
  const dim = safeObject(data.dataItemMap)

  // Source of truth for "how many strings does this inverter have":
  //   1. Hardware-model lookup (Huawei datasheet table) — authoritative.
  //   2. max(stored value, currently-detected count) — grows monotonically
  //      for unknown-model devices as more strings produce through the day.
  // detectMaxStrings only counts strings currently producing > 0.1 A, so
  // it under-counts open-circuit / dead / temporarily-zero strings. The
  // lookup is far more accurate when the model is known.
  const lookupMaxStrings = getHuaweiMaxStrings(device.model)
  if (device.model && lookupMaxStrings === null) {
    warnUnknownHuaweiModelOnce(device.model)
  }
  const detectedMax = detectMaxStrings(dim)
  // For unknown-model devices, take the max of stored and detected. This
  // preserves the pre-existing "highest-seen-ever" semantic and actually
  // grows the stored value when more strings come online (e.g. as the
  // morning warms up). For known-model devices, the lookup is the answer
  // and detection is ignored — the inverter has exactly the slots its
  // datasheet describes, regardless of which ones are producing right now.
  const maxStrings = lookupMaxStrings ?? Math.max(device.max_strings ?? 0, detectedMax)
  // Persist when:
  //   - the lookup gives a definitive value that differs from what's stored, or
  //   - lookup is unknown AND the new max is strictly greater than stored
  //     (avoids redundant writes every poll cycle).
  const shouldPersist =
    (lookupMaxStrings !== null && lookupMaxStrings !== device.max_strings) ||
    (lookupMaxStrings === null && maxStrings > (device.max_strings ?? 0))
  if (maxStrings > 0 && shouldPersist) {
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
    const gateStrings = measurements.map((m) => ({
      string_number: m.string_number,
      voltage: Number(m.voltage),
      current: Number(m.current),
      power: Number(m.power),
    }))

    // ── Write gate (DQ v2) ─────────────────────────────────────────
    // Huawei's realtime endpoint has no data-timestamp and replays cached
    // snapshots when a logger goes quiet (74k phantom night rows in the week
    // before this gate). Signature dedup + night gate keep them out.
    const sunUp = sunUpForWriteGate(device.plants)
    const gate = classifyDeviceWrite(gateStrings, device.last_reading_sig, sunUp)
    logWriteGate('Huawei', device.id, gate)
    if (gate !== 'write') {
      await recordDeviceSeen(device.id, null)
      await resolveAlertsForUntrustedFeed(device.id)
      return
    }

    await prisma.string_measurements.createMany({
      data: measurements.map((m) => ({
        ...m,
        timestamp: new Date(),
      })),
    })
    // Connectivity freshness: value-change signature from the strings we just
    // wrote. Huawei stores V/I/P as Decimal, so map to plain numbers. Huawei's
    // getDeviceRealtimeData returns no usable data-timestamp, so vendor time is null.
    await recordDeviceFreshness(device.id, gateStrings, null, device.last_reading_sig)
    const stringConfigs = await loadStringConfigs(device.id)
    await generateAlerts(device.id, device.plant_id, measurements, stringConfigs)
    await updateHourlyAggregates(device.id, device.plant_id, maxStrings, stringConfigs)
    await updateDailyAggregates(device.id, device.plant_id, maxStrings, stringConfigs, { model: device.model, max_strings: device.max_strings })
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
