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

    // Sort: open issues desc → assigned first → worst health first → capacity desc
    filtered.sort((a, b) => {
      // 1. Most unresolved alerts first
      const alertDiff = b.alerts_unresolved.total - a.alerts_unresolved.total
      if (alertDiff !== 0) return alertDiff
      // 2. Assigned orgs first
      const aAssigned = a.assigned_org ? 0 : 1
      const bAssigned = b.assigned_org ? 0 : 1
      if (aAssigned !== bAssigned) return aAssigned - bAssigned
      // 3. Worst health first (lower health_state = worse)
      const aHealth = a.health_state ?? 0
      const bHealth = b.health_state ?? 0
      if (aHealth !== bHealth) return aHealth - bHealth
      // 4. Higher capacity first
      return (Number(b.capacity_kw) || 0) - (Number(a.capacity_kw) || 0)
    })

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
