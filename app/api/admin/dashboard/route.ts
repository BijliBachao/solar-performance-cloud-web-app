import { NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { loadFleetConnectivity, loadPlantOpStatuses, buildAttention } from '@/lib/donut-data-loader'

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const [
      totalPlants,
      totalDevices,
      activeOrgs,
      inactiveOrgs,
      totalUsers,
      activeUsers,
      pendingUsers,
      criticalAlerts,
      warningAlerts,
      infoAlerts,
      // ONE fleet scan feeds plant op_status, the inverter connectivity
      // split, AND the needs-attention ledger (same engine as the NOC).
      connectivity,
      alertPlants,
      recentAlerts,
      assignedPlants,
      plantsByOrg,
      recentUsers,
    ] = await Promise.all([
      prisma.plants.count(),
      prisma.devices.count(),
      prisma.organizations.count({ where: { status: 'ACTIVE' } }),
      prisma.organizations.count({ where: { status: { not: 'ACTIVE' } } }),
      prisma.users.count(),
      prisma.users.count({ where: { status: 'ACTIVE' } }),
      prisma.users.count({ where: { status: 'PENDING_ASSIGNMENT' } }),
      prisma.alerts.count({ where: { severity: 'CRITICAL', resolved_at: null } }),
      prisma.alerts.count({ where: { severity: 'WARNING', resolved_at: null } }),
      prisma.alerts.count({ where: { severity: 'INFO', resolved_at: null } }),
      loadFleetConnectivity(),
      // "154 alerts" alone over-alarms — "in N plants" is the actionable size.
      prisma.alerts.findMany({
        where: { resolved_at: null },
        select: { plant_id: true },
        distinct: ['plant_id'],
      }),
      prisma.alerts.findMany({
        where: { resolved_at: null },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      prisma.plant_assignments.count(),
      prisma.plant_assignments.groupBy({
        by: ['organization_id'],
        _count: { id: true },
      }),
      prisma.users.findMany({
        orderBy: { created_at: 'desc' },
        take: 8,
        select: {
          id: true, email: true, first_name: true, last_name: true,
          status: true, role: true, created_at: true,
          organizations: { select: { name: true } },
        },
      }),
    ])

    // Status Unification: plant status from the connectivity engine (same
    // op_status as /admin/plants + the NOC) — reusing the fleet scan above.
    const plantHealth = await loadPlantOpStatuses(connectivity)

    // Resolve plant names for the alert feed — a message without its plant is
    // not actionable from the dashboard.
    const alertPlantIds = [...new Set(recentAlerts.map(a => a.plant_id))]
    const alertPlantRows = alertPlantIds.length > 0
      ? await prisma.plants.findMany({
          where: { id: { in: alertPlantIds } },
          select: { id: true, plant_name: true },
        })
      : []
    const alertPlantName = Object.fromEntries(alertPlantRows.map(p => [p.id, p.plant_name]))

    // Resolve org names for plantsByOrg
    const orgIds = plantsByOrg.map(p => p.organization_id)
    const orgNames = orgIds.length > 0
      ? await prisma.organizations.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : []
    const orgNameMap = Object.fromEntries(orgNames.map(o => [o.id, o.name]))

    const plantsByOrganization = plantsByOrg.map(p => ({
      organization: orgNameMap[p.organization_id] || 'Unknown',
      plantCount: p._count.id,
    }))

    // Unified op_status counts — /admin home, /admin/plants header, and the
    // NOC now agree by construction (one engine, one taxonomy).
    const healthMap = { live: 0, idle: 0, frozen: 0, offline: 0, faulty: 0 }
    for (const s of plantHealth.values()) healthMap[s] += 1

    const recentActivity = recentUsers.map(u => ({
      type: u.status === 'PENDING_ASSIGNMENT' ? 'user_pending' : 'user_active',
      message: `${u.first_name || u.email.split('@')[0]} ${u.status === 'PENDING_ASSIGNMENT' ? 'signed up (pending)' : u.organizations?.name ? `assigned to ${u.organizations.name}` : 'activated'}`,
      timestamp: u.created_at,
      status: u.status,
    }))

    return NextResponse.json({
      stats: {
        totalPlants,
        totalDevices,
        organizations: { total: activeOrgs + inactiveOrgs, active: activeOrgs, inactive: inactiveOrgs },
        users: { total: totalUsers, active: activeUsers, pending: pendingUsers },
        plants: { total: totalPlants, assigned: assignedPlants, unassigned: totalPlants - assignedPlants },
        activeAlerts: {
          CRITICAL: criticalAlerts, WARNING: warningAlerts, INFO: infoAlerts,
          plantsAffected: alertPlants.length,
        },
      },
      plantHealth: healthMap,
      // Inverter-level truth (the NOC's unit) — plant tiles above are
      // worst-wins rollups, so both are shown with their own labels.
      connectivity: connectivity.counts,
      // Dark-feed ledger: frozen/offline devices grouped per plant, stalest
      // first — the morning field-call list, same engine as the NOC.
      needsAttention: buildAttention(connectivity, [], 6),
      plantsByOrganization,
      recentActivity,
      recentAlerts: recentAlerts.map(a => ({
        ...a,
        plant_name: alertPlantName[a.plant_id] ?? a.plant_id,
      })),
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Dashboard]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
