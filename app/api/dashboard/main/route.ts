import { NextResponse } from 'next/server'
import {
  getUserFromRequest,
  requireOrganization,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  PLANT_HEALTH_HEALTHY,
  STALE_MS,
  MAX_STRING_CURRENT_A,
  MAX_STRING_POWER_W,
  HEALTH_COVERAGE_MIN_RATIO,
  MS_PER_HOUR,
  HERO_SPARKLINE_HOURS,
  HERO_SPARKLINE_LOOKBACK_HOURS,
  DASHBOARD_HISTORY_DAYS,
  STANDBY_POWER_FLOOR_KW,
  classifyPlantLive,
} from '@/lib/string-health'

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
        stats: { totalPlants: 0, activeAlerts: 0, avgStringHealth: null, lastUpdate: null },
        recentAlerts: [],
        hero: {
          livePowerKw: 0,
          livePowerDeltaPercent: null,
          livePowerDeltaContext: null,
          fleetCapacityKw: 0,
          totalPlantCount: 0,
          healthyPlantCount: 0,
          producingPlantCount: 0,
          sparkline: [],
        },
        kpis: {
          energyToday: { value: 0, unit: 'kWh', sparkline: [], deltaPercent: null, deltaContext: null },
          alerts: { total: 0, critical: 0, warning: 0, info: 0 },
          fleetHealth: { percent: null, sparkline: [], deltaPercent: null, deltaContext: null, coverageNote: null },
          invertersOnline: { online: 0, total: 0 },
        },
        alertsInsight: { topIssues: [], recentActivity: [] },
      })
    }

    const todayPKT = getPKTToday()
    const historyStartPKT = getPKTDaysAgo(DASHBOARD_HISTORY_DAYS)
    const fifteenMinAgo = new Date(Date.now() - STALE_MS)
    const thirtyMinAgo = new Date(Date.now() - 2 * STALE_MS)
    const sparklineLookbackStart = new Date(
      Date.now() - HERO_SPARKLINE_LOOKBACK_HOURS * MS_PER_HOUR,
    )

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
      nativeDailyToday,
      hourlyTodayPerPlant,
    ] = await Promise.all([
      // Latest measurements per string in last 15 min (for live power + per-plant live).
      // Reject CT sensor faults on BOTH axes — impossibly-high current OR
      // impossibly-high power (a broken sensor can fake one while the other
      // looks normal, violating Ohm's law).
      prisma.$queryRaw<Array<{ plant_id: string; device_id: string; power: number | null }>>`
        SELECT DISTINCT ON (device_id, string_number) plant_id, device_id, power
        FROM string_measurements
        WHERE plant_id = ANY(${plantIds})
          AND timestamp > ${fifteenMinAgo}
          AND (current IS NULL OR current < ${MAX_STRING_CURRENT_A})
          AND (power IS NULL OR power < ${MAX_STRING_POWER_W})
        ORDER BY device_id, string_number, timestamp DESC
      `,

      // Hourly fleet power over HERO_SPARKLINE_LOOKBACK_HOURS window.
      // Same two-axis sensor-fault filter as above.
      prisma.$queryRaw<Array<{ hour: Date; power: number }>>`
        SELECT hour, SUM(avg_power)::float as power
        FROM string_hourly
        WHERE plant_id = ANY(${plantIds})
          AND hour > ${sparklineLookbackStart}
          AND (avg_current IS NULL OR avg_current < ${MAX_STRING_CURRENT_A})
          AND (avg_power IS NULL OR avg_power < ${MAX_STRING_POWER_W})
        GROUP BY hour
        ORDER BY hour
      `,

      // Daily per-string data over the dashboard history window.
      // Drives energy/health sparklines and the rolling-avg baseline.
      // Two-axis sensor-fault filter so fleet totals reflect physics.
      prisma.string_daily.findMany({
        where: {
          plant_id: { in: plantIds },
          date: { gte: historyStartPKT },
          AND: [
            { OR: [{ avg_current: null }, { avg_current: { lt: MAX_STRING_CURRENT_A } }] },
            { OR: [{ avg_power: null }, { avg_power: { lt: MAX_STRING_POWER_W } }] },
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

      // Native daily kWh from hardware counters (per device, summed to plant in COMPUTE section)
      prisma.device_daily.findMany({
        where: { plant_id: { in: plantIds }, date: todayPKT },
        select: { plant_id: true, native_kwh: true },
      }),

      // Per-plant hourly today (for production bars — 24 buckets per plant).
      // Same two-axis fault filter.
      prisma.$queryRaw<Array<{ plant_id: string; hour: Date; power: number }>>`
        SELECT plant_id, hour, SUM(avg_power)::float as power
        FROM string_hourly
        WHERE plant_id = ANY(${plantIds})
          AND hour >= ${new Date(todayPKT.getTime() - PKT_OFFSET_MS)}
          AND (avg_current IS NULL OR avg_current < ${MAX_STRING_CURRENT_A})
          AND (avg_power IS NULL OR avg_power < ${MAX_STRING_POWER_W})
        GROUP BY plant_id, hour
      `,
    ])

    // ═══════════════ COMPUTE METRICS ═══════════════

    // Native daily kWh per plant — sum of hardware counters across all inverters in the plant
    const nativeEnergyByPlant = new Map<string, number>()
    for (const row of nativeDailyToday) {
      nativeEnergyByPlant.set(
        row.plant_id,
        (nativeEnergyByPlant.get(row.plant_id) || 0) + Number(row.native_kwh || 0),
      )
    }

    // Per-plant: sum current power from the last-measurement set.
    // We sum fleet power from these *after* applying the standby floor
    // per plant, so inverter noise across N plants can't masquerade as
    // meaningful fleet generation.
    const plantLivePowerW = new Map<string, number>()
    const plantReportingSet = new Set<string>()
    latestMeasurements.forEach((m) => {
      plantReportingSet.add(m.plant_id)
      plantLivePowerW.set(
        m.plant_id,
        (plantLivePowerW.get(m.plant_id) || 0) + Number(m.power || 0),
      )
    })

    // Fleet live power — only count plants that are actually PRODUCING.
    // Standby/idle plants contribute 0 so we don't accumulate noise.
    let livePowerKw = 0
    let producingPlantCount = 0
    plantAssignments.forEach((pa) => {
      const plantKw = (plantLivePowerW.get(pa.plant_id) || 0) / 1000
      const status = classifyPlantLive(plantReportingSet.has(pa.plant_id), plantKw)
      if (status === 'PRODUCING') {
        livePowerKw += plantKw
        producingPlantCount += 1
      }
    })

    const fleetCapacityKw = plantAssignments.reduce(
      (sum, pa) => sum + Number(pa.plants.capacity_kw || 0),
      0,
    )
    const totalPlantCount = plantAssignments.length
    const healthyPlantCount = plantAssignments.filter(
      (pa) => pa.plants.health_state === PLANT_HEALTH_HEALTHY,
    ).length

    // Hero sparkline — 48-entry buffer where index (LOOKBACK-1) is the
    // current (in-progress) hour and index 0 is the oldest hour fetched.
    const hourlyMap = new Map<string, number>()
    hourlyLast48h.forEach((h) => {
      const d = new Date(h.hour)
      d.setMinutes(0, 0, 0)
      hourlyMap.set(d.toISOString(), Number(h.power || 0))
    })

    const sparklineBuf: number[] = []
    for (let i = HERO_SPARKLINE_LOOKBACK_HOURS - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * MS_PER_HOUR)
      d.setMinutes(0, 0, 0)
      const power = (hourlyMap.get(d.toISOString()) || 0) / 1000 // kW
      sparklineBuf.push(power)
    }
    const heroSparkline = sparklineBuf.slice(-HERO_SPARKLINE_HOURS)

    // Hero delta — LAST COMPLETED hour vs same completed hour yesterday.
    // The final index is the current in-progress hour (partial → misleading).
    // Step back 1 for "last completed", and HERO_SPARKLINE_HOURS further back
    // for "same completed hour yesterday".
    const LAST_COMPLETED_IDX = HERO_SPARKLINE_LOOKBACK_HOURS - 2
    const SAME_HOUR_YESTERDAY_IDX = LAST_COMPLETED_IDX - HERO_SPARKLINE_HOURS
    const lastCompletedHourPower = sparklineBuf[LAST_COMPLETED_IDX] || 0
    const sameHourYesterdayPower = sparklineBuf[SAME_HOUR_YESTERDAY_IDX] || 0
    const livePowerDeltaPercent: number | null =
      sameHourYesterdayPower > 0
        ? ((lastCompletedHourPower - sameHourYesterdayPower) / sameHourYesterdayPower) * 100
        : null
    const livePowerDeltaContext = livePowerDeltaPercent !== null ? 'vs same hour yesterday' : null

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
    for (let i = DASHBOARD_HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date(todayPKT)
      d.setUTCDate(d.getUTCDate() - i)
      energySparkline.push(dailyEnergyByDate.get(isoDateKey(d)) || 0)
    }
    const energyTodayKwhTrap = energySparkline[DASHBOARD_HISTORY_DAYS - 1] || 0
    // Prefer native hardware counter (sum across all plants with data); fall back to trapezoidal
    const nativeFleetTotal = nativeDailyToday.reduce((s, r) => s + Number(r.native_kwh || 0), 0)
    const energyTodayKwh = nativeFleetTotal > 0 ? nativeFleetTotal : energyTodayKwhTrap

    // Energy delta — FAIR apples-to-apples comparison.
    // DON'T compare today-partial to yesterday-full (always misleading before EOD).
    // DO sum today-so-far vs yesterday-at-same-PKT-time, both from the hourly buffer.
    const nowPKT = new Date(Date.now() + PKT_OFFSET_MS)
    const pktHourNow = nowPKT.getUTCHours()
    const pktMinuteNow = nowPKT.getUTCMinutes()
    const hoursElapsedToday = pktHourNow + 1 // includes current in-progress hour

    const todayStartIdx = Math.max(0, HERO_SPARKLINE_LOOKBACK_HOURS - hoursElapsedToday)
    const yesterdayStartIdx = Math.max(0, todayStartIdx - HERO_SPARKLINE_HOURS)
    const yesterdayEndIdx = Math.max(0, HERO_SPARKLINE_LOOKBACK_HOURS - HERO_SPARKLINE_HOURS)

    const todaySoFarKwh = sparklineBuf.slice(todayStartIdx).reduce((a, b) => a + b, 0)
    const yesterdaySameWindowKwh = sparklineBuf
      .slice(yesterdayStartIdx, yesterdayEndIdx)
      .reduce((a, b) => a + b, 0)
    const energyDeltaPercent: number | null =
      yesterdaySameWindowKwh > 0
        ? ((todaySoFarKwh - yesterdaySameWindowKwh) / yesterdaySameWindowKwh) * 100
        : null
    const pktTimeStr = `${String(pktHourNow).padStart(2, '0')}:${String(pktMinuteNow).padStart(2, '0')}`
    const energyDeltaContext = energyDeltaPercent !== null ? `vs yesterday at ${pktTimeStr} PKT` : null

    // KPI: Fleet Health + sparkline (null when no data — never assume 100%)
    const healthSparkline: (number | null)[] = []
    for (let i = DASHBOARD_HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date(todayPKT)
      d.setUTCDate(d.getUTCDate() - i)
      const scores = dailyHealthByDate.get(isoDateKey(d)) || []
      healthSparkline.push(
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      )
    }
    const todayScores = dailyHealthByDate.get(isoDateKey(todayPKT)) || []
    // Coverage gate — averaging over N of M strings (where M >> N) gives a
    // false-healthy score when most of the fleet is silent. Require today's
    // count to be at least HEALTH_COVERAGE_MIN_RATIO of yesterday's count.
    const yesterdayPKT = new Date(todayPKT)
    yesterdayPKT.setUTCDate(yesterdayPKT.getUTCDate() - 1)
    const yesterdayScores = dailyHealthByDate.get(isoDateKey(yesterdayPKT)) || []
    const expectedStrings = yesterdayScores.length
    const actualStrings = todayScores.length
    const coverageOK =
      expectedStrings === 0 ||
      actualStrings >= Math.ceil(expectedStrings * HEALTH_COVERAGE_MIN_RATIO)
    const fleetHealthToday: number | null =
      todayScores.length > 0 && coverageOK
        ? todayScores.reduce((a, b) => a + b, 0) / todayScores.length
        : null
    const fleetHealthCoverageNote =
      todayScores.length > 0 && !coverageOK
        ? `${actualStrings} of ${expectedStrings} strings reporting — insufficient coverage`
        : null

    // Health delta — vs rolling average over DASHBOARD_HISTORY_DAYS prior days.
    // Stable baseline; not jumpy like day-over-day partial comparisons.
    const priorDaysScores: number[] = []
    for (let i = 1; i <= DASHBOARD_HISTORY_DAYS; i++) {
      const d = new Date(todayPKT)
      d.setUTCDate(d.getUTCDate() - i)
      priorDaysScores.push(...(dailyHealthByDate.get(isoDateKey(d)) || []))
    }
    const rollingAvgHealth =
      priorDaysScores.length > 0
        ? priorDaysScores.reduce((a, b) => a + b, 0) / priorDaysScores.length
        : null
    const healthDeltaPercent: number | null =
      fleetHealthToday !== null && rollingAvgHealth !== null && rollingAvgHealth > 0
        ? ((fleetHealthToday - rollingAvgHealth) / rollingAvgHealth) * 100
        : null
    const healthDeltaContext =
      healthDeltaPercent !== null ? `vs ${DASHBOARD_HISTORY_DAYS}-day avg` : null

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
    // (plantLivePowerW + plantReportingSet were built above for the fleet sum)

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

    // Build plants array. healthPercent is null when no data — never default to 0 or 100.
    // liveStatus is one of PRODUCING / IDLE / OFFLINE (see classifyPlantLive).
    const plants = plantAssignments.map((pa) => {
      const plantId = pa.plant_id
      const healths = dailyHealthByPlant.get(plantId) || []
      const healthPercent: number | null =
        healths.length > 0
          ? Math.round((healths.reduce((a, b) => a + b, 0) / healths.length) * 10) /
            10
          : null

      const rawPowerKw = (plantLivePowerW.get(plantId) || 0) / 1000
      const liveStatus = classifyPlantLive(plantReportingSet.has(plantId), rawPowerKw)
      // Only show the power number when actually producing — suppresses standby noise
      const displayPowerKw = liveStatus === 'PRODUCING' ? Math.round(rawPowerKw * 10) / 10 : 0

      return {
        id: pa.plants.id,
        plant_name: pa.plants.plant_name,
        capacity_kw: pa.plants.capacity_kw,
        health_state: pa.plants.health_state,
        provider: pa.plants.provider,
        device_count: pa.plants._count.devices,
        alert_count: alertCountMap.get(plantId) || 0,
        liveStatus,
        // Back-compat: isLive === PRODUCING (narrower than before — was "reporting")
        isLive: liveStatus === 'PRODUCING',
        currentPowerKw: displayPowerKw,
        todayEnergyKwh: nativeEnergyByPlant.has(plantId)
          ? Math.round((nativeEnergyByPlant.get(plantId) || 0) * 10) / 10
          : Math.round((dailyEnergyByPlant.get(plantId) || 0) * 10) / 10,
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
        avgStringHealth:
          fleetHealthToday !== null ? Math.round(fleetHealthToday * 10) / 10 : null,
        lastUpdate: lastPlantSync?.toISOString() || null,
      },
      recentAlerts: recentAlertsForDisplay,

      // v4 data
      hero: {
        livePowerKw: Math.round(livePowerKw * 10) / 10,
        livePowerDeltaPercent:
          livePowerDeltaPercent !== null
            ? Math.round(livePowerDeltaPercent * 10) / 10
            : null,
        livePowerDeltaContext,
        fleetCapacityKw: Math.round(fleetCapacityKw * 10) / 10,
        totalPlantCount,
        healthyPlantCount,
        producingPlantCount,
        sparkline: heroSparkline,
      },
      kpis: {
        energyToday: {
          value: Math.round(energyTodayKwh * 10) / 10,
          unit: 'kWh',
          sparkline: energySparkline,
          deltaPercent:
            energyDeltaPercent !== null ? Math.round(energyDeltaPercent * 10) / 10 : null,
          deltaContext: energyDeltaContext,
        },
        alerts: {
          total: alertsByKind.total,
          critical: alertsByKind.critical,
          warning: alertsByKind.warning,
          info: alertsByKind.info,
        },
        fleetHealth: {
          percent:
            fleetHealthToday !== null ? Math.round(fleetHealthToday * 10) / 10 : null,
          sparkline: healthSparkline,
          deltaPercent:
            healthDeltaPercent !== null
              ? Math.round(healthDeltaPercent * 10) / 10
              : null,
          deltaContext: healthDeltaContext,
          coverageNote: fleetHealthCoverageNote,
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
