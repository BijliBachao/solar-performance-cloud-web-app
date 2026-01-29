import { NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    const plantAssignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      include: {
        plants: {
          include: {
            _count: { select: { devices: true } },
          },
        },
      },
    })

    const plantIds = plantAssignments.map((pa) => pa.plant_id)

    const [alertCounts, recentAlerts, dailyHealth] = await Promise.all([
      prisma.alerts.count({
        where: { plant_id: { in: plantIds }, resolved_at: null },
      }),
      prisma.alerts.findMany({
        where: { plant_id: { in: plantIds }, resolved_at: null },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      prisma.string_daily.findMany({
        where: {
          plant_id: { in: plantIds },
          date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        select: { health_score: true },
      }),
    ])

    // Calculate per-plant alert counts
    const plantAlertCounts = await prisma.alerts.groupBy({
      by: ['plant_id'],
      where: { plant_id: { in: plantIds }, resolved_at: null },
      _count: { id: true },
    })
    const alertCountMap = new Map(
      plantAlertCounts.map((a) => [a.plant_id, a._count.id])
    )

    const plants = plantAssignments.map((pa) => ({
      id: pa.plants.id,
      plant_name: pa.plants.plant_name,
      capacity_kw: pa.plants.capacity_kw,
      health_state: pa.plants.health_state,
      device_count: pa.plants._count.devices,
      alert_count: alertCountMap.get(pa.plant_id) || 0,
    }))

    const healthScores = dailyHealth
      .map((d) => Number(d.health_score))
      .filter((s) => s > 0)
    const avgStringHealth =
      healthScores.length > 0
        ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
        : 100

    const lastPlantSync = plantAssignments
      .map((pa) => pa.plants.last_synced)
      .filter(Boolean)
      .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0]

    return NextResponse.json({
      plants,
      stats: {
        totalPlants: plants.length,
        activeAlerts: alertCounts,
        avgStringHealth: Math.round(avgStringHealth * 10) / 10,
        lastUpdate: lastPlantSync?.toISOString() || null,
      },
      recentAlerts,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Dashboard Main]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
