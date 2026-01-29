import { NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    const plantAssignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      include: {
        plants: {
          include: {
            _count: { select: { devices: true } },
          },
        },
      },
    })

    const plants = plantAssignments.map((pa) => ({
      id: pa.plants.id,
      plant_name: pa.plants.plant_name,
      capacity_kw: pa.plants.capacity_kw,
      address: pa.plants.address,
      latitude: pa.plants.latitude,
      longitude: pa.plants.longitude,
      health_state: pa.plants.health_state,
      last_synced: pa.plants.last_synced,
      device_count: pa.plants._count.devices,
    }))

    return NextResponse.json({ plants })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plants GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
