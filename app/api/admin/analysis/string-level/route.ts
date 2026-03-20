import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const plantId = searchParams.get('plant_id')
    const deviceId = searchParams.get('device_id')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    // Max 45 days
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 45 || diffDays < 0) {
      return NextResponse.json({ error: 'Date range must be 1-45 days' }, { status: 400 })
    }

    // Build device filter
    const deviceWhere: any = {
      device_type_id: { in: INVERTER_DEVICE_TYPE_IDS },
    }
    if (plantId) deviceWhere.plant_id = plantId
    if (deviceId) deviceWhere.id = deviceId

    // Get devices with plant info
    const devices = await prisma.devices.findMany({
      where: deviceWhere,
      include: {
        plants: { select: { id: true, plant_name: true, capacity_kw: true } },
      },
      orderBy: [{ plant_id: 'asc' }, { device_name: 'asc' }],
    })

    if (devices.length === 0) {
      return NextResponse.json({ dates: [], rows: [], summary: { total_strings: 0, healthy: 0, warning: 0, critical: 0, offline: 0 } })
    }

    const deviceIds = devices.map(d => d.id)

    // Compute kW per string for each plant
    const plantStringCounts = new Map<string, number>()
    const plantCapacities = new Map<string, number>()
    for (const d of devices) {
      const pid = d.plant_id
      plantCapacities.set(pid, Number(d.plants.capacity_kw) || 0)
      plantStringCounts.set(pid, (plantStringCounts.get(pid) || 0) + (d.max_strings || 0))
    }

    // Query string_daily
    const dailyData = await prisma.string_daily.findMany({
      where: {
        device_id: { in: deviceIds },
        date: { gte: fromDate, lte: toDate },
      },
      select: {
        device_id: true,
        plant_id: true,
        string_number: true,
        date: true,
        health_score: true,
        avg_current: true,
        avg_power: true,
      },
      orderBy: [{ device_id: 'asc' }, { string_number: 'asc' }, { date: 'asc' }],
    })

    // Build date list
    const dates: string[] = []
    const d = new Date(fromDate)
    while (d <= toDate) {
      dates.push(d.toISOString().split('T')[0])
      d.setDate(d.getDate() + 1)
    }

    // Index daily data: "deviceId:stringNumber:date" -> health_score
    const scoreMap = new Map<string, number | null>()
    for (const row of dailyData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      const key = `${row.device_id}:${row.string_number}:${dateStr}`
      scoreMap.set(key, row.health_score ? Number(row.health_score) : null)
    }

    // Find unique device+string combos that have any data
    const stringSet = new Set<string>()
    for (const row of dailyData) {
      stringSet.add(`${row.device_id}:${row.string_number}`)
    }
    // Also include strings from max_strings even if no data yet
    for (const d of devices) {
      if (d.max_strings) {
        for (let s = 1; s <= d.max_strings; s++) {
          stringSet.add(`${d.id}:${s}`)
        }
      }
    }

    // Build device lookup
    const deviceMap = new Map(devices.map(d => [d.id, d]))

    // Build rows
    const rows: any[] = []
    const sortedStrings = Array.from(stringSet).sort((a, b) => {
      const [aDevice, aStr] = a.split(':')
      const [bDevice, bStr] = b.split(':')
      const aD = deviceMap.get(aDevice)
      const bD = deviceMap.get(bDevice)
      const plantCmp = (aD?.plants.plant_name || '').localeCompare(bD?.plants.plant_name || '')
      if (plantCmp !== 0) return plantCmp
      const devCmp = (aD?.device_name || '').localeCompare(bD?.device_name || '')
      if (devCmp !== 0) return devCmp
      return Number(aStr) - Number(bStr)
    })

    for (const key of sortedStrings) {
      const [devId, strNum] = key.split(':')
      const device = deviceMap.get(devId)
      if (!device) continue

      const plantCap = plantCapacities.get(device.plant_id) || 0
      const plantStrings = plantStringCounts.get(device.plant_id) || 0
      const kwPerString = plantStrings > 0 && plantCap > 0
        ? Math.round((plantCap / plantStrings) * 100) / 100
        : null

      const scores: Record<string, number | null> = {}
      for (const date of dates) {
        const scoreKey = `${devId}:${strNum}:${date}`
        scores[date] = scoreMap.has(scoreKey) ? scoreMap.get(scoreKey)! : null
      }

      rows.push({
        plant_id: device.plant_id,
        plant_name: device.plants.plant_name,
        device_id: devId,
        device_name: device.device_name || devId,
        string_number: Number(strNum),
        mppt: Math.ceil(Number(strNum) / 2),
        kw_per_string: kwPerString,
        scores,
      })
    }

    // Summary from latest date with data
    let healthy = 0, warning = 0, critical = 0, offline = 0
    const latestDate = dates[dates.length - 1]
    for (const row of rows) {
      const score = row.scores[latestDate]
      if (score === null || score === undefined) { offline++; continue }
      if (score >= 90) healthy++
      else if (score >= 50) warning++
      else critical++
    }

    return NextResponse.json({
      dates,
      rows,
      summary: {
        total_strings: rows.length,
        healthy,
        warning,
        critical,
        offline,
      },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Analysis String-Level]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
