import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

// 5-state classification per IEC 62446 + industry best practices
type StringStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'DISCONNECTED'

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

    const deviceStrings = await Promise.all(
      devices.map(async (device) => {
        const latestMeasurements = await prisma.string_measurements.findMany({
          where: { device_id: device.id },
          orderBy: { timestamp: 'desc' },
          take: 100,
          distinct: ['string_number'],
        })

        // Average includes ALL strings (not just active) — per IEC 61724 research
        const totalCount = latestMeasurements.length
        const totalCurrent = latestMeasurements.reduce((sum, m) => sum + Number(m.current), 0)
        const avgCurrent = totalCount > 0 ? totalCurrent / totalCount : 0

        // Also compute active-only average for gap comparison against peers
        const activeStrings = latestMeasurements.filter((m) => Number(m.current) > 0.1)
        const activeAvg = activeStrings.length > 0
          ? activeStrings.reduce((sum, m) => sum + Number(m.current), 0) / activeStrings.length
          : 0

        const strings = latestMeasurements.map((m) => {
          const current = Number(m.current)
          const voltage = Number(m.voltage)

          // 5-state classification using voltage + current
          let status: StringStatus
          let gapPercent = 0

          if (current > 0.1) {
            // String is producing — compare to active peers
            gapPercent = activeAvg > 0
              ? ((activeAvg - current) / activeAvg) * 100
              : 0

            if (gapPercent > 50) status = 'CRITICAL'
            else if (gapPercent > 10) status = 'WARNING'
            else status = 'NORMAL'
          } else if (voltage > 0) {
            // Voltage present but no current = OPEN CIRCUIT (wiring fault)
            status = 'OPEN_CIRCUIT'
            gapPercent = 100
          } else {
            // No voltage, no current = DISCONNECTED (total loss)
            status = 'DISCONNECTED'
            gapPercent = 100
          }

          return {
            string_number: m.string_number,
            voltage,
            current,
            power: Number(m.power),
            gap_percent: Math.round(gapPercent * 10) / 10,
            status,
          }
        })

        strings.sort((a, b) => a.string_number - b.string_number)

        return {
          device_id: device.id,
          device_name: device.device_name,
          strings,
          avg_current: Math.round(avgCurrent * 1000) / 1000,
          active_avg_current: Math.round(activeAvg * 1000) / 1000,
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
