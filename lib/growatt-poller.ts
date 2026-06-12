import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { GrowattClient } from '@/lib/growatt-client'
import { PROVIDERS, DEVICE_TYPE_IDS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, safeFloat, getPKTDateForDB, loadStringConfigs, processInBatches, recordDeviceFreshness, recordDeviceSeen, logWriteGate, sunUpForWriteGate, alertsArmed } from '@/lib/poller-utils'
import { classifyDeviceWrite } from '@/lib/string-health'
import {
  PLANT_HEALTH_HEALTHY,
  PLANT_HEALTH_FAULTY,
  PLANT_HEALTH_DISCONNECTED,
  RECENT_REPORT_WINDOW_MS,
} from '@/lib/string-health'

let lastPlantSync = 0
let lastDeviceSync = 0
const HOUR_MS = 60 * 60 * 1000
const warnedUnmappedDevices = new Set<string>()
const MAX_WARNED_DEVICES = 500

// Growatt plant status -> our DB health_state, with a recency override.
// Growatt: 1=online, 3=bat online (SPH-S), 0=waiting, 4=offline, 2=fault
// Our DB: 1=disconnected, 2=faulty, 3=healthy
//
// Growatt's plant-level `status` lags the real data feed — it reports
// Waiting(0)/Offline(4) at sunrise and overnight even while string data is
// still streaming (confirmed live 2026-05-25 06:59 PKT: 9 of 11 plants flagged
// "disconnected" had reported within 6 minutes). So a bare 0/4 is NOT enough
// to call a plant disconnected. We trust our own measurements: a plant that
// reported within RECENT_REPORT_WINDOW_MS is connected. Fault(2) is always
// respected; only genuine silence is treated as disconnected.
// Exported pure for unit tests.
export function resolveGrowattPlantHealth(status: number, reportedRecently: boolean): number {
  if (status === 2) return PLANT_HEALTH_FAULTY                  // real fault — always respected
  if (status === 1 || status === 3) return PLANT_HEALTH_HEALTHY // online / bat online
  // status 0 (waiting), 4 (offline), or unknown:
  if (reportedRecently) return PLANT_HEALTH_HEALTHY             // data is flowing → vendor status lag
  return PLANT_HEALTH_DISCONNECTED                              // genuine silence
}

