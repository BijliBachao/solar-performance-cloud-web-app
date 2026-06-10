import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { SungrowClient } from '@/lib/sungrow-client'
import { PROVIDERS, DEVICE_TYPE_IDS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, safeFloat, safeObject, getPKTDateForDB, loadStringConfigs, processInBatches, recordDeviceFreshness, recordDeviceSeen, logWriteGate, sunUpForWriteGate, alertsArmed, REVERSE_CURRENT_ALERT_A } from '@/lib/poller-utils'
import { classifyDeviceWrite } from '@/lib/string-health'

let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
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

// p1 = Today's Energy (当日发电) — per-device hardware counter, documented in SUNGROW-API-KNOWLEDGE.md
const SUNGROW_DAILY_YIELD_POINT = 1

const ALL_POINT_IDS = [
  SUNGROW_DAILY_YIELD_POINT,
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
    // Fetch station list once per cycle — reused for both health sync and plant upsert
    const stations = await client.getPowerStationList()

    let plantsSyncedThisCycle = false

    if (now - lastPlantSync > HOUR_MS) {
      await syncSungrowPlants(stations)
      lastPlantSync = now
      plantsSyncedThisCycle = true
    }

    if (now - lastDeviceSync > HOUR_MS) {
      await syncSungrowDevices(client)
      lastDeviceSync = now
    }

    if (!plantsSyncedThisCycle) {
      await syncSungrowPlantHealth(stations)
    }

    await fetchSungrowStringData(client)

    if (now - lastAlarmSync > HOUR_MS) {
      await fetchSungrowAlarms(client)
      lastAlarmSync = now
    }

    console.log('[Sungrow] Poll cycle complete.')
  } catch (error) {
    console.error('[Sungrow] Error during poll cycle:', error)
  }
}

async function syncSungrowPlants(stations: Awaited<ReturnType<SungrowClient['getPowerStationList']>>): Promise<void> {
  console.log('[Sungrow] Syncing plants...')

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

async function syncSungrowPlantHealth(stations: Awaited<ReturnType<SungrowClient['getPowerStationList']>>): Promise<void> {
  if (stations.length === 0) return
  try {
    await prisma.$transaction(
      stations.map((station) =>
        prisma.plants.update({
          where: { id: station.ps_id },
          data: { health_state: mapSungrowHealthState(station.ps_status) },
        })
      )
    )
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
      strings_are_mppts: true,
      last_reading_sig: true,
      // Plant coords for the night write-gate (Pakistan-bbox fallback applied
      // at the gate — never trust fail-open-day for write decisions).
      plants: { select: { latitude: true, longitude: true } },
    },
  })

  if (devices.length === 0) {
    console.log('[Sungrow] No inverters found, skipping string data fetch')
    return
  }

  await processInBatches(
    devices,
    POLLER_DEVICE_CONCURRENCY,
    (device) => processSungrowDevice(client, device),
    'Sungrow',
  )

  console.log('[Sungrow] String data fetch complete')
}

