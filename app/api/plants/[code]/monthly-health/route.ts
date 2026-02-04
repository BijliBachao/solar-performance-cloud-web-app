import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

interface Diagnosis {
  issue: string
  likely_cause: string
  action: string
  severity: 'critical' | 'warning' | 'info' | 'offline'
}

interface ShadingPattern {
  affected_hours: number[]  // e.g., [14, 15, 16] for 2-4 PM
  avg_drop_percent: number  // e.g., 25 means 25% below others at those hours
}

interface StringHealthData {
  string_number: number
  avg_current: number
  uptime_percent: number
  alert_count: number
  avg_health_score: number
  trend: 'stable' | 'improving' | 'declining' | 'offline'
  diagnosis: Diagnosis | null
  shading_pattern: ShadingPattern | null
}

// Detect shading patterns - string underperforms at specific hours
function detectShadingPattern(
  stringNumber: number,
  hourlyData: { string_number: number; hour: Date; avg_current: unknown }[]
): ShadingPattern | null {
  // Only analyze daylight hours (6 AM to 6 PM)
  const daylightHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

  // Group all hourly data by hour of day
  const hourlyByHour = new Map<number, { total: number; count: number; byString: Map<number, number[]> }>()

  for (const row of hourlyData) {
    const hourOfDay = new Date(row.hour).getHours()
    if (!daylightHours.includes(hourOfDay)) continue
    if (Number(row.avg_current || 0) < 0.1) continue // Skip inactive hours

    if (!hourlyByHour.has(hourOfDay)) {
      hourlyByHour.set(hourOfDay, { total: 0, count: 0, byString: new Map() })
    }
    const entry = hourlyByHour.get(hourOfDay)!
    entry.total += Number(row.avg_current || 0)
    entry.count++

    if (!entry.byString.has(row.string_number)) {
      entry.byString.set(row.string_number, [])
    }
    entry.byString.get(row.string_number)!.push(Number(row.avg_current || 0))
  }

  // For each hour, calculate average and compare this string
  const hourlyDrops: { hour: number; dropPercent: number }[] = []

  for (const [hourOfDay, data] of hourlyByHour) {
    if (data.count < 2) continue // Need data from multiple strings

    const overallAvg = data.total / data.count
    const stringCurrents = data.byString.get(stringNumber)
    if (!stringCurrents || stringCurrents.length === 0) continue

    const stringAvg = stringCurrents.reduce((a, b) => a + b, 0) / stringCurrents.length
    const dropPercent = ((overallAvg - stringAvg) / overallAvg) * 100

    // If this string is 15%+ below average at this hour
    if (dropPercent > 15) {
      hourlyDrops.push({ hour: hourOfDay, dropPercent })
    }
  }

  // If string underperforms at 2+ consecutive hours, it's likely shading
  if (hourlyDrops.length < 2) return null

  // Sort by hour and find consecutive patterns
  hourlyDrops.sort((a, b) => a.hour - b.hour)

  // Check for consecutive hours (shading pattern)
  const affectedHours: number[] = []
  let totalDrop = 0

  for (let i = 0; i < hourlyDrops.length; i++) {
    const curr = hourlyDrops[i]
    const next = hourlyDrops[i + 1]

    if (!affectedHours.includes(curr.hour)) {
      affectedHours.push(curr.hour)
      totalDrop += curr.dropPercent
    }

    // Check if next hour is consecutive
    if (next && next.hour === curr.hour + 1) {
      // Consecutive - continue pattern
    }
  }

  // Only report if 2+ hours affected
  if (affectedHours.length >= 2) {
    return {
      affected_hours: affectedHours,
      avg_drop_percent: Math.round(totalDrop / affectedHours.length)
    }
  }

  return null
}

function diagnoseString(
  avgCurrent: number,
  avgHealthScore: number,
  trend: 'stable' | 'improving' | 'declining' | 'offline',
  alertCount: number,
  hasHistoricalData: boolean
): Diagnosis | null {
  // Offline - near-zero current
  if (avgCurrent < 0.1) {
    // Only flag as issue if string had historical data (was previously working)
    if (hasHistoricalData) {
      return {
        issue: 'String offline',
        likely_cause: 'Disconnected or cable issue',
        action: 'Check physical connections',
        severity: 'offline'
      }
    }
    // No historical data = probably not connected, don't flag as issue
    return null
  }

  // Critical - below 50% health
  if (avgHealthScore < 50) {
    return {
      issue: 'Severe underperformance',
      likely_cause: 'Faulty panel or major shading',
      action: 'Immediate inspection needed',
      severity: 'critical'
    }
  }

  // Warning - below 75% health
  if (avgHealthScore < 75) {
    if (trend === 'declining') {
      return {
        issue: 'Gradual decline',
        likely_cause: 'Dirty panels or degradation',
        action: 'Schedule cleaning',
        severity: 'warning'
      }
    }
    if (alertCount > 5) {
      return {
        issue: 'Frequent issues',
        likely_cause: 'Intermittent connection or shading',
        action: 'Inspect connections and surroundings',
        severity: 'warning'
      }
    }
    return {
      issue: 'Underperforming',
      likely_cause: 'Partial shading or dust',
      action: 'Inspect and clean',
      severity: 'warning'
    }
  }

  // Info - below 90% health (slight underperformance)
  if (avgHealthScore < 90) {
    return {
      issue: 'Slight underperformance',
      likely_cause: 'Minor dust or normal variance',
      action: 'Monitor trend',
      severity: 'info'
    }
  }

  return null // Healthy (>= 90%)
}

