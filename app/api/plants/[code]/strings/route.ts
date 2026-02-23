import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()

    // SUPER_ADMIN can access any plant; org users need assignment check
    if (userContext.role !== 'SUPER_ADMIN') {
      requireOrganization(userContext)
      const assignment = await prisma.plant_assignments.findFirst({
        where: {
          plant_id: params.code,
          organization_id: userContext.organizationId!,
        },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const devices = await prisma.devices.findMany({
      where: { plant_id: params.code, device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } },
      select: { id: true, device_name: true, max_strings: true },
    })

    const deviceStrings = await Promise.all(
      devices.map(async (device) => {
        const maxStrings = device.max_strings || 24

        // Get latest measurement per string
        const latestMeasurements = await prisma.string_measurements.findMany({
          where: { device_id: device.id },
          orderBy: { timestamp: 'desc' },
          take: maxStrings * 2, // Get enough to cover all strings
          distinct: ['string_number'],
        })

        // Calculate average current for gap comparison
        const activeStrings = latestMeasurements.filter(
          (m) => Number(m.current) > 0.1
        )
        const avgCurrent =
          activeStrings.length > 0
            ? activeStrings.reduce((sum, m) => sum + Number(m.current), 0) /
              activeStrings.length
            : 0

        // Return ALL strings; mark inactive ones as OFFLINE
        const strings = latestMeasurements.map((m) => {
          const current = Number(m.current)
          const voltage = Number(m.voltage)
          const isActive = current > 0.1

          // Gap is only meaningful for active strings
          const gapPercent = isActive && avgCurrent > 0
            ? ((avgCurrent - current) / avgCurrent) * 100
            : 0

          let status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE' = 'OK'
          if (!isActive) {
            status = 'OFFLINE'
          } else if (gapPercent > 50) {
            status = 'CRITICAL'
          } else if (gapPercent > 25) {
            status = 'WARNING'
          }

          return {
            string_number: m.string_number,
            voltage,
            current,
            power: Number(m.power),
            gap_percent: isActive ? Math.round(gapPercent * 10) / 10 : 0,
            status,
          }
        })

        strings.sort((a, b) => a.string_number - b.string_number)

        return {
          device_id: device.id,
          device_name: device.device_name,
          strings,
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