async function processSungrowDevice(
  client: SungrowClient,
  device: {
    id: string; plant_id: string; max_strings: number | null; strings_are_mppts: boolean
    last_reading_sig: string | null
    plants: { latitude: unknown; longitude: unknown } | null
  },
): Promise<void> {
  const results = await client.getDeviceRealTimeData(
    [device.id], // device_sn
    ALL_POINT_IDS
  )

  if (results.length === 0) return
  // Guard: Sungrow can return result_data with empty/null first slot during
  // partial outages — without safeObject every dp[...] access below throws.
  const dp = safeObject(results[0])
  if (Object.keys(dp).length === 0) return

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
  if (maxStrings === 0) return // No strings detected, skip

  // Persist max_strings (when discovered) and the strings-are-MPPTs flag.
  // Sungrow reports current per-MPPT on the primary string only (secondary
  // strings read 0), so each stored string is effectively a whole MPPT — flag
  // it so the health grouping doesn't pair two trackers (fixes the prior
  // odd-only collapse to whole-inverter).
  const sungrowUpdate: { max_strings?: number; strings_are_mppts?: boolean } = {}
  if (detectedStrings > 0 && detectedStrings !== device.max_strings) sungrowUpdate.max_strings = detectedStrings
  if (device.strings_are_mppts !== true) sungrowUpdate.strings_are_mppts = true
  if (Object.keys(sungrowUpdate).length > 0) {
    await prisma.devices.update({ where: { id: device.id }, data: sungrowUpdate })
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
    // Store positive current (production) — and NEGATIVE only when it is
    // real reverse current (backfeed/wiring fault — seen live at −17.46A on
    // a Huawei unit 2026-06-05), not sub-zero sensor noise: a −0.01A reading
    // slipping through would mint a false open-circuit CRITICAL.
    if (current > 0 || current <= -REVERSE_CURRENT_ALERT_A) {
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
    // Sungrow's realtime endpoint replays the last daytime snapshot when a
    // datalogger goes quiet (confirmed live: identical-to-0.01W values every
    // 5 min for days). No vendor data-timestamp exists to gate on, so the gate
    // runs on the reading signature + the sun position at the plant.
    const sunUp = sunUpForWriteGate(device.plants)
    const gate = classifyDeviceWrite(gateStrings, device.last_reading_sig, sunUp)
    logWriteGate('Sungrow', device.id, gate)
    if (gate !== 'write') {
      // Still "saw" the device this cycle (frozen ≠ offline) — but the
      // untrusted snapshot must not advance the reading signature, create
      // alerts, feed aggregates, or refresh the native daily counter.
      // Do NOT resolve alerts here: one duplicate cycle is not a frozen feed
      // (a live-but-static inverter alternates duplicate/write and would
      // flap its alerts every cycle). sweepAlertsOnDarkDevices() resolves
      // alerts only on SUSTAINED frozen/offline classification.
      await recordDeviceSeen(device.id, null)
      return
    }

    await prisma.string_measurements.createMany({
      data: measurements.map((m) => ({
        ...m,
        timestamp: new Date(),
      })),
    })

    // Connectivity freshness: value-change signature from the strings we just
    // parsed. Sungrow's getDeviceRealTimeData has no data-timestamp, so pass null.
    await recordDeviceFreshness(device.id, gateStrings, null, device.last_reading_sig)

    const stringConfigs = await loadStringConfigs(device.id)
    await generateAlerts(device.id, device.plant_id, measurements, stringConfigs, alertsArmed(device.plants), { model: null, max_strings: device.max_strings ?? null, strings_are_mppts: true })
    await updateHourlyAggregates(device.id, device.plant_id, maxStrings, stringConfigs)
    await updateDailyAggregates(device.id, device.plant_id, maxStrings, stringConfigs, { model: null, max_strings: device.max_strings, strings_are_mppts: true })
  }

  // Save hardware daily counter — p1 = Today's Energy (当日发电), per-device, unit = Wh
  const nativeKwh = safeFloat(dp['p1']) / 1000 // convert Wh → kWh
  // Native counter only from a TRUSTED cycle: gate-skip paths return early,
  // so measurements.length > 0 here proves the gate passed. Without this, a
  // replayed snapshot that parses zero usable strings falls through and
  // overwrites today's counter (Qadir replayed 738.8 kWh for 2 days, Jun 3-4).
  if (measurements.length > 0 && nativeKwh > 0) {
    await prisma.device_daily.upsert({
      where: { device_id_date: { device_id: device.id, date: getPKTDateForDB() } },
      update: { native_kwh: new Decimal(nativeKwh) },
      create: {
        device_id: device.id,
        plant_id: device.plant_id,
        date: getPKTDateForDB(),
        native_kwh: new Decimal(nativeKwh),
        provider: PROVIDERS.SUNGROW,
      },
    })
  }
}

// Minimum-viable Sungrow vendor-alarm ingestion using `dev_fault_status` from
// getDeviceList. Sungrow's full alarm-list endpoint (e.g. getDeviceFault) is
// not yet researched in our knowledge base, so we synthesize one row per
// faulty device. When Sungrow exposes proper alarm codes/names we'll replace
// this with the real endpoint and richer data; until then, even a binary
// "device X has a fault" beats the current behaviour of zero alarms ever.
async function fetchSungrowAlarms(client: SungrowClient): Promise<void> {
  console.log('[Sungrow] Fetching vendor alarms...')
  try {
    const plants = await prisma.plants.findMany({
      where: { provider: PROVIDERS.SUNGROW },
      select: { id: true },
    })
    if (plants.length === 0) return

    // device_sn → device_id map for upsert lookups
    const sungrowDevices = await prisma.devices.findMany({
      where: { provider: PROVIDERS.SUNGROW },
      select: { id: true, plant_id: true },
    })
    const deviceById = new Map(sungrowDevices.map(d => [d.id, d]))

    const activeIds = new Set<string>()

    for (const plant of plants) {
      const devices = await client.getDeviceList(plant.id)
      for (const dev of devices) {
        const deviceRow = deviceById.get(dev.device_sn)
        if (!deviceRow) continue

        // dev_fault_status: 1 = no fault. Anything else (0, 2, 3, etc.) = fault.
        const isFaulty = dev.dev_fault_status !== 1
        if (!isFaulty) continue

        // Composite key: plant + device-sn + 'devfault' (one synthetic
        // row per faulty device; reopens automatically when fault clears
        // and recurs).
        const vendorAlarmId = `${plant.id}_${dev.device_sn}_devfault`
        activeIds.add(vendorAlarmId)

        try {
          await prisma.vendor_alarms.upsert({
            where: {
              provider_vendor_alarm_id: {
                provider: PROVIDERS.SUNGROW,
                vendor_alarm_id: vendorAlarmId,
              },
            },
            update: {},
            create: {
              device_id: deviceRow.id,
              plant_id: deviceRow.plant_id,
              provider: PROVIDERS.SUNGROW,
              vendor_alarm_id: vendorAlarmId,
              alarm_code: String(dev.dev_fault_status),
              severity: 'CRITICAL',
              message: `Device fault detected (status ${dev.dev_fault_status})`,
              advice: 'Check the Sungrow iSolarCloud portal for fault details. ' +
                      'Possible causes: communication loss, inverter trip, ' +
                      'AC/DC fault, sensor error. Refer to inverter manual ' +
                      'or contact Sungrow support if the fault persists.',
              started_at: new Date(),
              raw_data: dev as any,
            },
          })
        } catch {
          // unique constraint race — safe to skip
        }
      }
    }

    // Diff-resolve: any open Sungrow alarm not in the active set has cleared.
    const openSungrowAlarms = await prisma.vendor_alarms.findMany({
      where: { provider: PROVIDERS.SUNGROW, resolved_at: null },
      select: { id: true, vendor_alarm_id: true },
    })
    const toResolve = openSungrowAlarms.filter(a => !activeIds.has(a.vendor_alarm_id))
    if (toResolve.length > 0) {
      await prisma.vendor_alarms.updateMany({
        where: { id: { in: toResolve.map(a => a.id) } },
        data: { resolved_at: new Date() },
      })
    }

    console.log(`[Sungrow] ${activeIds.size} active alarms, resolved ${toResolve.length}`)
  } catch (error) {
    console.error('[Sungrow] Failed to fetch vendor alarms:', error)
  }
}
