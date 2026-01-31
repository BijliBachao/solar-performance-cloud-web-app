import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()

    const alertId = parseInt(params.id)
    if (isNaN(alertId)) {
      return NextResponse.json({ error: 'Invalid alert ID' }, { status: 400 })
    }

    const alert = await prisma.alerts.findUnique({
      where: { id: alertId },
    })

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    // Verify access - SUPER_ADMIN can resolve any alert
    if (userContext.role !== 'SUPER_ADMIN') {
      requireOrganization(userContext)
      const assignment = await prisma.plant_assignments.findFirst({
        where: {
          plant_id: alert.plant_id,
          organization_id: userContext.organizationId!,
        },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const updated = await prisma.alerts.update({
      where: { id: alertId },
      data: {
        resolved_at: new Date(),
        resolved_by: userContext.userId,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Alert PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
