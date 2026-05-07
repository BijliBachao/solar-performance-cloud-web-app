import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { CsiClient, CsiDeviceData, parseRealData } from '@/lib/csi-client'
import { PROVIDERS, DEVICE_TYPE_IDS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, getPKTDateForDB, loadStringConfigs, processInBatches } from '@/lib/poller-utils'

let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
const HOUR_MS = 60 * 60 * 1000

// CSI device status → our health_state. Per docs §6.3 the LABELS are
// OnLine/OffLine/Alarm/Breakdown/Manual but the numeric encoding is
// UNVERIFIED — first prod cycle log will tell. Default mapping is the
// most common convention (1=normal); unrecognised values fall through to
// disconnected (conservative) and emit a once-per-cycle warning so we
// can fingerprint the real encoding from production logs.
const seenUnknownHealthStates = new Set<number>()
function mapCsiHealthState(status: number): number {
  if (status === 1) return 3 // online → healthy
  if (status === 2 || status === 4) return 2 // alarm/breakdown → faulty
  if (status === 0 || status === 3) return 1 // offline/unknown → disconnected
  // Unrecognised — log once per process so we can refine the mapping.
  if (!seenUnknownHealthStates.has(status)) {
    seenUnknownHealthStates.add(status)
    console.warn(`[CSI] mapCsiHealthState: unrecognised status=${status} → defaulting to disconnected`)
  }
  return 1
}

// CSI alert level → our severity. Numeric encoding UNVERIFIED. The API
// also returns alertLevelLabel which we use as a tiebreaker. Same once-
// per-cycle warn pattern so production logs reveal the real encoding.
const seenUnknownSeverities = new Set<string>()
function mapCsiSeverity(level: number, label: string): 'CRITICAL' | 'WARNING' | 'INFO' {
  const lower = label.toLowerCase()
  if (level === 3 || lower.includes('critical') || lower.includes('fault')) return 'CRITICAL'
  if (level === 2 || lower.includes('warn')) return 'WARNING'
  // Unrecognised level + label combo. Log once.
  const key = `${level}:${lower}`
  if (level !== 1 && level !== 0 && !seenUnknownSeverities.has(key)) {
    seenUnknownSeverities.add(key)
    console.warn(`[CSI] mapCsiSeverity: unrecognised level=${level} label="${label}" → defaulting to INFO`)
  }
  return 'INFO'
}

export async function pollCsi(): Promise<void> {
  console.log('[CSI] Starting poll cycle...')

  if (!process.env.CSI_APP_ID || !process.env.CSI_APP_SECRET) {
    console.log('[CSI] No CSI_APP_ID/CSI_APP_SECRET configured, skipping')
    return
  }

  const client = new CsiClient()
  const now = Date.now()

  try {
    let plantsSyncedThisCycle = false

    if (now - lastPlantSync > HOUR_MS) {
      await syncCsiPlants(client)
      lastPlantSync = now
      plantsSyncedThisCycle = true
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncCsiDevices(client)
      lastDeviceSync = now
    }

    if (!plantsSyncedThisCycle) {
      await syncCsiPlantHealth(client)
    }

    await fetchCsiStringData(client)

    if (now - lastAlarmSync > HOUR_MS) {
      await fetchCsiAlarms(client)
      lastAlarmSync = now
    }

    console.log('[CSI] Poll cycle complete.')
  } catch (error) {
    console.error('[CSI] Error during poll cycle:', error)
  }
}

async function syncCsiPlants(client: CsiClient): Promise<void> {
  console.log('[CSI] Syncing plants...')
  const plants = await client.getPlantList()

  if (plants.length === 0) {
    console.log('[CSI] No plants returned')
    return
  }

  await prisma.$transaction(
    plants.map((p) =>
      prisma.plants.upsert({
        where: { id: p.plantId },
        update: {
          plant_name: p.plantName,
          capacity_kw: p.capacityKw ? new Decimal(p.capacityKw) : null,
          address: p.address,
          latitude: p.latitude !== null ? new Decimal(p.latitude) : null,
          longitude: p.longitude !== null ? new Decimal(p.longitude) : null,
          health_state: mapCsiHealthState(p.status),
          provider: PROVIDERS.CSI,
          last_synced: new Date(),
        },
        create: {
          id: p.plantId,
          plant_name: p.plantName,
          capacity_kw: p.capacityKw ? new Decimal(p.capacityKw) : null,
          address: p.address,
          latitude: p.latitude !== null ? new Decimal(p.latitude) : null,
          longitude: p.longitude !== null ? new Decimal(p.longitude) : null,
          health_state: mapCsiHealthState(p.status),
          provider: PROVIDERS.CSI,
          last_synced: new Date(),
        },
      }),
    ),
  )

  console.log(`[CSI] Synced ${plants.length} plants`)
}

