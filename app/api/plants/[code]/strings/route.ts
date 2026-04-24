import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import {
  isStale, classifyRealtime, leaveOneOutAvg, activeAvg,
  type StringStatus, type StringReading,
} from '@/lib/string-health'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const devices = await prisma.devices.findMany({
      where: { plant_id: params.code, device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } },
      select: { id: true, device_name: true, max_strings: true },
    })

    const todayStart = getTodayStart()

    // Native daily kWh per device from hardware counter
    const todayDate = new Date(Date.UTC(
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCFullYear(),
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCMonth(),
      new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCDate(),
    ))
    const nativeDailyRows = await prisma.device_daily.findMany({
      where: { device_id: { in: devices.map(d => d.id) }, date: todayDate },
      select: { device_id: true, native_kwh: true },
    })
    const nativeByDevice = new Map(
      nativeDailyRows.map(r => [r.device_id, Number(r.native_kwh || 0)])
    )

    const deviceStrings = await Promise.all(
      devices.map(async (device) => {
        // Latest measurement per string (for real-time status)
        const latestMeasurements = await prisma.string_measurements.findMany({
          where: { device_id: device.id },
          orderBy: { timestamp: 'desc' },
          take: 100,
          distinct: ['string_number'],
        })

        // Today's measurements per string (for energy calculation)
        const todayMeasurements = await prisma.string_measurements.findMany({
          where: { device_id: device.id, timestamp: { gte: todayStart } },
          select: { string_number: true, power: true, timestamp: true },
          orderBy: { timestamp: 'asc' },
        })

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

        // Build fresh readings for average calculation (exclude stale)
        const freshReadings: StringReading[] = latestMeasurements
          .filter(m => !isStale(m.timestamp.getTime(), freshestTs))
          .map(m => ({ string_number: m.string_number, current: Number(m.current), voltage: Number(m.voltage) }))

        // Display average (active strings, self-inclusive — for KPI pill)
        const displayAvg = activeAvg(freshReadings)

        // Build string data with kWh
        const strings = latestMeasurements.map((m) => {
          const current = Number(m.current)
          const voltage = Number(m.voltage)
          const stale = isStale(m.timestamp.getTime(), freshestTs)

          // Leave-one-out peer average for fair comparison
          const peerAvg = stale ? null : leaveOneOutAvg(freshReadings, m.string_number)
          const { status, gapPercent } = classifyRealtime(current, voltage, peerAvg, stale)

          // Trapezoidal kWh for this string today
          const stringTodayData = todayByString.get(m.string_number) || []
          const kwh = trapezoidalKwh(stringTodayData)

          return {
            string_number: m.string_number,
            voltage,
            current,
            power: Number(m.power),
            gap_percent: Math.round(gapPercent * 10) / 10,
            status,
            energy_kwh: Math.round(kwh * 1000) / 1000,
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
    )

    return NextResponse.json({ devices: deviceStrings })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plant Strings GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
