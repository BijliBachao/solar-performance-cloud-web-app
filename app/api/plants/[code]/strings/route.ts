import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import {
  isStale, activeAvg,
  type StringStatus, type StringReading,
} from '@/lib/string-health'
import { scoreLiveSr, type LiveStringInput, type LiveStringResult } from '@/lib/string-health-live'

// Map the SR scorer's result to the 5-value StringStatus the UI renders.
// Physical states (open-circuit / offline) win; otherwise the SR bucket decides.
// A null bucket (can't fairly compare — peer-excluded, too few peers, whole MPPT
// in low light) is NOT flagged — we don't show red for what we can't assess.
function liveDisplayStatus(r: LiveStringResult): StringStatus {
  if (r.status === 'OPEN_CIRCUIT') return 'OPEN_CIRCUIT'
  if (r.status === 'OFFLINE') return 'OFFLINE'
  if (r.bucket === 'critical') return 'CRITICAL'
  if (r.bucket === 'abnormal') return 'WARNING'
  return 'NORMAL'
}

// PKT day start for "today" query
function getTodayStart(): Date {
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000
  const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
  const dayStart = new Date(Date.UTC(
    nowPKT.getUTCFullYear(), nowPKT.getUTCMonth(), nowPKT.getUTCDate(), 0, 0, 0, 0
  ))
  dayStart.setTime(dayStart.getTime() - PKT_OFFSET_MS)
  return dayStart
}

// Trapezoidal integration: sum of ((P_i + P_i+1) / 2) × Δt
function trapezoidalKwh(
  measurements: Array<{ power: any; timestamp: Date }>
): number {
  if (measurements.length < 2) return 0
  let energyWh = 0
  for (let i = 0; i < measurements.length - 1; i++) {
    const p1 = Number(measurements[i].power)
    const p2 = Number(measurements[i + 1].power)
    const dtHours = (measurements[i + 1].timestamp.getTime() - measurements[i].timestamp.getTime()) / (1000 * 3600)
    if (dtHours > 0 && dtHours < 1) {
      energyWh += ((p1 + p2) / 2) * dtHours
    }
  }
  return energyWh / 1000
}