async function syncCsiPlantHealth(client: CsiClient): Promise<void> {
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.CSI },
    select: { id: true },
  })
  if (plants.length === 0) return

  // /plant/realtime is the cheapest health signal — batch ≤20 IDs per call.
  // It returns power but no explicit status, so we infer: power > 0 → healthy,
  // dayElectric > 0 but power == 0 → idle (still mark healthy), neither → faulty.
  // This is intentionally lenient pending CSI confirmation of a status field
  // on /plant/realtime; the per-device health from syncCsiDevices is the
  // primary signal. The hourly /plant/pageV2 sync via syncCsiPlants reapplies
  // the authoritative status.
  try {
    const realtime = await client.getPlantsRealtime(plants.map((p) => p.id))
    if (realtime.length === 0) return
    await prisma.$transaction(
      realtime.map((r) =>
        prisma.plants.update({
          where: { id: r.plantId },
          data: {
            health_state: r.power > 0 || r.dayElectric > 0 ? 3 : 2,
          },
        }),
      ),
    )
  } catch (error) {
    console.error('[CSI] Failed to sync plant health:', error)
  }
}

async function syncCsiDevices(client: CsiClient): Promise<void> {
  console.log('[CSI] Syncing devices...')
  const plants = await prisma.plants.findMany({
    where: { provider: PROVIDERS.CSI },
    select: { id: true },
  })

  if (plants.length === 0) {
    console.log('[CSI] No plants found, skipping device sync')
    return
  }

  let totalInverters = 0

  for (const plant of plants) {
    const devices = await client.getPlantDevices(plant.id)
    if (devices.length === 0) continue

    await prisma.$transaction(
      devices.map((d) =>
        prisma.devices.upsert({
          where: { id: d.deviceSn },  // CSI devices keyed by SN (no separate id)
          update: {
            device_name: d.deviceSn,
            plant_id: plant.id,
            device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
            // max_strings unknown until first /device/data response — leave
            // null and let processCsiDevice fill it in based on realData parse.
            provider: PROVIDERS.CSI,
            last_synced: new Date(),
          },
          create: {
            id: d.deviceSn,
            plant_id: plant.id,
            device_name: d.deviceSn,
            device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
            provider: PROVIDERS.CSI,
            last_synced: new Date(),
          },
        }),
      ),
    )
    totalInverters += devices.length
  }

  console.log(`[CSI] Synced ${totalInverters} inverters`)
}

async function fetchCsiStringData(client: CsiClient): Promise<void> {
  console.log('[CSI] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.CSI,
      device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
    },
    select: { id: true, plant_id: true, max_strings: true },
  })

  if (devices.length === 0) {
    console.log('[CSI] No inverters found, skipping string data fetch')
    return
  }

  // CSI's /device/data already batches up to 20 device SNs per call (handled
  // inside the client). We further bound concurrency at the device-processing
  // step so large fleets don't overwhelm the Prisma connection pool.
  // Group devices into batches of up to 20 (the CSI batch cap) and process
  // each batch's devices concurrently up to POLLER_DEVICE_CONCURRENCY workers.
  const BATCH = 20
  const batches: typeof devices[] = []
  for (let i = 0; i < devices.length; i += BATCH) batches.push(devices.slice(i, i + BATCH))

  for (const batch of batches) {
    const sns = batch.map((d) => d.id)
    let dataRows: CsiDeviceData[]
    try {
      dataRows = await client.getDeviceData(sns)
    } catch (error) {
      console.error(`[CSI] getDeviceData failed for batch of ${sns.length}:`, error)
      continue
    }

    const bySn = new Map(dataRows.map((d) => [d.deviceSn, d]))
    await processInBatches(
      batch,
      POLLER_DEVICE_CONCURRENCY,
      async (device) => {
        const data = bySn.get(device.id)
        if (!data) return
        await processCsiDevice(device, data)
      },
      'CSI',
    )
  }

  console.log('[CSI] String data fetch complete')
}

