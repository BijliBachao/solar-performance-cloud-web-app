import { NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

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
      plantHealth,
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
      prisma.plants.groupBy({ by: ['health_state'], _count: { id: true } }),
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

    const healthMap = { healthy: 0, faulty: 0, disconnected: 0 }
    for (const h of plantHealth) {
      if (h.health_state === 3) healthMap.healthy = h._count.id
      else if (h.health_state === 2) healthMap.faulty = h._count.id
      else healthMap.disconnected += h._count.id
    }

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
        activeAlerts: { CRITICAL: criticalAlerts, WARNING: warningAlerts, INFO: infoAlerts },
      },
      plantHealth: healthMap,
      plantsByOrganization,
      recentActivity,
      recentAlerts,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Dashboard]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