type LatestRow = {
  device_id: string
  plant_id: string
  timestamp: Date
  string_number: number
  voltage: Decimal | null
  current: Decimal | null
  power: Decimal | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const devices = await prisma.devices.findMany({
      where: { plant_id: params.code, device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } },
      select: { id: true, device_name: true, max_strings: true, model: true },
    })

    // Fetch all string configs for these devices in one query (LEFT JOIN equivalent)
    const deviceIds = devices.map(d => d.id)
    const stringConfigs = deviceIds.length > 0
      ? await prisma.string_configs.findMany({
          where: { device_id: { in: deviceIds } },
          select: {
            device_id: true,
            string_number: true,
            panel_count: true,
            panel_make: true,
            panel_rating_w: true,
            is_used: true,
            exclude_from_peer_comparison: true,
          },
        })
      : []
    const configByKey = new Map(
      stringConfigs.map(c => [`${c.device_id}:${c.string_number}`, c]),
    )

    const todayStart = getTodayStart()

    // Native daily kWh per device from hardware counter
    const todayDate = new Date(Date.UTC(
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCFullYear(),
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCMonth(),
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCDate(),
    ))
    const nativeDailyRows = await prisma.device_daily.findMany({
      where: { device_id: { in: deviceIds }, date: todayDate },
      select: { device_id: true, native_kwh: true },
    })
    const nativeByDevice = new Map(
      nativeDailyRows.map(r => [r.device_id, Number(r.native_kwh || 0)])
    )

    // Latest measurement per (device, string) across the whole plant in ONE query.
    // Uses Postgres DISTINCT ON so dedup happens server-side — returns at most
    // devices × max_strings rows (~240 worst-case) regardless of history depth.
    // Prisma's own `distinct` is post-processed in Node, which would force-load
    // millions of rows on year-old plants; raw SQL with the composite index
    // (device_id, string_number, timestamp DESC) keeps this O(devices × strings).
    const allLatest: LatestRow[] = deviceIds.length > 0
      ? await prisma.$queryRaw<LatestRow[]>`
          SELECT DISTINCT ON (device_id, string_number)
            device_id, plant_id, timestamp, string_number, voltage, current, power
          FROM string_measurements
          WHERE device_id IN (${Prisma.join(deviceIds)})
          ORDER BY device_id, string_number, timestamp DESC
        `
      : []
    const latestByDevice = new Map<string, LatestRow[]>()
    for (const m of allLatest) {
      const arr = latestByDevice.get(m.device_id) || []
      arr.push(m)
      latestByDevice.set(m.device_id, arr)
    }

    // Today's measurements for kWh integration. Bounded by `gte: todayStart`
    // so the row count scales with daylight hours, not history depth.
    const allToday = deviceIds.length > 0
      ? await prisma.string_measurements.findMany({
          where: { device_id: { in: deviceIds }, timestamp: { gte: todayStart } },
          select: { device_id: true, string_number: true, power: true, timestamp: true },
          orderBy: { timestamp: 'asc' },
        })
      : []
    const todayByDevice = new Map<string, typeof allToday>()
    for (const m of allToday) {
      const arr = todayByDevice.get(m.device_id) || []
      arr.push(m)
      todayByDevice.set(m.device_id, arr)
    }

    const deviceStrings = devices.map((device) => {
      const latestMeasurements = latestByDevice.get(device.id) || []
      const todayMeasurements = todayByDevice.get(device.id) || []

      // Group today's measurements by string for trapezoidal kWh
      const todayByString = new Map<number, Array<{ power: any; timestamp: Date }>>()
      for (const m of todayMeasurements) {
        const group = todayByString.get(m.string_number) || []
        group.push(m)
        todayByString.set(m.string_number, group)
      }

      // Staleness: find freshest timestamp, compare each string
      const freshestTs = latestMeasurements.length > 0
        ? Math.max(...latestMeasurements.map(m => m.timestamp.getTime()))
        : 0

      // Build fresh readings for peer-comparison average (exclude stale, admin-flagged
      // unused, AND admin-flagged peer-excluded). Unused strings show induction-leak
      // noise; peer-excluded strings are non-standard orientation/shaded — both would
      // pollute the peer pool that healthy peers are compared against.
      const freshReadings: StringReading[] = latestMeasurements
        .filter(m => !isStale(m.timestamp.getTime(), freshestTs))
        .filter(m => {
          const c = configByKey.get(`${device.id}:${m.string_number}`)
          return c?.is_used !== false && c?.exclude_from_peer_comparison !== true
        })
        .map(m => ({ string_number: m.string_number, current: Number(m.current), voltage: Number(m.voltage) }))

      // Display average (active peer-pool strings, self-inclusive — for KPI pill)
      const displayAvg = activeAvg(freshReadings)

      // Live health via the Self-Referencing Ratio (Algorithm v2 §4c): MPPT-grouped,
      // panel-normalised, max-anchored — the same family as the Analysis tab's daily
      // P2P (median-anchored). Replaces the legacy raw-current leave-one-out compare,
      // so the live chart and Analysis tab now agree on what "underperforming" means.
      const liveInputs: LiveStringInput[] = latestMeasurements.map((m) => {
        const c = configByKey.get(`${device.id}:${m.string_number}`)
        return {
          string_number: m.string_number,
          voltage: Number(m.voltage),
          current: Number(m.current),
          power: Number(m.power),
          panel_count: c?.panel_count ?? null,
          is_used: c?.is_used !== false,
          exclude_from_peer_comparison: c?.exclude_from_peer_comparison === true,
          stale: isStale(m.timestamp.getTime(), freshestTs),
        }
      })
      const srByString = new Map(
        scoreLiveSr(liveInputs, {
          deviceId: device.id,
          inverterModel: device.model,
          inverterMaxStrings: device.max_strings,
        }).map((r) => [r.string_number, r]),
      )

      // Build string data with kWh — exclude admin-flagged unused (those are empty
      // ports, no real energy). Peer-excluded strings DO appear in the response with
      // their real V/A/P/kWh — they're producing energy, just not peer-comparable.
      const strings = latestMeasurements
        .filter(m => configByKey.get(`${device.id}:${m.string_number}`)?.is_used !== false)
        .map((m) => {
          const current = Number(m.current)
          const voltage = Number(m.voltage)
          const stale = isStale(m.timestamp.getTime(), freshestTs)

          const cfg = configByKey.get(`${device.id}:${m.string_number}`)
          const peerExcluded = cfg?.exclude_from_peer_comparison === true

          // SR-based status + gap. The scorer already handles stale/open-circuit/
          // peer-excluded/insufficient-peers internally; gap = how far below the
          // best per-panel peer in this MPPT group (null when not comparable).
          const sr = srByString.get(m.string_number)
          const status: StringStatus = sr ? liveDisplayStatus(sr) : (stale ? 'OFFLINE' : 'NORMAL')
          const gapPercent = sr && sr.sr != null
            ? Math.max(0, Math.round((1 - sr.sr) * 1000) / 10)
            : null

          // Trapezoidal kWh for this string today
          const stringTodayData = todayByString.get(m.string_number) || []
          const kwh = trapezoidalKwh(stringTodayData)

          const nameplate_w = cfg?.panel_count && cfg?.panel_rating_w
            ? cfg.panel_count * cfg.panel_rating_w
            : null

          return {
            string_number: m.string_number,
            voltage,
            current,
            power: Number(m.power),
            gap_percent: gapPercent,
            status,
            peer_excluded: peerExcluded,
            energy_kwh: Math.round(kwh * 1000) / 1000,
            config: cfg
              ? {
                  panel_count: cfg.panel_count,
                  panel_make: cfg.panel_make,
                  panel_rating_w: cfg.panel_rating_w,
                  nameplate_w,
                }
              : null,
          }
        })

      strings.sort((a, b) => a.string_number - b.string_number)

      // Best string kWh for peer comparison
      const bestKwh = strings.length > 0
        ? Math.max(...strings.map(s => s.energy_kwh))
        : 0

      const nativeKwhToday = nativeByDevice.get(device.id) ?? null

      return {
        device_id: device.id,
        device_name: device.device_name,
        strings,
        avg_current: Math.round(displayAvg * 1000) / 1000,
        active_avg_current: Math.round(displayAvg * 1000) / 1000,
        best_string_kwh: bestKwh,
        native_kwh_today: nativeKwhToday && nativeKwhToday > 0 ? nativeKwhToday : null,
      }
    })

    return NextResponse.json({ devices: deviceStrings })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plant Strings GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
