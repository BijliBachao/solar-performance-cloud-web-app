import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { SolisClient } from '@/lib/solis-client'
import { PROVIDERS, DEVICE_TYPE_IDS, POLLER_DEVICE_CONCURRENCY } from '@/lib/constants'
import { generateAlerts, updateHourlyAggregates, updateDailyAggregates, safeFloat, getPKTDateForDB, loadStringConfigs, processInBatches, recordDeviceFreshness, recordDeviceSeen, logWriteGate, sunUpForWriteGate, resolveAlertsForUntrustedFeed, alertsArmed } from '@/lib/poller-utils'
import { classifyDeviceWrite } from '@/lib/string-health'
import { classifyVendorFeed } from '@/lib/string-health'

let lastPlantSync = 0
let lastDeviceSync = 0
let lastAlarmSync = 0
const HOUR_MS = 60 * 60 * 1000

// Vendor-feed freshness tracking (per poller process).
//  - lastSeenDataTs: the vendor dataTimestamp (ms epoch) we last WROTE for a
//    device. SolisCloud publishes new data slower than our 5-min poll for some
//    inverters (verified live 2026-06-02), so we dedup on it to avoid storing
//    the same physical reading repeatedly and skewing aggregates.
//    NOTE: process-memory only — the first poll after a poller restart may
//    write one duplicate sample if the vendor hasn't advanced since the last
//    pre-restart write. Tolerable (one row); not worth persisting.
//  - staleFeedLogged: dedup the "feed stale" warning to once per stall, cleared
//    on recovery.
const lastSeenDataTs = new Map<string, number>()
const staleFeedLogged = new Set<string>()

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

    if (now - lastAlarmSync > HOUR_MS) {
      await fetchSolisAlarms(client)
      lastAlarmSync = now
    }

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
    if (stations.length > 0) {
      await prisma.$transaction(
        stations.map((station) =>
          prisma.plants.update({
            where: { id: station.id },
            data: { health_state: mapSolisHealthState(station.state) },
          })
        )
      )
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
      last_reading_sig: true,
      // Plant coords for the night write-gate (fleet-default fallback at the gate).
      plants: { select: { latitude: true, longitude: true } },
    },
  })

  if (devices.length === 0) {
    console.log('[Solis] No inverters found, skipping string data fetch')
    return
  }

  await processInBatches(
    devices,
    POLLER_DEVICE_CONCURRENCY,
    (device) => processSolisDevice(client, device),
    'Solis',
  )

  console.log('[Solis] String data fetch complete')
}

