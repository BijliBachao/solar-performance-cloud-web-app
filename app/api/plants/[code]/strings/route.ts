import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

type StringStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'DISCONNECTED'

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

        // Detect staleness: if a string's latest measurement is >15 min older
        // than the freshest on this device, it's no longer reporting
        const STALE_THRESHOLD_MS = 15 * 60 * 1000
        const freshestTs = latestMeasurements.length > 0
          ? Math.max(...latestMeasurements.map(m => m.timestamp.getTime()))
          : 0
        const isStale = (ts: Date) => freshestTs > 0 && (freshestTs - ts.getTime()) > STALE_THRESHOLD_MS

        // Averages — only from fresh measurements
        const freshMeasurements = latestMeasurements.filter(m => !isStale(m.timestamp))
        const totalCount = freshMeasurements.length
        const totalCurrent = freshMeasurements.reduce((sum, m) => sum + Number(m.current), 0)
        const avgCurrent = totalCount > 0 ? totalCurrent / totalCount : 0

        const activeStrings = freshMeasurements.filter((m) => Number(m.current) > 0.1)
        const activeAvg = activeStrings.length > 0
          ? activeStrings.reduce((sum, m) => sum + Number(m.current), 0) / activeStrings.length
          : 0

        // Build string data with kWh
        const strings = latestMeasurements.map((m) => {
          const current = Number(m.current)
          const voltage = Number(m.voltage)
          const stale = isStale(m.timestamp)

          let status: StringStatus
          let gapPercent = 0

          if (stale) {
            // String stopped reporting — treat as disconnected
            status = 'DISCONNECTED'
            gapPercent = 100
          } else if (current > 0.1) {
            gapPercent = activeAvg > 0 ? ((activeAvg - current) / activeAvg) * 100 : 0
            if (gapPercent > 50) status = 'CRITICAL'
            else if (gapPercent > 10) status = 'WARNING'
            else status = 'NORMAL'
          } else if (voltage > 0) {
            status = 'OPEN_CIRCUIT'
            gapPercent = 100
          } else {
            status = 'DISCONNECTED'
            gapPercent = 100
          }

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

        return {
          device_id: device.id,
          device_name: device.device_name,
          strings,
          avg_current: Math.round(avgCurrent * 1000) / 1000,
          active_avg_current: Math.round(activeAvg * 1000) / 1000,
          best_string_kwh: bestKwh,
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
