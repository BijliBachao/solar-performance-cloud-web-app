import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function getPKTDayStartUTC(): Date {
  const nowUTC = new Date()
  const pktMs = nowUTC.getTime() + 5 * 60 * 60 * 1000
  const pktDate = new Date(pktMs)
  pktDate.setUTCHours(0, 0, 0, 0)
  return new Date(pktDate.getTime() - 5 * 60 * 60 * 1000)
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    if (userContext.role !== 'SUPER_ADMIN') requireOrganization(userContext)

    const plantId = request.nextUrl.searchParams.get('plant_id') || ''

    let plantWhere: any = {}
    if (userContext.role === 'SUPER_ADMIN') {
      if (plantId) plantWhere = { plant_id: plantId }
    } else {
      const assignments = await prisma.plant_assignments.findMany({
        where: { organization_id: userContext.organizationId! },
        select: { plant_id: true },
      })
      const plantIds = assignments.map(a => a.plant_id)
      if (plantId) {
        if (!plantIds.includes(plantId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        plantWhere = { plant_id: plantId }
      } else {
        plantWhere = plantIds.length > 0 ? { plant_id: { in: plantIds } } : {}
      }
    }

    const todayStart = getPKTDayStartUTC()

    const [critical, warning, info, resolvedToday] = await Promise.all([
      prisma.alerts.count({ where: { ...plantWhere, severity: 'CRITICAL', resolved_at: null } }),
      prisma.alerts.count({ where: { ...plantWhere, severity: 'WARNING', resolved_at: null } }),
      prisma.alerts.count({ where: { ...plantWhere, severity: 'INFO', resolved_at: null } }),
      prisma.alerts.count({ where: { ...plantWhere, resolved_at: { gte: todayStart } } }),
    ])

    return NextResponse.json({
      active: { critical, warning, info, total: critical + warning + info },
      resolvedToday,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Alerts Summary]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