async function processSolisDevice(
  client: SolisClient,
  device: {
    id: string; plant_id: string; max_strings: number | null; last_reading_sig: string | null
    plants: { latitude: unknown; longitude: unknown } | null
  },
): Promise<void> {
  const detail = await client.getInverterDetail(device.id)
  // Vendor data-time (ms epoch) for the connectivity "vendor last data" display.
  const vendorTs = detail.dataTimestamp != null ? new Date(detail.dataTimestamp) : null

  // ── Vendor-feed freshness gate (2026-06-02) ───────────────────────────
  // Purely a DATA-INTEGRITY guard — it never touches plant.health_state.
  // Plant health is managed every cycle by syncSolisPlantHealth() from the
  // vendor's authoritative station `state` (bidirectional), so a per-device
  // downgrade here would (a) black out a multi-inverter plant on one stale
  // inverter and (b) flap against syncSolisPlantHealth every 5 min. This is
  // the key difference from the CSI gate: CSI's syncCsiPlantHealth only
  // *upgrades*, so CSI needs the gate to downgrade; Solis does not.
  //
  // Two failure modes, both keyed off the vendor's own dataTimestamp:
  //   stale     → multi-hour freeze (CSI-style): skip writes (no fresh data).
  //   duplicate → vendor publishes slower than we poll: skip the write to avoid
  //               storing the same physical reading twice and skewing aggregates.
  // Missing/unparseable dataTimestamp → 'fresh' (fail-open) so a transient
  // missing field never blacks out the whole provider.
  const feedAction = classifyVendorFeed(detail.dataTimestamp, lastSeenDataTs.get(device.id))
  if (feedAction === 'stale') {
    if (!staleFeedLogged.has(device.id)) {
      staleFeedLogged.add(device.id)
      const ts = detail.dataTimestamp ? new Date(detail.dataTimestamp).toISOString() : 'null'
      console.warn(`[Solis] ${device.id} vendor feed stale (dataTimestamp=${ts}) — pausing writes until it advances`)
    }
    // Record the (stuck) vendor time + last_seen_at so the connectivity UI
    // shows "frozen since HH:MM" (frozen ≠ offline) — restart-safe. No fresh
    // strings here, so the reading signature is deliberately untouched. The
    // stuck ts is safe to store: it doesn't advance, so it can't fake "live".
    await recordDeviceSeen(device.id, vendorTs)
    await resolveAlertsForUntrustedFeed(device.id)
    return
  }
  if (staleFeedLogged.delete(device.id)) {
    console.log(`[Solis] ${device.id} vendor feed recovered (dataTimestamp=${detail.dataTimestamp ? new Date(detail.dataTimestamp).toISOString() : 'null'}) — resuming writes`)
  }
  if (feedAction === 'duplicate') {
    // Vendor hasn't published a new sample since our last write — nothing new
    // to record. Aggregates are recomputed from stored rows on the next fresh
    // sample, so skipping is safe (and keeps string_measurements honest).
    await recordDeviceSeen(device.id, vendorTs)
    return
  }
  if (detail.dataTimestamp != null) lastSeenDataTs.set(device.id, detail.dataTimestamp)

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
    const voltage = safeFloat(detail[`uPv${s}`])
    const current = safeFloat(detail[`iPv${s}`])
    const power = safeFloat(detail[`pow${s}`]) // Solis provides power directly

    // Solis MPPT topology: 2 strings share 1 MPPT, API reports current
    // on primary string only. Secondary strings have voltage but always
    // 0 current — storing them creates false "0 A Fault" alerts.
    // Only store strings that have measurable current.
    if (current > 0) {
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
    const gateStrings = measurements.map((m) => ({
      string_number: m.string_number, voltage: Number(m.voltage), current: Number(m.current), power: Number(m.power),
    }))

    // ── Write gate (DQ v2), second layer behind classifyVendorFeed ───
    // The dataTimestamp gate above catches an HONEST stuck clock; this one
    // catches a LYING clock — dataTimestamp advancing while every value stays
    // frozen (replay), or night snapshots claiming production. 40k phantom
    // night rows in the week before this gate.
    const sunUp = sunUpForWriteGate(device.plants)
    const gate = classifyDeviceWrite(gateStrings, device.last_reading_sig, sunUp)
    logWriteGate('Solis', device.id, gate)
    if (gate !== 'write') {
      // last_seen_at ONLY — advancing a lying vendor ts here would classify
      // the device "live" and hide the freeze. Untrusted data → open alerts
      // resolved (re-open on recovery).
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
    const stringConfigs = await loadStringConfigs(device.id)
    await generateAlerts(device.id, device.plant_id, measurements, stringConfigs, alertsArmed(device.plants))
    await updateHourlyAggregates(device.id, device.plant_id, maxStrings, stringConfigs)
    await updateDailyAggregates(device.id, device.plant_id, maxStrings, stringConfigs, { model: null, max_strings: device.max_strings })
    // Connectivity freshness: vendor time + value-change signature.
    await recordDeviceFreshness(device.id, gateStrings, vendorTs, device.last_reading_sig)
  }

  // Save hardware daily counter — source of truth for "today's energy" display
  const eToday = Number(detail.eToday ?? 0)
  if (eToday > 0) {
    await prisma.device_daily.upsert({
      where: { device_id_date: { device_id: device.id, date: getPKTDateForDB() } },
      update: { native_kwh: new Decimal(eToday) },
      create: {
        device_id: device.id,
        plant_id: device.plant_id,
        date: getPKTDateForDB(),
        native_kwh: new Decimal(eToday),
        provider: PROVIDERS.SOLIS,
      },
    })
  }
}

async function fetchSolisAlarms(client: SolisClient): Promise<void> {
  console.log('[Solis] Fetching vendor alarms...')
  try {
    // Build device_name → {id, plant_id} map for Solis devices
    // Solis stores: devices.id = Solis internal ID, devices.device_name = SN
    // Alarm response: alarmDeviceSn = SN → match device_name
    const solisDevices = await prisma.devices.findMany({
      where: { provider: PROVIDERS.SOLIS },
      select: { id: true, plant_id: true, device_name: true },
    })
    const deviceBySn = new Map(solisDevices.map(d => [d.device_name, d]))

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0] // yyyy-MM-dd

    const alarms = await client.getAlarmList({
      beginDate: fmt(sevenDaysAgo),
      endDate: fmt(today),
    })

    let stored = 0
    for (const alarm of alarms) {
      const device = deviceBySn.get(alarm.alarmDeviceSn)
      if (!device) continue // unknown device — skip

      const level = String(alarm.alarmLevel)
      const severity = level === '3' ? 'CRITICAL' : level === '2' ? 'WARNING' : 'INFO'
      // Solis state: 0=pending, 1=processed (acknowledged in Solis UI),
      //              2=restored (cleared by hardware).
      // Both 1 and 2 mean "no longer actionable" — treat both as resolved.
      // Previously only state===2 was resolved, leaving acknowledged alarms
      // visible forever in our DB and confusing operators.
      const closedState = String(alarm.state) === '1' || String(alarm.state) === '2'
      const resolvedAt = closedState
        ? (alarm.alarmEndTime ? new Date(Number(alarm.alarmEndTime)) : new Date())
        : null

      // Solis always returns id="-1" — not a real unique ID.
      // Use composite key: SN + code + begin-time (unique per alarm event).
      const vendorAlarmId = `${alarm.alarmDeviceSn}_${alarm.alarmCode}_${alarm.alarmBeginTime}`

      try {
        await prisma.vendor_alarms.upsert({
          where: { provider_vendor_alarm_id: { provider: PROVIDERS.SOLIS, vendor_alarm_id: vendorAlarmId } },
          update: {
            ...(resolvedAt ? { resolved_at: resolvedAt } : {}),
          },
          create: {
            device_id: device.id,
            plant_id: device.plant_id,
            provider: PROVIDERS.SOLIS,
            vendor_alarm_id: vendorAlarmId,
            alarm_code: alarm.alarmCode ? String(alarm.alarmCode) : null,
            severity,
            message: alarm.alarmMsg || 'Unknown alarm',
            advice: alarm.advice || null,
            started_at: new Date(Number(alarm.alarmBeginTime)),
            resolved_at: resolvedAt,
            raw_data: alarm,
          },
        })
        stored++
      } catch {
        // unique constraint race — safe to skip
      }
    }

    console.log(`[Solis] Stored/updated ${stored} vendor alarms`)
  } catch (error) {
    console.error('[Solis] Failed to fetch vendor alarms:', error)
  }
}
