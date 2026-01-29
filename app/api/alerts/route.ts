import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    const searchParams = request.nextUrl.searchParams
    const severity = searchParams.get('severity')
    const plantId = searchParams.get('plant_id')
    const resolved = searchParams.get('resolved')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Get user's plant IDs
    let plantIds: string[]
    if (userContext.role === 'SUPER_ADMIN') {
      plantIds = plantId ? [plantId] : []
    } else {
      const assignments = await prisma.plant_assignments.findMany({
        where: { organization_id: userContext.organizationId! },
        select: { plant_id: true },
      })
      plantIds = assignments.map((a) => a.plant_id)
      if (plantId && !plantIds.includes(plantId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const where: any = {}
    if (plantIds.length > 0) {
      where.plant_id = plantId ? plantId : { in: plantIds }
    }
    if (severity) where.severity = severity
    if (resolved === 'true') where.resolved_at = { not: null }
    else if (resolved === 'false') where.resolved_at = null

    const [alerts, total] = await Promise.all([
      prisma.alerts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alerts.count({ where }),
    ])

    return NextResponse.json({
      alerts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Alerts GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
