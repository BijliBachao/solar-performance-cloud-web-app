import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
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

    // Verify access — SUPER_ADMIN passes, ORG_USER checked via plant_assignments
    await requirePlantAccess(userContext, alert.plant_id)

    // Idempotent: re-resolving must NOT overwrite who first resolved it and
    // when — the audit trail of the original resolution is preserved.
    if (alert.resolved_at) {
      return NextResponse.json(alert)
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
