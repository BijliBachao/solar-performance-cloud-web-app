import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const plant = await prisma.plants.findUnique({
      where: { id: params.code },
      include: {
        devices: {
          select: {
            id: true,
            device_name: true,
            device_type_id: true,
            model: true,
            max_strings: true,
            last_synced: true,
          },
        },
      },
    })

    if (!plant) {
      return NextResponse.json({ error: 'Plant not found' }, { status: 404 })
    }

    // Most recent string measurement timestamp (updated every ~5 min by poller)
    const latestMeasurement = await prisma.string_measurements.findFirst({
      where: { plant_id: params.code },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    })

    return NextResponse.json({
      ...plant,
      last_data_at: latestMeasurement?.timestamp || null,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plant Detail GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
