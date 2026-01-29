import { NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const [totalPlants, totalDevices, totalOrganizations, totalUsers, pendingUsers, criticalAlerts, warningAlerts, infoAlerts, plantHealth, recentAlerts] = await Promise.all([
      prisma.plants.count(),
      prisma.devices.count(),
      prisma.organizations.count({ where: { status: 'ACTIVE' } }),
      prisma.users.count(),
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
    ])

    const healthMap = { healthy: 0, faulty: 0, disconnected: 0 }
    for (const h of plantHealth) {
      if (h.health_state === 3) healthMap.healthy = h._count.id
      else if (h.health_state === 2) healthMap.faulty = h._count.id
      else if (h.health_state === 1) healthMap.disconnected = h._count.id
    }

    return NextResponse.json({
      stats: {
        totalPlants,
        totalDevices,
        totalOrganizations,
        totalUsers,
        pendingUsers,
        activeAlerts: { CRITICAL: criticalAlerts, WARNING: warningAlerts, INFO: infoAlerts },
      },
      plantHealth: healthMap,
      recentAlerts,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Dashboard]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
