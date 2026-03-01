import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || 'ALL'
    const provider = searchParams.get('provider') || 'ALL'

    const where: any = {}
    if (search) {
      where.plant_name = { contains: search, mode: 'insensitive' }
    }
    if (provider !== 'ALL') {
      where.provider = provider
    }

    const plants = await prisma.plants.findMany({
      where,
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

    const plantIds = plants.map(p => p.id)
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0))

    const [unresolvedByPlant, todayByPlant] = await Promise.all([
      prisma.alerts.groupBy({
        by: ['plant_id', 'severity'],
        where: { plant_id: { in: plantIds }, resolved_at: null },
        _count: { id: true },
      }),
      prisma.alerts.groupBy({
        by: ['plant_id', 'severity'],
        where: {
          plant_id: { in: plantIds },
          created_at: { gte: todayStart },
        },
        _count: { id: true },
      }),
    ])

    const buildAlertMap = (rows: typeof unresolvedByPlant) => {
      const map = new Map<string, { critical: number; warning: number; info: number; total: number }>()
      for (const row of rows) {
        if (!map.has(row.plant_id)) {
          map.set(row.plant_id, { critical: 0, warning: 0, info: 0, total: 0 })
        }
        const entry = map.get(row.plant_id)!
        const count = row._count.id
        entry.total += count
        if (row.severity === 'CRITICAL') entry.critical += count
        else if (row.severity === 'WARNING') entry.warning += count
        else entry.info += count
      }
      return map
    }

    const unresolvedMap = buildAlertMap(unresolvedByPlant)
    const todayMap = buildAlertMap(todayByPlant)
    const emptyAlerts = { critical: 0, warning: 0, info: 0, total: 0 }

    const formatted = plants.map((p) => ({
      ...p,
      assigned_org: p.plant_assignments[0]?.organizations || null,
      device_count: p._count.devices,
      alerts_today: todayMap.get(p.id) || emptyAlerts,
      alerts_unresolved: unresolvedMap.get(p.id) || emptyAlerts,
    }))

    // Filter by assignment status after formatting
    const filtered = status === 'ALL'
      ? formatted
      : status === 'ASSIGNED'
        ? formatted.filter(p => p.assigned_org !== null)
        : formatted.filter(p => p.assigned_org === null)

    // Provider counts (from search-filtered but before status/provider filter)
    const allForCounts = await prisma.plants.groupBy({
      by: ['provider'],
      ...(search ? { where: { plant_name: { contains: search, mode: 'insensitive' as const } } } : {}),
      _count: true,
    })
    const providers = allForCounts.map(g => ({ provider: g.provider, count: g._count }))

    // Stats from current filtered dataset
    const stats = {
      total: formatted.length,
      assigned: formatted.filter(p => p.assigned_org !== null).length,
      unassigned: formatted.filter(p => p.assigned_org === null).length,
      healthy: formatted.filter(p => p.health_state === 3).length,
      faulty: formatted.filter(p => p.health_state === 2).length,
      disconnected: formatted.filter(p => p.health_state !== 3 && p.health_state !== 2).length,
      plants_with_alerts: formatted.filter(p => p.alerts_unresolved.total > 0).length,
    }

    return NextResponse.json({ plants: filtered, stats, providers })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Plants GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