// Plants (by id) that reported string data within the recency window.
async function fetchRecentlyReportedPlantIds(plantIds: string[]): Promise<Set<string>> {
  if (plantIds.length === 0) return new Set()
  const cutoff = new Date(Date.now() - RECENT_REPORT_WINDOW_MS)
  const rows = await prisma.string_measurements.findMany({
    where: { plant_id: { in: plantIds }, timestamp: { gte: cutoff } },
    select: { plant_id: true },
    distinct: ['plant_id'],
  })
  return new Set(rows.map((r) => r.plant_id))
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
  if (deviceType !== 'max') {
    console.warn(`[Growatt] Unknown device type "${deviceType}", defaulting to MAX`)
  }
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
  const recentlyReported = await fetchRecentlyReportedPlantIds(plants.map((p) => String(p.plant_id)))

  await prisma.$transaction(
    plants.map((plant) => {
      const plantId = String(plant.plant_id)
      const health = resolveGrowattPlantHealth(plant.status, recentlyReported.has(plantId))
      return prisma.plants.upsert({
        where: { id: plantId },
        update: {
          plant_name: plant.name,
          capacity_kw: plant.peak_power ? new Decimal(plant.peak_power) : null,
          address: plant.city || null,
          health_state: health,
          provider: PROVIDERS.GROWATT,
          last_synced: new Date(),
        },
        create: {
          id: plantId,
          plant_name: plant.name,
          capacity_kw: plant.peak_power ? new Decimal(plant.peak_power) : null,
          address: plant.city || null,
          health_state: health,
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
      if (!warnedUnmappedDevices.has(device.deviceSn)) {
        if (warnedUnmappedDevices.size >= MAX_WARNED_DEVICES) warnedUnmappedDevices.clear()
        console.warn(`[Growatt] No plant mapping for device ${device.deviceSn} (type: ${device.deviceType}), skipping — will not warn again this session`)
        warnedUnmappedDevices.add(device.deviceSn)
      }
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
    // Plant health comes from the plant list (status field), reconciled
    // against our own recent measurements so a lagging vendor status doesn't
    // false-flag an actively-reporting plant as disconnected.
    const apiPlants = await client.getPlantList()
    if (apiPlants.length > 0) {
      const recentlyReported = await fetchRecentlyReportedPlantIds(apiPlants.map((p) => String(p.plant_id)))
      await prisma.$transaction(
        apiPlants.map((plant) => {
          const plantId = String(plant.plant_id)
          return prisma.plants.update({
            where: { id: plantId },
            data: { health_state: resolveGrowattPlantHealth(plant.status, recentlyReported.has(plantId)) },
          })
        })
      )
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
      strings_are_mppts: true,
      last_reading_sig: true,
      // Plant coords for the night write-gate (Pakistan-bbox fallback at the gate).
      plants: { select: { latitude: true, longitude: true } },
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

      const maxPairs: Array<{ device: typeof maxDevices[number]; deviceData: any }> = []
      for (const deviceData of maxData) {
        if (!deviceData) continue
        const sn = deviceData.serialNum || deviceData.deviceSn || deviceData.sn
        const device = maxDevices.find(d => d.id === sn)
        if (!device) {
          console.warn(`[Growatt] MAX device SN "${sn}" not found in DB (keys: ${Object.keys(deviceData).filter(k => k.toLowerCase().includes('sn') || k.toLowerCase().includes('serial')).join(', ')})`)
          continue
        }
        maxPairs.push({ device, deviceData })
      }

      await processInBatches(
        maxPairs,
        POLLER_DEVICE_CONCURRENCY,
        ({ device, deviceData }) => processDeviceData(device, deviceData, 'max'),
        'Growatt MAX',
      )
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

      const sphPairs: Array<{ device: typeof sphDevices[number]; deviceData: any }> = []
      for (const deviceData of sphData) {
        if (!deviceData) continue
        const sn = deviceData.serialNum || deviceData.deviceSn || deviceData.sn
        const device = sphDevices.find(d => d.id === sn)
        if (!device) {
          console.warn(`[Growatt] SPH-S device SN "${sn}" not found in DB (keys: ${Object.keys(deviceData).filter(k => k.toLowerCase().includes('sn') || k.toLowerCase().includes('serial')).join(', ')})`)
          continue
        }
        sphPairs.push({ device, deviceData })
      }

      await processInBatches(
        sphPairs,
        POLLER_DEVICE_CONCURRENCY,
        ({ device, deviceData }) => processDeviceData(device, deviceData, 'sph-s'),
        'Growatt SPH-S',
      )
    } catch (error) {
      console.error('[Growatt] Failed to fetch SPH-S batch data:', error)
    }
  }

  console.log('[Growatt] String data fetch complete')
}

async function processDeviceData(
  device: {
    id: string; plant_id: string; device_type_id: number; max_strings: number | null
    strings_are_mppts: boolean
    last_reading_sig: string | null
    plants: { latitude: unknown; longitude: unknown } | null
  },
  deviceData: any,
  deviceType: string
): Promise<void> {
  const { strings, granularity } = extractStrings(deviceData, deviceType)
  const maxStrings = device.max_strings || (strings.length > 0 ? Math.max(...strings.map(s => s.string_number)) : 0)
  // Level-2 (vpv) devices report MPPT-level data → each stored "string" is a
  // whole MPPT. Flag it so the health grouping doesn't pair two trackers.
  const stringsAreMppts = granularity === 'mppt'

  // Persist max_strings (when it grows) and the strings-are-MPPTs flag (when it
  // changes) in one conditional write — avoid a per-cycle update on shared RDS.
  const deviceUpdate: { max_strings?: number; strings_are_mppts?: boolean } = {}
  if (maxStrings > 0 && (!device.max_strings || maxStrings > device.max_strings)) deviceUpdate.max_strings = maxStrings
  if (strings.length > 0 && stringsAreMppts !== device.strings_are_mppts) deviceUpdate.strings_are_mppts = stringsAreMppts
  if (Object.keys(deviceUpdate).length > 0) {
    await prisma.devices.update({ where: { id: device.id }, data: deviceUpdate })
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

  // Vendor data-time: deviceData.time is "YYYY-MM-DD HH:MM:SS" in PKT
  // (account-local). NOT deviceData.calendar — that field is timezone-shifted
  // ~3h and wrong (verified).
  const gt = (deviceData as any)?.time
  const _g = typeof gt === 'string' ? new Date(gt.replace(' ', 'T') + '+05:00') : null
  const vendorTs = _g && !isNaN(_g.getTime()) ? _g : null

  if (measurements.length > 0) {
    const gateStrings = strings.map((s) => ({
      string_number: Number(s.string_number),
      voltage: Number(s.voltage),
      current: Number(s.current),
      power: Number(s.power),
    }))

    // ── Write gate (DQ v2) ─────────────────────────────────────────
    // Growatt replays cached snapshots when a logger goes quiet (29k phantom
    // night rows in the week before this gate; one logger clock also runs ~2h
    // fast). Signature dedup + night gate keep replays out of the data.
    const sunUp = sunUpForWriteGate(device.plants)
    const gate = classifyDeviceWrite(gateStrings, device.last_reading_sig, sunUp)
    logWriteGate('Growatt', device.id, gate)
    if (gate !== 'write') {
      // Seen, not trusted: stamp last_seen_at ONLY. Deliberately NOT the
      // vendor ts — a lying clock (ts advancing while values replay) would
      // otherwise classify the device "live" and hide the freeze. Skip
      // measurements/alerts/aggregates/fault codes/native counter — all
      // would be echoes of the replayed snapshot. Do NOT resolve alerts
      // here: one duplicate cycle is not a frozen feed (a live-but-static
      // inverter alternates duplicate/write and would flap its alerts every
      // cycle). sweepAlertsOnDarkDevices() resolves alerts only on
      // SUSTAINED frozen/offline classification.
      await recordDeviceSeen(device.id, null)
      return
    }

    await prisma.string_measurements.createMany({
      data: measurements.map((m) => ({
        ...m,
        timestamp: new Date(),
      })),
    })

    // Connectivity freshness: vendor time + value-change signature, from the
    // strings we just wrote. Only on the path where strings were written.
    await recordDeviceFreshness(device.id, gateStrings, vendorTs, device.last_reading_sig)
  }

  if (measurements.length > 0) {
    const stringConfigs = await loadStringConfigs(device.id)
    const effectiveStrings = maxStrings || strings.length
    await generateAlerts(device.id, device.plant_id, measurements, stringConfigs, alertsArmed(device.plants), { model: null, max_strings: device.max_strings ?? null, strings_are_mppts: stringsAreMppts })
    await updateHourlyAggregates(device.id, device.plant_id, effectiveStrings, stringConfigs)
    await updateDailyAggregates(device.id, device.plant_id, effectiveStrings, stringConfigs, { model: null, max_strings: device.max_strings, strings_are_mppts: stringsAreMppts })
  }

  // Process fault/warning codes → vendor_alarms — ONLY on a trusted production
  // cycle (measurements present). On a zero-measurement night/off cycle the
  // write gate above never runs, so processing here could let a faultType:0
  // false-resolve a real open alarm; gate it like the native-counter block below.
  // The real MAX/SPH-S fields are `faultType` / `warnCode` (probed live
  // 2026-06-12); the legacy `faultcode`/`warningcode` names do NOT exist in the
  // payload (this path was DEAD before). A missing OR unparseable code is
  // treated as "unknown → skip": only a parsed value ≥ 0 is acted on, so a
  // genuine 0 resolves but a NaN/garbage value never false-resolves.
  if (measurements.length > 0) {
    const faultCode = Number(deviceData.faultType ?? deviceData.faultcode)
    const warnCodeVal = Number(deviceData.warnCode ?? deviceData.warningcode)
    if (Number.isFinite(faultCode) && faultCode >= 0) {
      await processGrowattFaultCode(device.id, device.plant_id, faultCode, 'fault')
    }
    if (Number.isFinite(warnCodeVal) && warnCodeVal >= 0) {
      await processGrowattFaultCode(device.id, device.plant_id, warnCodeVal, 'warn')
    }
  }

  // Save hardware daily counter — source of truth for "today's energy" display
  const nativeKwh = deviceData.eacToday ?? deviceData.eToday ?? null
  // Trusted-cycle guard (see sungrow-poller): no measurements ⇒ gate never ran.
  if (measurements.length > 0 && nativeKwh !== null && Number(nativeKwh) > 0) {
    await prisma.device_daily.upsert({
      where: { device_id_date: { device_id: device.id, date: getPKTDateForDB() } },
      update: { native_kwh: new Decimal(nativeKwh) },
      create: {
        device_id: device.id,
        plant_id: device.plant_id,
        date: getPKTDateForDB(),
        native_kwh: new Decimal(nativeKwh),
        provider: PROVIDERS.GROWATT,
      },
    })
  }
}

interface StringReading {
  string_number: number
  voltage: number
  current: number
  power: number
}

function extractStrings(
  deviceData: any,
  deviceType: string,
): { strings: StringReading[]; granularity: 'string' | 'mppt' } {
  const strings: StringReading[] = []

  // Level 1: individual string data (vString) — only some MAX devices have it.
  // These are REAL strings (a string within an MPPT), so 2-per-MPPT pairing is OK.
  if (deviceType === 'max') {
    for (let i = 1; i <= 32; i++) {
      const v = safeFloat(deviceData[`vString${i}`])
      const c = safeFloat(deviceData[`currentString${i}`])
      if (v > 0 || c > 0) {
        strings.push({ string_number: i, voltage: v, current: c, power: v * c })
      }
    }
  }
  if (strings.length > 0) return { strings, granularity: 'string' }

  // Level 2: MPPT-level data (vpv) — every device has this. Here each
  // string_number is a whole MPPT TRACKER, not a string within one. Validated
  // 2026-06-09: pairing these 2-by-2 mis-grouped ~7 Growatt devices (it compared
  // two different trackers). Caller flags devices.strings_are_mppts so the health
  // grouping treats each as its own MPPT (→ device-wide comparison) instead.
  const maxMppt = deviceType === 'sph-s' ? 3 : 16
  for (let i = 1; i <= maxMppt; i++) {
    const v = safeFloat(deviceData[`vpv${i}`])
    const c = safeFloat(deviceData[`ipv${i}`])
    const p = safeFloat(deviceData[`ppv${i}`])
    if (v > 0 || c > 0 || p > 0) {
      strings.push({ string_number: i, voltage: v, current: c, power: p || (v * c) })
    }
  }
  return { strings, granularity: 'mppt' }
}

// Track active Growatt fault/warning codes per device, from the real-time
// snapshot (faultType / warnCode). No usable history/alarm-list API for our MAX
// fleet, so open/resolved is inferred from the current code: a new code opens a
// row (timestamped key → a recurrence reopens as a new row), code 0 resolves the
// open row. The caller skips this entirely when the field is absent (no
// false-resolve on a partial response).
async function processGrowattFaultCode(
  deviceId: string,
  plantId: string,
  code: number,
  kind: 'fault' | 'warn',
): Promise<void> {
  const openAlarm = await prisma.vendor_alarms.findFirst({
    where: { device_id: deviceId, provider: PROVIDERS.GROWATT, resolved_at: null,
      vendor_alarm_id: { startsWith: `${deviceId}_${kind}_` } },
    select: { id: true, alarm_code: true },
  })

  if (code > 0) {
    if (openAlarm && openAlarm.alarm_code === String(code)) return // unchanged, no-op

    // Different code or no open alarm — resolve old, open new
    if (openAlarm) {
      await prisma.vendor_alarms.update({ where: { id: openAlarm.id }, data: { resolved_at: new Date() } })
    }

    await prisma.vendor_alarms.create({
      data: {
        device_id: deviceId,
        plant_id: plantId,
        provider: PROVIDERS.GROWATT,
        vendor_alarm_id: `${deviceId}_${kind}_${Date.now()}`,
        alarm_code: String(code),
        // TODO: Growatt's snapshot carries no severity taxonomy or human text;
        // fault→CRITICAL/warn→WARNING + bare-code message is the proxy ceiling.
        // A real code→description/severity map needs the v1 fault-LIST endpoint
        // (permission-gated for our MAX fleet) — see Working/all_API/growatt.
        severity: kind === 'fault' ? 'CRITICAL' : 'WARNING',
        message: kind === 'fault' ? `Inverter fault code ${code}` : `Inverter warning code ${code}`,
        advice: 'Check the Growatt ShinePhone / ShineServer portal for the full fault description. ' +
          'Common causes: grid voltage/frequency out of range, insulation/PID fault, ' +
          'over-temperature, or string fault. Contact Growatt support if it persists.',
        started_at: new Date(),
      },
    })
  } else if (openAlarm) {
    await prisma.vendor_alarms.update({ where: { id: openAlarm.id }, data: { resolved_at: new Date() } })
  }
}
