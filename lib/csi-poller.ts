import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { CsiClient, CsiDevice, CsiDeviceData, parseRealData } from '@/lib/csi-client'
import { PROVIDERS, DEVICE_TYPE_IDS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, getPKTDateForDB, loadStringConfigs, processInBatches, recordDeviceFreshness, recordDeviceSeen, logWriteGate, sunUpForWriteGate, resolveAlertsForUntrustedFeed, alertsArmed } from '@/lib/poller-utils'
import { classifyDeviceWrite } from '@/lib/string-health'
import {
  PLANT_HEALTH_HEALTHY,
  PLANT_HEALTH_FAULTY,
  PLANT_HEALTH_DISCONNECTED,
  RECENT_REPORT_WINDOW_MS,
  isVendorFeedStale,
} from '@/lib/string-health'

// Per-process dedup so we log a single warning per stale-feed event per
// device, not once per minute. Cleared the moment the feed recovers.
const staleFeedLogged = new Set<string>()

let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
const HOUR_MS = 60 * 60 * 1000

// CSI device status → our health_state. Per docs §6.3 the LABELS are
// OnLine/OffLine/Alarm/Breakdown/Manual. The numeric encoding is what we've
// observed but not formally documented by CSI.
//
// Key behaviour change (2026-05-24): we don't immediately mark Faulty when CSI
// reports a non-Online status. CSI tends to report OffLine at nighttime even
// for perfectly healthy plants. If `lastReportTime` is within the last 24h,
// the plant is producing on a normal schedule — keep it Healthy. Only mark
// Faulty/Disconnected when we have NO recent reports (>24h silence).
// RECENT_REPORT_WINDOW_MS is centralized in string-health.ts (shared with Growatt).
const seenUnknownHealthStates = new Set<number>()
// Exported for unit tests — function is pure given current time + inputs.
export function mapCsiHealthState(status: number, lastReportTime: string | null): number {
  // Online → always Healthy regardless of lastReportTime.
  if (status === 1) return PLANT_HEALTH_HEALTHY

  // For any non-Online status, check whether the plant has reported recently.
  // CSI's "OffLine" at night is normal — don't downgrade plants that produced today.
  const reportedRecently =
    !!lastReportTime &&
    Date.now() - new Date(lastReportTime).getTime() < RECENT_REPORT_WINDOW_MS

  if (reportedRecently) {
    // Plant is in normal nightly idle / brief comms blip — keep Healthy.
    return PLANT_HEALTH_HEALTHY
  }

  // Genuine silence (>24h): now we trust CSI's status code.
  if (status === 2 || status === 4) return PLANT_HEALTH_FAULTY      // alarm/breakdown
  if (status === 0 || status === 3) return PLANT_HEALTH_DISCONNECTED // offline/unknown

  if (!seenUnknownHealthStates.has(status)) {
    seenUnknownHealthStates.add(status)
    console.warn(`[CSI] mapCsiHealthState: unrecognised status=${status} → defaulting to disconnected`)
  }
  return PLANT_HEALTH_DISCONNECTED
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
          health_state: mapCsiHealthState(p.status, p.lastReportTime),
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
          health_state: mapCsiHealthState(p.status, p.lastReportTime),
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
  // Only UPGRADE to Healthy when we have positive evidence (current power > 0
  // OR daily energy > 0). Never downgrade from this endpoint: r.power=0 at
  // night is normal, not faulty — plants that produced today and are now in
  // nighttime should stay Healthy. The hourly syncCsiPlants() handles real
  // status transitions via CSI's authoritative p.status field.
  try {
    const realtime = await client.getPlantsRealtime(plants.map((p) => p.id))
    if (realtime.length === 0) return
    const producing = realtime.filter((r) => r.power > 0 || r.dayElectric > 0)
    if (producing.length === 0) return
    await prisma.$transaction(
      producing.map((r) =>
        prisma.plants.update({
          where: { id: r.plantId },
          data: { health_state: PLANT_HEALTH_HEALTHY },
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

  // Dedupe by deviceSn: observed 2026-05-07 that /open-api/device/page can
  // return the same inverter under multiple plant queries (CSI's plantId
  // filter is loose). Without dedupe we'd upsert 5×5=25 times for 5 unique
  // inverters, AND each iteration would overwrite plant_id with whichever
  // plant was iterated last — so devices ended up associated with the wrong
  // plant. Use the device's own plantId from the API response, not the
  // loop's plant.id.
  const devicesBySn = new Map<string, CsiDevice>()
  for (const plant of plants) {
    const devices = await client.getPlantDevices(plant.id)
    for (const d of devices) {
      if (!devicesBySn.has(d.deviceSn)) {
        devicesBySn.set(d.deviceSn, d)
      }
    }
  }
  const allDevices = Array.from(devicesBySn.values())

  if (allDevices.length === 0) {
    console.log('[CSI] Synced 0 inverters')
    return
  }

  await prisma.$transaction(
    allDevices.map((d) =>
      prisma.devices.upsert({
        where: { id: d.deviceSn },  // CSI devices keyed by SN (no separate id)
        update: {
          device_name: d.deviceSn,
          plant_id: d.plantId,  // trust API response, not iteration var
          device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
          // max_strings unknown until first /device/data response — leave
          // null and let processCsiDevice fill it in based on realData parse.
          provider: PROVIDERS.CSI,
          last_synced: new Date(),
        },
        create: {
          id: d.deviceSn,
          plant_id: d.plantId,
          device_name: d.deviceSn,
          device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
          provider: PROVIDERS.CSI,
          last_synced: new Date(),
        },
      }),
    ),
  )

  console.log(`[CSI] Synced ${allDevices.length} inverters`)
}

async function fetchCsiStringData(client: CsiClient): Promise<void> {
  console.log('[CSI] Fetching string data...')
  const devices = await prisma.devices.findMany({
    where: {
      provider: PROVIDERS.CSI,
      device_type_id: DEVICE_TYPE_IDS.CSI_INVERTER,
    },
    select: {
      id: true, plant_id: true, max_strings: true, model: true, last_reading_sig: true,
      // Plant coords for the night write-gate (fleet-default fallback at the gate).
      plants: { select: { latitude: true, longitude: true } },
    },
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
  device: {
    id: string; plant_id: string; max_strings: number | null; model: string | null
    last_reading_sig: string | null
    plants: { latitude: unknown; longitude: unknown } | null
  },
  data: CsiDeviceData,
): Promise<void> {
  // Vendor data-time: CSI returns "YYYY-MM-DD HH:MM:SS" (no TZ) — treat as UTC
  // on our UTC host (same convention as isVendorFeedStale). Used for the
  // connectivity "vendor last data" display, recorded even during a freeze.
  const csiTs = data.lastReportTime
    ? new Date(String(data.lastReportTime).replace(' ', 'T') + (/[Z+]/.test(String(data.lastReportTime)) ? '' : 'Z'))
    : null
  const vendorTs = csiTs && !isNaN(csiTs.getTime()) ? csiTs : null

  // Stale-feed gate (2026-06-01). When the CSI/SolarMAN cloud serves a
  // cached snapshot — confirmed lastReportTime stuck for 6+ days on all 5
  // J-series inverters — every poll would write the same frozen V/I/P and
  // every string would look dead. Skip writes entirely, downgrade the plant
  // to DISCONNECTED so the operator sees the truth. Log once per device per
  // stall (cleared the moment the feed recovers below).
  if (isVendorFeedStale(data.lastReportTime)) {
    if (!staleFeedLogged.has(device.id)) {
      staleFeedLogged.add(device.id)
      console.warn(`[CSI] ${device.id} vendor feed stale (lastReportTime=${data.lastReportTime || 'null'}) — pausing writes, plant set DISCONNECTED`)
    }
    await prisma.plants.update({
      where: { id: device.plant_id },
      data: { health_state: PLANT_HEALTH_DISCONNECTED, last_synced: new Date() },
    })
    // Record the (stuck) vendor time + last_seen_at so the UI shows "frozen
    // since HH:MM" and frozen stays distinguishable from offline. Deliberately
    // not recordDeviceFreshness — no fresh strings; an empty-signature would
    // wrongly reset reading_changed_at.
    await recordDeviceSeen(device.id, vendorTs)
    await resolveAlertsForUntrustedFeed(device.id)
    return
  }
  if (staleFeedLogged.delete(device.id)) {
    console.log(`[CSI] ${device.id} vendor feed recovered (lastReportTime=${data.lastReportTime}) — resuming writes`)
  }

  const { strings, dailyEnergyKwh, inverterModel, unrecognisedCodes } = parseRealData(data.realData)

  // Surface unknown fieldCodes once per cycle so we can refine the parser
  // without spamming logs every poll. The first run will produce a
  // representative dump; copy that into Working/all_API/csi/api-test-results.json
  // and tighten the regex / mapping table accordingly.
  if (unrecognisedCodes.length > 0) {
    const sample = unrecognisedCodes.slice(0, 10).join(', ')
    console.log(`[CSI] ${device.id} unrecognised fieldCodes (first 10 of ${unrecognisedCodes.length}): ${sample}`)
  }

  // Capture the inverter model (from the realData `inveter_model` field) so
  // the MPPT topology lookup uses the real model instead of the max-strings
  // fallback. Only write on change to avoid churn.
  const deviceUpdate: { max_strings?: number; model?: string } = {}
  if (inverterModel && inverterModel !== device.model) {
    deviceUpdate.model = inverterModel
  }

  if (strings.length === 0) {
    if (deviceUpdate.model) {
      await prisma.devices.update({ where: { id: device.id }, data: deviceUpdate })
    }
    return
  }

  const maxStringNumber = strings[strings.length - 1].string_number
  if (device.max_strings === null || device.max_strings < maxStringNumber) {
    deviceUpdate.max_strings = maxStringNumber
  }
  if (Object.keys(deviceUpdate).length > 0) {
    await prisma.devices.update({
      where: { id: device.id },
      data: deviceUpdate,
    })
  }

  // ── Write gate (DQ v2), second layer behind isVendorFeedStale ──────
  // The lastReportTime gate above catches an honest stuck clock; this one
  // catches a lying one — lastReportTime advancing while every value stays
  // frozen (replay), or night snapshots claiming production.
  const sunUp = sunUpForWriteGate(device.plants)
  const gate = classifyDeviceWrite(strings, device.last_reading_sig, sunUp)
  logWriteGate('CSI', device.id, gate)
  if (gate !== 'write') {
    // last_seen_at ONLY — advancing a lying vendor ts here would classify
    // the device "live" and hide the freeze. Untrusted data → open alerts
    // resolved (re-open on recovery).
    await recordDeviceSeen(device.id, null)
    await resolveAlertsForUntrustedFeed(device.id)
    return
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

  // Connectivity freshness: vendor time + value-change signature (all from the
  // strings we just parsed — no extra vendor call).
  await recordDeviceFreshness(device.id, strings, vendorTs, device.last_reading_sig)

  const stringConfigs = await loadStringConfigs(device.id)
  await generateAlerts(device.id, device.plant_id, measurements, stringConfigs, alertsArmed(device.plants))
  await updateHourlyAggregates(device.id, device.plant_id, maxStringNumber, stringConfigs)
  await updateDailyAggregates(device.id, device.plant_id, maxStringNumber, stringConfigs, { model: device.model, max_strings: device.max_strings })

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
