import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { type PlantOpStatus } from '@/lib/string-health'
import { loadPlantOpStatuses } from '@/lib/donut-data-loader'

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
        devices: { select: { id: true } },  // need device IDs to compute last reading per plant
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
    const allDeviceIds = plants.flatMap(p => p.devices.map(d => d.id))
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0))
    // Active strings = distinct (device, string) producing in the last 14 days.
    // string_daily already excludes admin-flagged-unused ports, so this is the
    // count of real, monitored strings per plant.
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [unresolvedByPlant, todayByPlant, lastReadingByDevice, activeStrings, opStatusByPlant] = await Promise.all([
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
      // MAX(timestamp) per device — folded into per-plant max below.
      // Bounded to last 7 days so the query hits the recent partition only;
      // a plant whose freshest reading is older than that is "offline" from
      // the dashboard's perspective anyway. Index: (device_id, timestamp DESC).
      allDeviceIds.length === 0
        ? Promise.resolve([] as Array<{ device_id: string; _max: { timestamp: Date | null } }>)
        : prisma.string_measurements.groupBy({
            by: ['device_id'],
            where: {
              device_id: { in: allDeviceIds },
              timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
            _max: { timestamp: true },
          }),
      plantIds.length === 0
        ? Promise.resolve([] as Array<{ plant_id: string }>)
        : prisma.string_daily.groupBy({
            by: ['plant_id', 'device_id', 'string_number'],
            where: { plant_id: { in: plantIds }, date: { gte: fourteenDaysAgo } },
          }),
      // Status Unification: ONE plant status from the connectivity engine
      // (sun-aware, gate-aware, coord-clamped) — replaces both the vendor
      // health_state counts AND the page's old sun-blind reading-age recipe.
      loadPlantOpStatuses(),
    ])

    // One groupBy row per distinct (plant, device, string) → tally per plant.
    const stringCountByPlant = new Map<string, number>()
    for (const r of activeStrings) {
      stringCountByPlant.set(r.plant_id, (stringCountByPlant.get(r.plant_id) ?? 0) + 1)
    }

    // Per-device latest timestamp → per-plant max via the plants→devices map.
    const lastReadingByDeviceMap = new Map<string, Date>()
    for (const row of lastReadingByDevice) {
      if (row._max.timestamp) lastReadingByDeviceMap.set(row.device_id, row._max.timestamp)
    }
    const lastReadingByPlant = new Map<string, Date>()
    for (const p of plants) {
      let maxTs: Date | null = null
      for (const d of p.devices) {
        const ts = lastReadingByDeviceMap.get(d.id)
        if (ts && (!maxTs || ts > maxTs)) maxTs = ts
      }
      if (maxTs) lastReadingByPlant.set(p.id, maxTs)
    }

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

    const formatted = plants.map((p) => {
      const { devices: _devices, ...rest } = p  // strip device-id list, only used for lastReading rollup
      return {
        ...rest,
        assigned_org: p.plant_assignments[0]?.organizations || null,
        device_count: p._count.devices,
        string_count: stringCountByPlant.get(p.id) ?? 0,
        alerts_today: todayMap.get(p.id) || emptyAlerts,
        alerts_unresolved: unresolvedMap.get(p.id) || emptyAlerts,
        last_reading_at: lastReadingByPlant.get(p.id)?.toISOString() ?? null,
        // The unified status — the ONLY status word any screen should render.
        op_status: (opStatusByPlant.get(p.id) ?? 'offline') as PlantOpStatus,
      }
    })

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

    // Stats counted from the SAME set the table renders (`filtered`, incl.
    // the ASSIGNED/UNASSIGNED filter) and from the UNIFIED op_status field —
    // the header and the rows below it agree by construction.
    const countOp = (s: PlantOpStatus) => filtered.filter(p => p.op_status === s).length
    const stats = {
      total: filtered.length,
      assigned: filtered.filter(p => p.assigned_org !== null).length,
      unassigned: filtered.filter(p => p.assigned_org === null).length,
      live: countOp('live'),
      idle: countOp('idle'),
      frozen: countOp('frozen'),
      offline: countOp('offline'),
      faulty: countOp('faulty'),
      plants_with_alerts: filtered.filter(p => p.alerts_unresolved.total > 0).length,
    }

    return NextResponse.json({ plants: filtered, stats, providers })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Plants GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