function calculateTrend(
  dailyData: { date: Date; health_score: number | null }[]
): 'stable' | 'improving' | 'declining' | 'offline' {
  if (dailyData.length < 3) return 'stable'

  // Sort by date ascending
  const sorted = [...dailyData].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Compare first half average to second half average
  const midpoint = Math.floor(sorted.length / 2)
  const firstHalf = sorted.slice(0, midpoint)
  const secondHalf = sorted.slice(midpoint)

  const firstAvg = firstHalf.reduce((sum, d) => sum + (Number(d.health_score) || 0), 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((sum, d) => sum + (Number(d.health_score) || 0), 0) / secondHalf.length

  const diff = secondAvg - firstAvg

  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()

    // SUPER_ADMIN can access any plant; org users need assignment check
    if (userContext.role !== 'SUPER_ADMIN') {
      requireOrganization(userContext)
      const assignment = await prisma.plant_assignments.findFirst({
        where: {
          plant_id: params.code,
          organization_id: userContext.organizationId!,
        },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')
    const monthParam = searchParams.get('month') // Format: YYYY-MM

    if (!deviceId) {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 })
    }

    // Verify device belongs to plant
    const device = await prisma.devices.findFirst({
      where: { id: deviceId, plant_id: params.code }
    })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Calculate date range for the month
    const now = new Date()
    let monthStart: Date
    let monthEnd: Date

    if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number)
      monthStart = new Date(year, month - 1, 1)
      monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      monthEnd = now
    }

    // Run three queries in parallel
    const [dailyData, hourlyData, alertData] = await Promise.all([
      // 1. Get daily health data grouped by string
      prisma.string_daily.findMany({
        where: {
          device_id: deviceId,
          date: { gte: monthStart, lte: monthEnd }
        },
        select: {
          string_number: true,
          date: true,
          health_score: true,
          avg_current: true
        }
      }),

      // 2. Get hourly data for uptime calculation
      // Uptime = hours with current > 0.1 / expected daylight hours
      prisma.string_hourly.findMany({
        where: {
          device_id: deviceId,
          hour: { gte: monthStart, lte: monthEnd }
        },
        select: {
          string_number: true,
          hour: true,
          avg_current: true
        }
      }),

      // 3. Count alerts per string
      prisma.alerts.groupBy({
        by: ['string_number'],
        where: {
          device_id: deviceId,
          created_at: { gte: monthStart, lte: monthEnd }
        },
        _count: { id: true }
      })
    ])

    // Create maps for easier lookup
    const alertCountMap = new Map<number, number>()
    for (const alert of alertData) {
      alertCountMap.set(alert.string_number, alert._count.id)
    }

    // Group daily data by string
    const stringDailyMap = new Map<number, typeof dailyData>()
    for (const row of dailyData) {
      if (!stringDailyMap.has(row.string_number)) {
        stringDailyMap.set(row.string_number, [])
      }
      stringDailyMap.get(row.string_number)!.push(row)
    }

    // Calculate uptime per string
    // First, find all "daylight hours" - hours when ANY string had current > 0.1
    const daylightHours = new Set<string>()
    for (const row of hourlyData) {
      if (Number(row.avg_current) > 0.1) {
        // Use hour timestamp as key to identify unique daylight hours
        daylightHours.add(new Date(row.hour).toISOString())
      }
    }
    const totalDaylightHours = daylightHours.size

    // Now count active hours per string (only during daylight hours)
    const stringHourlyMap = new Map<number, { activeHours: number; totalHours: number }>()
    for (const row of hourlyData) {
      const hourKey = new Date(row.hour).toISOString()
      // Only count hours that are daylight hours (when at least one string was producing)
      if (!daylightHours.has(hourKey)) continue

      if (!stringHourlyMap.has(row.string_number)) {
        stringHourlyMap.set(row.string_number, { activeHours: 0, totalHours: 0 })
      }
      const entry = stringHourlyMap.get(row.string_number)!
      entry.totalHours++
      // Count hours where current > 0.1A as active
      if (Number(row.avg_current) > 0.1) {
        entry.activeHours++
      }
    }

    // Collect all unique string numbers
    const allStrings = new Set<number>()
    dailyData.forEach(d => allStrings.add(d.string_number))
    hourlyData.forEach(d => allStrings.add(d.string_number))
    alertData.forEach(d => allStrings.add(d.string_number))

    // If no data at all, try to get strings from device max_strings
    if (allStrings.size === 0 && device.max_strings) {
      for (let i = 1; i <= device.max_strings; i++) {
        allStrings.add(i)
      }
    }

    // Build result for each string first, then calculate inverter average from active strings
    const stringHealthData: StringHealthData[] = []

    for (const stringNum of Array.from(allStrings).sort((a, b) => a - b)) {
      const dailyRows = stringDailyMap.get(stringNum) || []
      const hourlyInfo = stringHourlyMap.get(stringNum)
      const alertCount = alertCountMap.get(stringNum) || 0

      // Calculate averages
      const avgCurrent = dailyRows.length > 0
        ? dailyRows.reduce((sum, r) => sum + Number(r.avg_current || 0), 0) / dailyRows.length
        : 0

      const rawHealthScore = dailyRows.length > 0
        ? dailyRows.reduce((sum, r) => sum + Number(r.health_score || 100), 0) / dailyRows.length
        : avgCurrent < 0.1 ? 0 : 100
      // Cap health score at 100
      const avgHealthScore = Math.min(100, rawHealthScore)

      // Calculate uptime - % of daylight hours this string was active
      const activeHours = hourlyInfo?.activeHours || 0
      const stringTotalHours = hourlyInfo?.totalHours || 0
      // Use string's total hours if available, otherwise use global daylight hours
      const expectedHours = stringTotalHours > 0 ? stringTotalHours : totalDaylightHours
      const uptimePercent = expectedHours > 0
        ? Math.min(100, (activeHours / expectedHours) * 100)
        : 0

      // Determine trend
      const trend = avgCurrent < 0.1
        ? 'offline' as const
        : calculateTrend(dailyRows as { date: Date; health_score: number | null }[])

      // Check if string has historical data (was previously producing power)
      const hasHistoricalData = dailyRows.some(r => Number(r.avg_current || 0) > 0.1)

      // Detect shading patterns (drops at specific hours)
      const shadingPattern = avgCurrent >= 0.1
        ? detectShadingPattern(stringNum, hourlyData)
        : null

      // Generate diagnosis (consider shading)
      let diagnosis = diagnoseString(avgCurrent, avgHealthScore, trend, alertCount, hasHistoricalData)

      // Override diagnosis if shading pattern detected and no more severe issue
      if (shadingPattern && (!diagnosis || diagnosis.severity === 'info')) {
        const hours = shadingPattern.affected_hours
        const timeRange = hours.length > 1
          ? `${hours[0]}:00-${hours[hours.length - 1] + 1}:00`
          : `${hours[0]}:00`
        diagnosis = {
          issue: 'Possible shading',
          likely_cause: `Performance drops ${shadingPattern.avg_drop_percent}% at ${timeRange}`,
          action: 'Check for tree shadows or obstructions',
          severity: 'warning'
        }
      }

      stringHealthData.push({
        string_number: stringNum,
        avg_current: Math.round(avgCurrent * 100) / 100,
        uptime_percent: Math.round(uptimePercent * 10) / 10,
        alert_count: alertCount,
        avg_health_score: Math.round(avgHealthScore * 10) / 10,
        trend,
        diagnosis,
        shading_pattern: shadingPattern
      })
    }

    // Calculate inverter average from ACTIVE strings only (current >= 0.1A)
    const activeStrings = stringHealthData.filter(s => s.avg_current >= 0.1)
    const inverterAvgCurrent = activeStrings.length > 0
      ? activeStrings.reduce((sum, s) => sum + s.avg_current, 0) / activeStrings.length
      : 0

    // Calculate summary
    const summary = {
      healthy_strings: stringHealthData.filter(s => s.avg_health_score >= 75 && s.trend !== 'offline').length,
      warning_strings: stringHealthData.filter(s => s.avg_health_score >= 50 && s.avg_health_score < 75).length,
      critical_strings: stringHealthData.filter(s => s.avg_health_score > 0 && s.avg_health_score < 50).length,
      offline_strings: stringHealthData.filter(s => s.trend === 'offline' || s.avg_current < 0.1).length
    }

    // Format month string
    const monthStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

    return NextResponse.json({
      month: monthStr,
      device_id: deviceId,
      inverter_avg_current: Math.round(inverterAvgCurrent * 100) / 100,
      data: stringHealthData,
      summary
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Monthly Health GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
