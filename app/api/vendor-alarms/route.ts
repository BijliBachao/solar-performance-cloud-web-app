import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    if (userContext.role !== 'SUPER_ADMIN') requireOrganization(userContext)

    const sp = request.nextUrl.searchParams
    const plantId  = sp.get('plant_id') || ''
    const deviceId = sp.get('device_id') || ''
    const provider = sp.get('provider') || ''
    const severity = sp.get('severity') || ''
    const resolved = sp.get('resolved') || 'false'
    const page  = Math.max(1, parseInt(sp.get('page')  || '1'))
    const limit = Math.min(100, parseInt(sp.get('limit') || '20'))
    const skip  = (page - 1) * limit

    // Resolve accessible plant IDs
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

    const where: any = { ...plantWhere }
    if (deviceId) where.device_id = deviceId
    if (provider) where.provider = provider
    if (severity) where.severity = severity
    if (resolved === 'false') where.resolved_at = null
    else if (resolved === 'true') where.resolved_at = { not: null }

    const [alarms, total] = await Promise.all([
      prisma.vendor_alarms.findMany({
        where,
        orderBy: { started_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.vendor_alarms.count({ where }),
    ])

    // Enrich with device_name and plant_name
    const deviceIds = [...new Set(alarms.map(a => a.device_id))]
    const devices = deviceIds.length > 0
      ? await prisma.devices.findMany({ where: { id: { in: deviceIds } }, select: { id: true, device_name: true } })
      : []
    const deviceNameMap = new Map(devices.map(d => [d.id, d.device_name || d.id]))

    const plantIds = [...new Set(alarms.map(a => a.plant_id))]
    const plants = plantIds.length > 0
      ? await prisma.plants.findMany({ where: { id: { in: plantIds } }, select: { id: true, plant_name: true } })
      : []
    const plantNameMap = new Map(plants.map(p => [p.id, p.plant_name]))

    const enriched = alarms.map(a => ({
      id: a.id,
      device_id: a.device_id,
      device_name: deviceNameMap.get(a.device_id) || a.device_id,
      plant_id: a.plant_id,
      plant_name: plantNameMap.get(a.plant_id) || a.plant_id,
      provider: a.provider,
      alarm_code: a.alarm_code,
      severity: a.severity,
      message: a.message,
      advice: a.advice,
      started_at: a.started_at,
      resolved_at: a.resolved_at,
      created_at: a.created_at,
    }))

    return NextResponse.json({
      alarms: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Vendor Alarms GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