async function processCsiDevice(
  device: { id: string; plant_id: string; max_strings: number | null },
  data: CsiDeviceData,
): Promise<void> {
  const { strings, dailyEnergyKwh, unrecognisedCodes } = parseRealData(data.realData)

  // Surface unknown fieldCodes once per cycle so we can refine the parser
  // without spamming logs every poll. The first run will produce a
  // representative dump; copy that into Working/all_API/csi/api-test-results.json
  // and tighten the regex / mapping table accordingly.
  if (unrecognisedCodes.length > 0) {
    const sample = unrecognisedCodes.slice(0, 10).join(', ')
    console.log(`[CSI] ${device.id} unrecognised fieldCodes (first 10 of ${unrecognisedCodes.length}): ${sample}`)
  }

  if (strings.length === 0) {
    return
  }

  const maxStringNumber = strings[strings.length - 1].string_number
  if (device.max_strings === null || device.max_strings < maxStringNumber) {
    await prisma.devices.update({
      where: { id: device.id },
      data: { max_strings: maxStringNumber },
    })
  }

  const measurements = strings.map((s) => ({
    device_id: device.id,
    plant_id: device.plant_id,
    string_number: s.string_number,
    voltage: new Decimal(s.voltage.toFixed(2)),
    current: new Decimal(s.current.toFixed(3)),
    power: new Decimal(s.power.toFixed(2)),
  }))

  await prisma.string_measurements.createMany({
    data: measurements.map((m) => ({ ...m, timestamp: new Date() })),
  })

  const stringConfigs = await loadStringConfigs(device.id)
  await generateAlerts(device.id, device.plant_id, measurements, stringConfigs)
  await updateHourlyAggregates(device.id, device.plant_id, maxStringNumber, stringConfigs)
  await updateDailyAggregates(device.id, device.plant_id, maxStringNumber, stringConfigs)

  if (dailyEnergyKwh !== null && dailyEnergyKwh > 0) {
    await prisma.device_daily.upsert({
      where: { device_id_date: { device_id: device.id, date: getPKTDateForDB() } },
      update: { native_kwh: new Decimal(dailyEnergyKwh) },
      create: {
        device_id: device.id,
        plant_id: device.plant_id,
        date: getPKTDateForDB(),
        native_kwh: new Decimal(dailyEnergyKwh),
        provider: PROVIDERS.CSI,
      },
    })
  }
}

async function fetchCsiAlarms(client: CsiClient): Promise<void> {
  console.log('[CSI] Fetching vendor alarms...')
  try {
    // Need plant IDs first — SolarMAN-derived alert endpoints typically
    // require plantId scoping (matches Sungrow's per-plant iteration).
    const csiPlants = await prisma.plants.findMany({
      where: { provider: PROVIDERS.CSI },
      select: { id: true },
    })
    if (csiPlants.length === 0) return

    const csiDevices = await prisma.devices.findMany({
      where: { provider: PROVIDERS.CSI },
      select: { id: true, plant_id: true },
    })
    if (csiDevices.length === 0) return
    const deviceBySn = new Map(csiDevices.map((d) => [d.id, d]))

    const alerts = await client.getAllActiveAlerts(csiPlants.map((p) => p.id))
    let stored = 0

    const seenIds = new Set<string>()
    for (const alert of alerts) {
      const device = deviceBySn.get(alert.deviceSn)
      if (!device) continue
      seenIds.add(alert.alertId)

      const severity = mapCsiSeverity(alert.alertLevel, alert.alertLevelLabel)
      // CSI alert.status: numeric undocumented. statusLabel may say
      // "Cleared"/"Restored" when closed. Treat statusLabel keyword as the
      // resolution signal until we see real values.
      const statusLower = alert.statusLabel.toLowerCase()
      const closed =
        statusLower.includes('clear') ||
        statusLower.includes('restor') ||
        statusLower.includes('resolv') ||
        !!alert.endTime

      const resolvedAt = closed
        ? (alert.endTime ? new Date(alert.endTime) : new Date())
        : null

      try {
        await prisma.vendor_alarms.upsert({
          where: {
            provider_vendor_alarm_id: {
              provider: PROVIDERS.CSI,
              vendor_alarm_id: alert.alertId,
            },
          },
          update: { ...(resolvedAt ? { resolved_at: resolvedAt } : {}) },
          create: {
            device_id: device.id,
            plant_id: device.plant_id,
            provider: PROVIDERS.CSI,
            vendor_alarm_id: alert.alertId,
            alarm_code: alert.alertCode || null,
            severity,
            message: alert.alertCodeName || 'Unknown alarm',
            advice: null,
            started_at: alert.startTime ? new Date(alert.startTime) : new Date(),
            resolved_at: resolvedAt,
            raw_data: alert.raw as any,
          },
        })
        stored++
      } catch {
        // unique constraint race — safe to skip
      }
    }

    // Diff-resolve: any CSI vendor alarm currently OPEN in our DB but no
    // longer in the active-alerts response → mark resolved. Mirrors the
    // pattern used in sungrow-poller.fetchSungrowAlarms.
    const openCsiAlarms = await prisma.vendor_alarms.findMany({
      where: { provider: PROVIDERS.CSI, resolved_at: null },
      select: { vendor_alarm_id: true },
    })
    const goneIds = openCsiAlarms.map((a) => a.vendor_alarm_id).filter((id) => !seenIds.has(id))
    if (goneIds.length > 0) {
      await prisma.vendor_alarms.updateMany({
        where: {
          provider: PROVIDERS.CSI,
          vendor_alarm_id: { in: goneIds },
          resolved_at: null,
        },
        data: { resolved_at: new Date() },
      })
    }

    console.log(`[CSI] Stored/updated ${stored} vendor alarms (auto-resolved ${goneIds.length})`)
  } catch (error) {
    console.error('[CSI] Failed to fetch vendor alarms:', error)
  }
}
