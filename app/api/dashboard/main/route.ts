import { NextResponse } from 'next/server'
import {
  getUserFromRequest,
  requireOrganization,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PLANT_HEALTH_HEALTHY, STALE_MS, MAX_STRING_CURRENT_A } from '@/lib/string-health'

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

function getPKTToday(): Date {
  const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
  return new Date(
    Date.UTC(nowPKT.getUTCFullYear(), nowPKT.getUTCMonth(), nowPKT.getUTCDate()),
  )
}

function getPKTDaysAgo(days: number): Date {
  const d = getPKTToday()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

function isoDateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    const plantAssignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      include: {
        plants: { include: { _count: { select: { devices: true } } } },
      },
    })
    const plantIds = plantAssignments.map((pa) => pa.plant_id)

    if (plantIds.length === 0) {
      return NextResponse.json({
        plants: [],
        stats: { totalPlants: 0, activeAlerts: 0, avgStringHealth: 100, lastUpdate: null },
        recentAlerts: [],
        hero: {
          livePowerKw: 0,
          livePowerDeltaPercent: 0,
          fleetCapacityKw: 0,
          totalPlantCount: 0,
          healthyPlantCount: 0,
          producingPlantCount: 0,
          sparkline: [],
        },
        kpis: {
          energyToday: { value: 0, unit: 'kWh', sparkline: [], deltaPercent: 0 },
          alerts: { total: 0, critical: 0, warning: 0, info: 0 },
          fleetHealth: { percent: 100, sparkline: [], deltaPercent: 0 },
          invertersOnline: { online: 0, total: 0 },
        },
        alertsInsight: { topIssues: [], recentActivity: [] },
      })
    }

    const todayPKT = getPKTToday()
    const sevenDaysAgoPKT = getPKTDaysAgo(7)
    const fifteenMinAgo = new Date(Date.now() - STALE_MS)
    const thirtyMinAgo = new Date(Date.now() - 2 * STALE_MS)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const [
      latestMeasurements,
      hourlyLast48h,
      dailyLast7d,
      alertCountsBySeverity,
      plantAlertCounts,
      recentAlertsForActivity,
      recentAlertsForDisplay,
      onlineDevicesResult,
      totalDevicesCount,
      hourlyTodayPerPlant,
    ] = await Promise.all([
      // Latest measurements per string in last 15 min (for live power + per-plant live)
      // Filter out CT sensor faults (current above physically reasonable bound).
      prisma.$queryRaw<Array<{ plant_id: string; device_id: string; power: number | null }>>`
        SELECT DISTINCT ON (device_id, string_number) plant_id, device_id, power
        FROM string_measurements
        WHERE plant_id = ANY(${plantIds})
          AND timestamp > ${fifteenMinAgo}
          AND (current IS NULL OR current < ${MAX_STRING_CURRENT_A})
        ORDER BY device_id, string_number, timestamp DESC
      `,

      // Last 48h hourly fleet power (for hero sparkline + delta vs yesterday)
      // Exclude strings with sensor-fault current readings at aggregate level.
      prisma.$queryRaw<Array<{ hour: Date; power: number }>>`
        SELECT hour, SUM(avg_power)::float as power
        FROM string_hourly
        WHERE plant_id = ANY(${plantIds})
          AND hour > ${fortyEightHoursAgo}
          AND (avg_current IS NULL OR avg_current < ${MAX_STRING_CURRENT_A})
        GROUP BY hour
        ORDER BY hour
      `,

      // Last 7 days of daily data (per-string, we aggregate in code)
      // Exclude sensor-fault rows from fleet totals so energy/health are real.
      prisma.string_daily.findMany({
        where: {
          plant_id: { in: plantIds },
          date: { gte: sevenDaysAgoPKT },
          OR: [
            { avg_current: null },
            { avg_current: { lt: MAX_STRING_CURRENT_A } },
          ],
        },
        select: {
          date: true,
          plant_id: true,
          energy_kwh: true,
          health_score: true,
          avg_current: true,
        },
      }),

      // Active alerts by severity
      prisma.alerts.groupBy({
        by: ['severity'],
        where: { plant_id: { in: plantIds }, resolved_at: null },
        _count: true,
      }),

      // Per-plant unresolved alert counts
      prisma.alerts.groupBy({
        by: ['plant_id'],
        where: { plant_id: { in: plantIds }, resolved_at: null },
        _count: true,
      }),

      // Recent alert events for activity feed (last 10 events)
      prisma.alerts.findMany({
        where: { plant_id: { in: plantIds } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true,
          severity: true,
          plant_id: true,
          string_number: true,
          created_at: true,
          resolved_at: true,
        },
      }),

      // Active alerts for legacy recentAlerts field
      prisma.alerts.findMany({
        where: { plant_id: { in: plantIds }, resolved_at: null },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),

      // Online inverters (reported in last 30 min)
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT device_id)::bigint as count
        FROM string_measurements
        WHERE plant_id = ANY(${plantIds})
          AND timestamp > ${thirtyMinAgo}
      `,

      // Total devices in assigned plants
      prisma.devices.count({ where: { plant_id: { in: plantIds } } }),

      // Per-plant hourly today (for production bars — 24 buckets per plant)
      // PKT day starts 5 hours before UTC midnight — subtract to include the full PKT day.
      prisma.$queryRaw<Array<{ plant_id: string; hour: Date; power: number }>>`
        SELECT plant_id, hour, SUM(avg_power)::float as power
        FROM string_hourly
        WHERE plant_id = ANY(${plantIds})
          AND hour >= ${new Date(todayPKT.getTime() - PKT_OFFSET_MS)}
          AND (avg_current IS NULL OR avg_current < ${MAX_STRING_CURRENT_A})
        GROUP BY plant_id, hour
      `,
    ])

    // ═══════════════ COMPUTE METRICS ═══════════════

    // Hero: live power (sum of latest measurements)
    const livePowerW = latestMeasurements.reduce(
      (sum, m) => sum + Number(m.power || 0),
      0,
    )
    const livePowerKw = livePowerW / 1000

    const fleetCapacityKw = plantAssignments.reduce(
      (sum, pa) => sum + Number(pa.plants.capacity_kw || 0),
      0,
    )
    const totalPlantCount = plantAssignments.length
    const healthyPlantCount = plantAssignments.filter(
      (pa) => pa.plants.health_state === PLANT_HEALTH_HEALTHY,
    ).length

    // Hero sparkline: 24h of fleet power (last 24 hours), indexed by hour-of-day from now back
    const hourlyMap = new Map<string, number>()
    hourlyLast48h.forEach((h) => {
      const d = new Date(h.hour)
      d.setMinutes(0, 0, 0)
      hourlyMap.set(d.toISOString(), Number(h.power || 0))
    })

    const sparkline48: number[] = []
    for (let i = 47; i >= 0; i--) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000)
      d.setMinutes(0, 0, 0)
      const power = (hourlyMap.get(d.toISOString()) || 0) / 1000 // kW
      sparkline48.push(power)
    }
    const heroSparkline = sparkline48.slice(-24) // last 24h

    // Hero delta: latest hour vs same hour 24h ago
    const nowHourPower = sparkline48[47] || 0
    const yesterdayHourPower = sparkline48[23] || 0
    const livePowerDeltaPercent =
      yesterdayHourPower > 0
        ? ((nowHourPower - yesterdayHourPower) / yesterdayHourPower) * 100
        : 0

    // KPI: Energy Today + 7-day sparkline
    const dailyEnergyByDate = new Map<string, number>()
    const dailyHealthByDate = new Map<string, number[]>()
    const dailyEnergyByPlant = new Map<string, number>()
    const dailyHealthByPlant = new Map<string, number[]>()

    dailyLast7d.forEach((d) => {
      const key = isoDateKey(d.date)
      dailyEnergyByDate.set(
        key,
        (dailyEnergyByDate.get(key) || 0) + Number(d.energy_kwh || 0),
      )
      const score = Number(d.health_score || 0)
      if (score > 0) {
        if (!dailyHealthByDate.has(key)) dailyHealthByDate.set(key, [])
        dailyHealthByDate.get(key)!.push(score)
      }

      // Today-only: aggregate per-plant
      if (d.date.getTime() === todayPKT.getTime()) {
        dailyEnergyByPlant.set(
          d.plant_id,
          (dailyEnergyByPlant.get(d.plant_id) || 0) + Number(d.energy_kwh || 0),
        )
        if (score > 0) {
          if (!dailyHealthByPlant.has(d.plant_id))
            dailyHealthByPlant.set(d.plant_id, [])
          dailyHealthByPlant.get(d.plant_id)!.push(score)
        }
      }
    })

    const energySparkline: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayPKT)
      d.setUTCDate(d.getUTCDate() - i)
      energySparkline.push(dailyEnergyByDate.get(isoDateKey(d)) || 0)
    }
    const energyTodayKwh = energySparkline[6] || 0
    const yesterdayEnergy = energySparkline[5] || 0
    const energyDeltaPercent =
      yesterdayEnergy > 0
        ? ((energyTodayKwh - yesterdayEnergy) / yesterdayEnergy) * 100
        : 0

    // KPI: Fleet Health + 7-day sparkline
    const healthSparkline: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayPKT)
      d.setUTCDate(d.getUTCDate() - i)
      const scores = dailyHealthByDate.get(isoDateKey(d)) || []
      healthSparkline.push(
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      )
    }
    const fleetHealthToday = healthSparkline[6] || 100
    const yesterdayHealth = healthSparkline[5] || 0
    const healthDeltaPercent =
      yesterdayHealth > 0
        ? ((fleetHealthToday - yesterdayHealth) / yesterdayHealth) * 100
        : 0

    // KPI: Alerts (by severity)
    const alertsByKind = { critical: 0, warning: 0, info: 0, total: 0 }
    alertCountsBySeverity.forEach((a) => {
      const sev = a.severity.toUpperCase()
      if (sev === 'CRITICAL') alertsByKind.critical = a._count
      else if (sev === 'WARNING') alertsByKind.warning = a._count
      else if (sev === 'INFO') alertsByKind.info = a._count
      alertsByKind.total += a._count
    })

    // KPI: Inverters online
    const onlineCount = Number(onlineDevicesResult[0]?.count || 0)

    // ═══════════════ PER-PLANT ENRICHMENT ═══════════════

    // Live power per plant
    const plantLivePowerW = new Map<string, number>()
    const plantIsLiveSet = new Set<string>()
    latestMeasurements.forEach((m) => {
      plantIsLiveSet.add(m.plant_id)
      plantLivePowerW.set(
        m.plant_id,
        (plantLivePowerW.get(m.plant_id) || 0) + Number(m.power || 0),
      )
    })

    // Per-plant hourly production bars (24 buckets)
    const plantHourlyBars = new Map<string, number[]>()
    plantIds.forEach((pid) => plantHourlyBars.set(pid, new Array(24).fill(0)))

    // PKT day starts 5h after UTC; the hour buckets are UTC-based in the DB.
    // For "today's production by hour" we want 24 buckets representing PKT
    // hours 00..23 of today. Simplest: shift by PKT offset.
    hourlyTodayPerPlant.forEach((h) => {
      const utcHour = new Date(h.hour).getUTCHours()
      const pktHour = (utcHour + 5) % 24
      const bars = plantHourlyBars.get(h.plant_id)
      if (bars) {
        bars[pktHour] = Math.max(bars[pktHour], Number(h.power || 0) / 1000)
      }
    })

    // Per-plant alert counts
    const alertCountMap = new Map(
      plantAlertCounts.map((a) => [a.plant_id, a._count]),
    )

    // Plant name lookup
    const plantNameMap = new Map(
      plantAssignments.map((pa) => [pa.plant_id, pa.plants.plant_name]),
    )

    // Build plants array
    const plants = plantAssignments.map((pa) => {
      const plantId = pa.plant_id
      const healths = dailyHealthByPlant.get(plantId) || []
      const healthPercent =
        healths.length > 0
          ? Math.round((healths.reduce((a, b) => a + b, 0) / healths.length) * 10) /
            10
          : 0

      return {
        id: pa.plants.id,
        plant_name: pa.plants.plant_name,
        capacity_kw: pa.plants.capacity_kw,
        health_state: pa.plants.health_state,
        provider: pa.plants.provider,
        device_count: pa.plants._count.devices,
        alert_count: alertCountMap.get(plantId) || 0,
        isLive: plantIsLiveSet.has(plantId),
        currentPowerKw:
          Math.round(((plantLivePowerW.get(plantId) || 0) / 1000) * 10) / 10,
        todayEnergyKwh:
          Math.round((dailyEnergyByPlant.get(plantId) || 0) * 10) / 10,
        healthPercent,
        productionBars: plantHourlyBars.get(plantId) || new Array(24).fill(0),
      }
    })

    // ═══════════════ ALERTS INSIGHT ═══════════════

    const topIssues = plantAlertCounts
      .map((a) => ({
        plant_id: a.plant_id,
        plant_name: plantNameMap.get(a.plant_id) || 'Unknown',
        alertCount: a._count,
      }))
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, 3)

    const recentActivity = recentAlertsForActivity.slice(0, 5).map((a) => ({
      id: a.id,
      severity: a.severity,
      plant_id: a.plant_id,
      plant_name: plantNameMap.get(a.plant_id) || 'Unknown',
      string_number: a.string_number,
      timestamp: (a.resolved_at || a.created_at).toISOString(),
      type: (a.resolved_at ? 'resolved' : 'created') as 'resolved' | 'created',
    }))

    // Last sync (plant level — most recent)
    const lastPlantSync = plantAssignments
      .map((pa) => pa.plants.last_synced)
      .filter(Boolean)
      .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0]

    return NextResponse.json({
      // Legacy shape (backward-compat)
      plants,
      stats: {
        totalPlants: plants.length,
        activeAlerts: alertsByKind.total,
        avgStringHealth: Math.round(fleetHealthToday * 10) / 10,
        lastUpdate: lastPlantSync?.toISOString() || null,
      },
      recentAlerts: recentAlertsForDisplay,

      // v4 data
      hero: {
        livePowerKw: Math.round(livePowerKw * 10) / 10,
        livePowerDeltaPercent: Math.round(livePowerDeltaPercent * 10) / 10,
        fleetCapacityKw: Math.round(fleetCapacityKw * 10) / 10,
        totalPlantCount,
        healthyPlantCount,
        producingPlantCount: plantIsLiveSet.size,
        sparkline: heroSparkline,
      },
      kpis: {
        energyToday: {
          value: Math.round(energyTodayKwh * 10) / 10,
          unit: 'kWh',
          sparkline: energySparkline,
          deltaPercent: Math.round(energyDeltaPercent * 10) / 10,
        },
        alerts: {
          total: alertsByKind.total,
          critical: alertsByKind.critical,
          warning: alertsByKind.warning,
          info: alertsByKind.info,
        },
        fleetHealth: {
          percent: Math.round(fleetHealthToday * 10) / 10,
          sparkline: healthSparkline,
          deltaPercent: Math.round(healthDeltaPercent * 10) / 10,
        },
        invertersOnline: {
          online: onlineCount,
          total: totalDevicesCount,
        },
      },
      alertsInsight: { topIssues, recentActivity },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Dashboard Main]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
