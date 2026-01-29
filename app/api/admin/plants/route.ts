import { NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const plants = await prisma.plants.findMany({
      include: {
        plant_assignments: {
          include: {
            organizations: { select: { id: true, name: true } },
          },
        },
        _count: { select: { devices: true } },
      },
      orderBy: { plant_name: 'asc' },
    })

    const formatted = plants.map((p) => ({
      ...p,
      assigned_org: p.plant_assignments[0]?.organizations || null,
      device_count: p._count.devices,
    }))

    return NextResponse.json({ plants: formatted })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Plants GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
