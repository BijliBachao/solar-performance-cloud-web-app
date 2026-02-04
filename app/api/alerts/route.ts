import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()

    // SUPER_ADMIN can access any alerts; org users need org check
    if (userContext.role !== 'SUPER_ADMIN') {
      requireOrganization(userContext)
    }

    const searchParams = request.nextUrl.searchParams
    const severity = searchParams.get('severity')
    const plantId = searchParams.get('plant_id')
    const resolved = searchParams.get('resolved')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100) // Max 100
    const skip = (page - 1) * limit

    // New date range filters
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const stringNumber = searchParams.get('string_number')
    const deviceId = searchParams.get('device_id')

    // Validate date parameters
    if (fromParam && !isValidISODate(fromParam)) {
      return NextResponse.json(
        { error: 'Invalid date format for "from". Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)' },
        { status: 400 }
      )
    }
    if (toParam && !isValidISODate(toParam)) {
      return NextResponse.json(
        { error: 'Invalid date format for "to". Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)' },
        { status: 400 }
      )
    }
    if (fromParam && toParam) {
      const fromDate = new Date(fromParam)
      const toDate = new Date(toParam)
      if (fromDate > toDate) {
        return NextResponse.json(
          { error: 'Start date must be before end date' },
          { status: 400 }
        )
      }
    }

    // Validate string_number
    if (stringNumber && (isNaN(parseInt(stringNumber)) || parseInt(stringNumber) < 1)) {
      return NextResponse.json(
        { error: 'string_number must be a positive integer' },
        { status: 400 }
      )
    }

    // Validate pagination
    if (page < 1) {
      return NextResponse.json({ error: 'page must be a positive integer' }, { status: 400 })
    }

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
    // resolved === 'all' means no filter on resolved_at

    // Apply date range filter
    if (fromParam || toParam) {
      where.created_at = {}
      if (fromParam) where.created_at.gte = new Date(fromParam)
      if (toParam) where.created_at.lte = new Date(toParam)
    }

    // Apply string_number filter
    if (stringNumber) {
      where.string_number = parseInt(stringNumber)
    }

    // Apply device_id filter
    if (deviceId) {
      where.device_id = deviceId
    }

    // Get resolved_by user IDs to fetch names
    const [alerts, total] = await Promise.all([
      prisma.alerts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alerts.count({ where }),
    ])

    // Collect unique resolved_by user IDs
    const resolverIds = [...new Set(alerts.filter(a => a.resolved_by).map(a => a.resolved_by!))]

    // Fetch user names for resolvers
    let resolverNameMap: Map<string, string> = new Map()
    if (resolverIds.length > 0) {
      const users = await prisma.users.findMany({
        where: { id: { in: resolverIds } },
        select: { id: true, first_name: true, last_name: true, email: true }
      })
      for (const user of users) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
        resolverNameMap.set(user.id, name)
      }
    }

    // Fetch device names for all alerts
    const deviceIds = [...new Set(alerts.map(a => a.device_id))]
    let deviceNameMap: Map<string, string> = new Map()
    if (deviceIds.length > 0) {
      const devices = await prisma.devices.findMany({
        where: { id: { in: deviceIds } },
        select: { id: true, device_name: true }
      })
      for (const device of devices) {
        deviceNameMap.set(device.id, device.device_name || device.id)
      }
    }

    // Enhance alerts with resolver name and device name
    const enhancedAlerts = alerts.map(alert => ({
      ...alert,
      resolved_by_name: alert.resolved_by ? resolverNameMap.get(alert.resolved_by) || null : null,
      device_name: deviceNameMap.get(alert.device_id) || alert.device_id
    }))

    return NextResponse.json({
      alerts: enhancedAlerts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Alerts GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
