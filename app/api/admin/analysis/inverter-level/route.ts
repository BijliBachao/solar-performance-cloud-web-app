import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import { MAX_DATE_RANGE_DAYS } from '@/lib/string-health'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const plantId = searchParams.get('plant_id')
    const organizationId = searchParams.get('organization_id')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    // Reject unparseable dates BEFORE the range check — NaN comparisons are
    // always false, so a malformed date would slip past the guard below.
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
    }

    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > MAX_DATE_RANGE_DAYS || diffDays < 0) {
      return NextResponse.json({ error: `Date range must be 1-${MAX_DATE_RANGE_DAYS} days` }, { status: 400 })
    }

    // Get devices
    const deviceWhere: any = {
      device_type_id: { in: INVERTER_DEVICE_TYPE_IDS },
    }
    if (plantId) deviceWhere.plant_id = plantId

    // Optional org scope — restrict to the plants assigned to this organization.
    if (organizationId) {
      const orgAssignments = await prisma.plant_assignments.findMany({
        where: { organization_id: organizationId },
        select: { plant_id: true },
      })
      const orgPlantIds = orgAssignments.map(a => a.plant_id)
      if (orgPlantIds.length === 0) {
        return NextResponse.json({ dates: [], rows: [], truncated: false })
      }
      deviceWhere.plant_id = plantId
        ? (orgPlantIds.includes(plantId) ? plantId : '__none__')
        : { in: orgPlantIds }
    }

    // The inverter overview is one row per inverter (bounded), but cap as a
    // backstop so an unscoped request can't grow unboundedly against the shared
    // RDS as the never-delete data moat expands. Fetch cap+1 to detect truncation.
    const MAX_INVERTERS = 500
    const devicesRaw = await prisma.devices.findMany({
      where: deviceWhere,
      include: {
        plants: { select: { id: true, plant_name: true, capacity_kw: true } },
      },
      orderBy: [{ plant_id: 'asc' }, { device_name: 'asc' }],
      take: MAX_INVERTERS + 1,
    })
    const truncated = devicesRaw.length > MAX_INVERTERS
    const devices = truncated ? devicesRaw.slice(0, MAX_INVERTERS) : devicesRaw
    if (truncated) {
      console.warn(`[Admin Analysis Inverter-Level] exceeded ${MAX_INVERTERS} inverters — truncated. Narrow by organization or plant.`)
    }

    if (devices.length === 0) {
      return NextResponse.json({ dates: [], rows: [] })
    }

    const deviceIds = devices.map(d => d.id)

    // Query string_daily grouped by device + date
    const dailyData = await prisma.string_daily.findMany({
      where: {
        device_id: { in: deviceIds },
        date: { gte: fromDate, lte: toDate },
      },
      select: {
        device_id: true,
        date: true,
        health_score: true,
      },
    })

    // Build date list
    const dates: string[] = []
    const d = new Date(fromDate)
    while (d <= toDate) {
      dates.push(d.toISOString().split('T')[0])
      d.setDate(d.getDate() + 1)
    }

    // Aggregate: average health_score per device per date
    const aggMap = new Map<string, number[]>() // "deviceId:date" -> [scores]
    for (const row of dailyData) {
      if (row.health_score === null) continue
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      const key = `${row.device_id}:${dateStr}`
      const arr = aggMap.get(key) || []
      arr.push(Number(row.health_score))
      aggMap.set(key, arr)
    }

    // Compute per-plant capacity per inverter
    // Simple: plant_capacity / number_of_inverters_in_plant
    const plantInverterCounts = new Map<string, number>()
    for (const dev of devices) {
      plantInverterCounts.set(dev.plant_id, (plantInverterCounts.get(dev.plant_id) || 0) + 1)
    }

    // Build rows
    const deviceMap = new Map(devices.map(dev => [dev.id, dev]))
    const rows: any[] = []

    for (const dev of devices) {
      const scores: Record<string, number | null> = {}
      for (const date of dates) {
        const key = `${dev.id}:${date}`
        const arr = aggMap.get(key)
        if (arr && arr.length > 0) {
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length
          scores[date] = Math.round(avg * 100) / 100
        } else {
          scores[date] = null
        }
      }

      const plantCap = Number(dev.plants?.capacity_kw) || 0
      const invCount = plantInverterCounts.get(dev.plant_id) || 1
      const kwPerInverter = plantCap > 0 ? Math.round((plantCap / invCount) * 100) / 100 : null

      rows.push({
        plant_id: dev.plant_id,
        plant_name: dev.plants?.plant_name || 'Unknown',
        device_id: dev.id,
        device_name: dev.device_name || dev.id,
        provider: dev.provider,
        model: dev.model,
        kw: kwPerInverter,
        scores,
      })
    }

    return NextResponse.json({ dates, rows, truncated })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Analysis Inverter-Level]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
