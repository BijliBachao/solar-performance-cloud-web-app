import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    // 1. Auth — require org membership (deny by default)
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    // 2. Security boundary — get ONLY this org's assigned plant IDs
    const assignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      select: { plant_id: true },
    })
    const allowedPlantIds = assignments.map(a => a.plant_id)

    if (allowedPlantIds.length === 0) {
      return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, unused_strings: 0 } })
    }

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

    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 45 || diffDays < 0) {
      return NextResponse.json({ error: 'Date range must be 1-45 days' }, { status: 400 })
    }

    // 3. Validate plant_id against allowed list (404 — no information leakage)
    if (plantId && !allowedPlantIds.includes(plantId)) {
      return NextResponse.json({ error: 'Plant not found' }, { status: 404 })
    }

    // 4. ALWAYS scope device query to allowed plants — even if device_id is passed
    const deviceWhere: any = {
      plant_id: { in: plantId ? [plantId] : allowedPlantIds },
      device_type_id: { in: INVERTER_DEVICE_TYPE_IDS },
    }
    if (deviceId) deviceWhere.id = deviceId

    const devices = await prisma.devices.findMany({
      where: deviceWhere,
      include: {
        plants: { select: { id: true, plant_name: true, capacity_kw: true } },
      },
      orderBy: [{ plant_id: 'asc' }, { device_name: 'asc' }],
    })

    if (devices.length === 0) {
      return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, unused_strings: 0 } })
    }

    const deviceIds = devices.map(d => d.id)
    const deviceMap = new Map(devices.map(d => [d.id, d]))

    // Detect historically active strings (any data in last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const activeStringRecords = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: {
        device_id: { in: deviceIds },
        date: { gte: ninetyDaysAgo },
      },
    })

    const activeStringSet = new Set<string>()
    for (const rec of activeStringRecords) {
      activeStringSet.add(`${rec.device_id}:${rec.string_number}`)
    }

    // Build unused set: in 1..max_strings but NOT active
    const unusedStringSet = new Set<string>()
    for (const d of devices) {
      if (d.max_strings) {
        for (let s = 1; s <= d.max_strings; s++) {
          const key = `${d.id}:${s}`
          if (!activeStringSet.has(key)) {
            unusedStringSet.add(key)
          }
        }
      }
    }

    // Compute kW per string using ACTIVE string count
    const plantCapacities = new Map<string, number>()
    for (const d of devices) {
      plantCapacities.set(d.plant_id, Number(d.plants?.capacity_kw) || 0)
    }

    const plantActiveStringCounts = new Map<string, number>()
    for (const key of activeStringSet) {
      const [devId] = key.split(':')
      const dev = deviceMap.get(devId)
      if (dev) {
        const pid = dev.plant_id
        plantActiveStringCounts.set(pid, (plantActiveStringCounts.get(pid) || 0) + 1)
      }
    }

    // Query string_daily for selected date range
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

    // Index scores
    const scoreMap = new Map<string, number | null>()
    for (const row of dailyData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      scoreMap.set(`${row.device_id}:${row.string_number}:${dateStr}`, row.health_score ? Number(row.health_score) : null)
    }

    // Active strings: from dailyData + 90-day active set
    const stringSet = new Set<string>()
    for (const row of dailyData) {
      stringSet.add(`${row.device_id}:${row.string_number}`)
    }
    for (const key of activeStringSet) {
      stringSet.add(key)
    }

    // Sort helper
    const sortByPlantDeviceString = (a: string, b: string) => {
      const [aDevice, aStr] = a.split(':')
      const [bDevice, bStr] = b.split(':')
      const aD = deviceMap.get(aDevice)
      const bD = deviceMap.get(bDevice)
      const plantCmp = (aD?.plants?.plant_name || '').localeCompare(bD?.plants?.plant_name || '')
      if (plantCmp !== 0) return plantCmp
      const devCmp = (aD?.device_name || '').localeCompare(bD?.device_name || '')
      if (devCmp !== 0) return devCmp
      return Number(aStr) - Number(bStr)
    }

    // Build active rows
    const rows: any[] = []
    for (const key of Array.from(stringSet).sort(sortByPlantDeviceString)) {
      const [devId, strNum] = key.split(':')
      const device = deviceMap.get(devId)
      if (!device) continue

      const plantCap = plantCapacities.get(device.plant_id) || 0
      const plantStrings = plantActiveStringCounts.get(device.plant_id) || 0
      const kwPerString = plantStrings > 0 && plantCap > 0
        ? Math.round((plantCap / plantStrings) * 100) / 100
        : null

      const scores: Record<string, number | null> = {}
      for (const date of dates) {
        scores[date] = scoreMap.get(`${devId}:${strNum}:${date}`) ?? null
      }

      rows.push({
        plant_id: device.plant_id,
        plant_name: device.plants?.plant_name || 'Unknown',
        device_id: devId,
        device_name: device.device_name || devId,
        string_number: Number(strNum),
        mppt: Math.ceil(Number(strNum) / 2),
        kw_per_string: kwPerString,
        scores,
        type: 'active',
      })
    }

    // Build unused rows
    for (const key of Array.from(unusedStringSet).sort(sortByPlantDeviceString)) {
      const [devId, strNum] = key.split(':')
      const device = deviceMap.get(devId)
      if (!device) continue

      rows.push({
        plant_id: device.plant_id,
        plant_name: device.plants?.plant_name || 'Unknown',
        device_id: devId,
        device_name: device.device_name || devId,
        string_number: Number(strNum),
        mppt: Math.ceil(Number(strNum) / 2),
        kw_per_string: null,
        scores: {},
        type: 'unused',
      })
    }

    // Summary — active strings only
    let healthy = 0, warning = 0, critical = 0, noData = 0
    const latestDate = dates[dates.length - 1]
    const activeRows = rows.filter(r => r.type === 'active')
    for (const row of activeRows) {
      const score = row.scores[latestDate]
      if (score === null || score === undefined) { noData++; continue }
      if (score >= 90) healthy++
      else if (score >= 50) warning++
      else critical++
    }

    return NextResponse.json({
      dates,
      rows,
      summary: {
        active_strings: activeRows.length,
        healthy,
        warning,
        critical,
        no_data: noData,
        unused_strings: rows.filter(r => r.type === 'unused').length,
      },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Dashboard Analysis String-Level]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
