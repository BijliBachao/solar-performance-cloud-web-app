import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import { bucketHealthScore, MAX_DATE_RANGE_DAYS, ACTIVE_LOOKBACK_DAYS } from '@/lib/string-health'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const plantId = searchParams.get('plant_id')
    const deviceId = searchParams.get('device_id')
    const organizationId = searchParams.get('organization_id')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    // Reject unparseable dates BEFORE the range check — NaN comparisons are
    // always false, so a malformed date would otherwise slip past the guard
    // below and reach Prisma as an Invalid Date (500 + empty result).
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
    }

    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > MAX_DATE_RANGE_DAYS || diffDays < 0) {
      return NextResponse.json({ error: `Date range must be 1-${MAX_DATE_RANGE_DAYS} days` }, { status: 400 })
    }

    // Build device filter
    const deviceWhere: any = {
      device_type_id: { in: INVERTER_DEVICE_TYPE_IDS },
    }
    if (plantId) deviceWhere.plant_id = plantId
    if (deviceId) deviceWhere.id = deviceId

    // Optional org scope — restrict to the plants assigned to this organization.
    // Combined with plant_id (if both given) via the plant_id { in } filter.
    if (organizationId) {
      const orgAssignments = await prisma.plant_assignments.findMany({
        where: { organization_id: organizationId },
        select: { plant_id: true },
      })
      const orgPlantIds = orgAssignments.map(a => a.plant_id)
      if (orgPlantIds.length === 0) {
        return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, inactive_strings: 0, unused_strings: 0, peer_excluded_strings: 0 } })
      }
      deviceWhere.plant_id = plantId
        ? (orgPlantIds.includes(plantId) ? plantId : '__none__')
        : { in: orgPlantIds }
    }

    const devices = await prisma.devices.findMany({
      where: deviceWhere,
      include: {
        plants: { select: { id: true, plant_name: true, capacity_kw: true } },
      },
      orderBy: [{ plant_id: 'asc' }, { device_name: 'asc' }],
    })

    if (devices.length === 0) {
      return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, inactive_strings: 0, unused_strings: 0, peer_excluded_strings: 0 } })
    }

    const deviceIds = devices.map(d => d.id)
    const deviceMap = new Map(devices.map(d => [d.id, d]))

    // ── 3-Category Detection ────────────────────────────────────────
    // 1. Active: data in last 14 days (recent production)
    // 2. Inactive: data in lifetime but NOT in last 14 days (was working, stopped)
    // 3. Unused: NEVER had any data (spare port)

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - ACTIVE_LOOKBACK_DAYS)

    // Recent active strings (last 14 days)
    const recentRecords = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: {
        device_id: { in: deviceIds },
        date: { gte: fourteenDaysAgo },
      },
    })
    const recentSet = new Set<string>()
    for (const rec of recentRecords) {
      recentSet.add(`${rec.device_id}:${rec.string_number}`)
    }

    // Lifetime strings (ever had data)
    const lifetimeRecords = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: {
        device_id: { in: deviceIds },
      },
    })
    const lifetimeSet = new Set<string>()
    for (const rec of lifetimeRecords) {
      lifetimeSet.add(`${rec.device_id}:${rec.string_number}`)
    }

    // Admin-flagged unused — overrides the data-history heuristic.
    // Forced into unusedStringSet regardless of data state. The unused_source
    // ('admin' | 'auto') is exposed in the row output below for the
    // distinguishing chip on the admin UI.
    //
    // Admin-flagged peer-excluded — separate concept from unused. The string
    // IS used and producing energy but has non-standard orientation/tilt or is
    // shaded, so peer comparison would be unfair. Stays in active bucket;
    // peer_excluded:true tag exposed for admin UI to render a distinct chip.
    const adminConfigs = await prisma.string_configs.findMany({
      where: { device_id: { in: deviceIds } },
      select: { device_id: true, string_number: true, is_used: true, exclude_from_peer_comparison: true, panel_count: true },
    })
    const adminUnusedSet = new Set(
      adminConfigs.filter(c => c.is_used === false).map(c => `${c.device_id}:${c.string_number}`),
    )
    const adminPeerExcludedSet = new Set(
      adminConfigs.filter(c => c.exclude_from_peer_comparison === true).map(c => `${c.device_id}:${c.string_number}`),
    )
    // Strings with an admin-entered panel_count — used to flag inverters whose
    // P2P scoring fell back to the default panel count (borderline flags approx).
    const panelCountSet = new Set(
      adminConfigs.filter(c => c.panel_count != null).map(c => `${c.device_id}:${c.string_number}`),
    )

    // Classify: active / inactive / unused
    const activeStringSet = new Set<string>() // recent data
    const inactiveStringSet = new Set<string>() // had data, stopped
    const unusedStringSet = new Set<string>() // never had data OR admin-flagged

    // All strings from lifetime data: admin-flagged → unused, else active or inactive
    for (const key of lifetimeSet) {
      if (adminUnusedSet.has(key)) {
        unusedStringSet.add(key)
      } else if (recentSet.has(key)) {
        activeStringSet.add(key)
      } else {
        inactiveStringSet.add(key)
      }
    }

    // Unused: in 1..max_strings but never had any data
    for (const d of devices) {
      if (d.max_strings) {
        for (let s = 1; s <= d.max_strings; s++) {
          const key = `${d.id}:${s}`
          if (!lifetimeSet.has(key)) {
            unusedStringSet.add(key)
          }
        }
      }
    }

    // ── kW per string (active count only) ───────────────────────────
    const plantCapacities = new Map<string, number>()
    for (const d of devices) {
      plantCapacities.set(d.plant_id, Number(d.plants?.capacity_kw) || 0)
    }

    const plantActiveStringCounts = new Map<string, number>()
    for (const key of activeStringSet) {
      const [devId] = key.split(':')
      const dev = deviceMap.get(devId)
      if (dev) {
        plantActiveStringCounts.set(dev.plant_id, (plantActiveStringCounts.get(dev.plant_id) || 0) + 1)
      }
    }

    // ── Query string_daily for selected date range ──────────────────
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
        performance: true,
        availability: true,
        data_completeness: true,
        energy_kwh: true,
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

    // Today's PKT (UTC+5) calendar date. Completeness is averaged over SETTLED
    // days only (dates strictly before today PKT) — today is still accumulating
    // readings, so its partial count is not a real coverage figure.
    const todayPkt = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10)

    // Index daily data
    const scoreMap = new Map<string, number | null>()
    const perfMap = new Map<string, number | null>()
    const availMap = new Map<string, number | null>()
    const complMap = new Map<string, number | null>()
    const energyMap = new Map<string, number>()
    for (const row of dailyData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      const key = `${row.device_id}:${row.string_number}:${dateStr}`
      complMap.set(key, row.data_completeness == null ? null : Number(row.data_completeness))
      // Explicit null check — a real health_score of 0 (string dead at peak vs a
      // healthy peer group) is the single most important value this feature
      // surfaces. Truthiness (`x ? .. : null`) would coerce 0 → null and the
      // worst string would vanish into 'no_data' instead of 'critical'.
      scoreMap.set(key, row.health_score == null ? null : Number(row.health_score))
      perfMap.set(key, row.performance == null ? null : Number(row.performance))
      availMap.set(key, row.availability == null ? null : Number(row.availability))
      const eKey = `${row.device_id}:${row.string_number}:${dateStr}`
      if (row.energy_kwh != null) energyMap.set(eKey, Number(row.energy_kwh))
    }

    // Strings with data in query range + all active strings.
    // Exclude admin-flagged unused — they still have historical rows in
    // string_daily (we never delete raw data) but must not appear in the
    // 'active' section. They render via unusedStringSet → 'unused' below.
    const stringSet = new Set<string>()
    for (const row of dailyData) {
      const key = `${row.device_id}:${row.string_number}`
      if (!adminUnusedSet.has(key)) stringSet.add(key)
    }
    for (const key of activeStringSet) {
      stringSet.add(key)
    }

    // ── Sort helper ─────────────────────────────────────────────────
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

    // ── Build rows ──────────────────────────────────────────────────
    const rows: any[] = []

    // Helper to build a row
    const buildRow = (key: string, type: 'active' | 'inactive' | 'unused') => {
      const [devId, strNum] = key.split(':')
      const device = deviceMap.get(devId)
      if (!device) return

      const plantCap = plantCapacities.get(device.plant_id) || 0
      const plantStrings = plantActiveStringCounts.get(device.plant_id) || 0
      const kwPerString = type === 'active' && plantStrings > 0 && plantCap > 0
        ? Math.round((plantCap / plantStrings) * 100) / 100
        : null

      const scores: Record<string, number | null> = {}
      let perfSum = 0, perfCount = 0, energySum = 0
      // Completeness is COVERAGE over the full settled range (option B): the
      // denominator is every settled day in the range, and a day with no
      // completeness value counts as 0% — so a string present 1 of 6 settled
      // days reads ~17%, not 100%. perf_avg is deliberately NOT changed: a dark
      // day must not count as 0% performance (Reyyan §9 — no-data ≠ bad-output).
      let complSum = 0, settledCount = 0

      if (type !== 'unused') {
        for (const date of dates) {
          const mk = `${devId}:${strNum}:${date}`
          scores[date] = scoreMap.get(mk) ?? null
          const p = perfMap.get(mk)
          if (p !== null && p !== undefined) { perfSum += p; perfCount++ }
          if (date < todayPkt) {
            complSum += complMap.get(mk) ?? 0
            settledCount++
          }
          const e = energyMap.get(mk)
          if (e !== undefined) energySum += e
        }
      }

      // Distinguish admin-flagged unused from heuristic-detected unused
      // ('admin' | 'auto'). Only meaningful on type='unused' rows.
      // Org-side analysis endpoint does NOT include this field — admin-only.
      const unused_source: 'admin' | 'auto' | null = type !== 'unused'
        ? null
        : adminUnusedSet.has(key)
          ? 'admin'
          : 'auto'

      rows.push({
        plant_id: device.plant_id,
        plant_name: device.plants?.plant_name || 'Unknown',
        device_id: devId,
        device_name: device.device_name || devId,
        provider: device.provider,
        model: device.model,
        string_number: Number(strNum),
        group: 'Inv-wide', // v3 compares device-wide by current; honest label (no fake MPPT)
        kw_per_string: kwPerString,
        perf_avg: perfCount > 0 ? Math.round(perfSum / perfCount) : null,
        // Data Completeness % (received ÷ 96 expected) — Reyyan §9, shown as its
        // OWN column, never merged into performance. Coverage over ALL settled
        // days in range (missing day = 0%), so it reflects how consistently the
        // string reported, not just how complete its reporting days were.
        compl_avg: settledCount > 0 ? Math.round(complSum / settledCount) : null,
        energy_kwh: energySum > 0 ? Math.round(energySum * 10) / 10 : null,
        scores,
        type,
        unused_source,
        peer_excluded: adminPeerExcludedSet.has(key),
        panel_count_set: panelCountSet.has(key),
      })
    }

    // Active rows
    for (const key of Array.from(stringSet).sort(sortByPlantDeviceString)) {
      buildRow(key, 'active')
    }

    // Inactive rows (had data, stopped)
    for (const key of Array.from(inactiveStringSet).sort(sortByPlantDeviceString)) {
      if (!stringSet.has(key)) { // not already in active set
        buildRow(key, 'inactive')
      }
    }

    // Unused rows (never had data)
    for (const key of Array.from(unusedStringSet).sort(sortByPlantDeviceString)) {
      buildRow(key, 'unused')
    }

    // ── Summary ─────────────────────────────────────────────────────
    // Aligned with the central NOC donut (lib/string-health-donut.ts), which
    // EXCLUDES peer-excluded ("non-standard orientation") strings from its total
    // entirely (excluded.nonStandard) — their P2P score is NULL and non-comparable.
    // We mirror that: peer-excluded rows still render in the table (with a
    // "Non-standard" chip) but are kept OUT of the healthy/warning/critical/no_data
    // tally and out of active_strings, so the counts match the donut. They are
    // surfaced separately via peer_excluded_strings (analogous to unused).
    let healthy = 0, warning = 0, critical = 0, noData = 0
    const activeRows = rows.filter(r => r.type === 'active')
    const scoredRows = activeRows.filter(r => !r.peer_excluded)
    // Anchor the summary on the most recent date that actually has scores. The
    // default range ends "today", and today's daily aggregate may not be written
    // yet — without this, every active string would read "No Data" until the
    // scorer runs. Falls back to the last calendar date if nothing scored.
    let latestDate = dates[dates.length - 1]
    for (let i = dates.length - 1; i >= 0; i--) {
      if (scoredRows.some(r => r.scores[dates[i]] != null)) { latestDate = dates[i]; break }
    }
    for (const row of scoredRows) {
      const score = row.scores[latestDate]
      const bucket = bucketHealthScore(score)
      if (bucket === 'no_data') noData++
      else if (bucket === 'healthy') healthy++
      else if (bucket === 'warning') warning++
      else critical++
    }

    return NextResponse.json({
      dates,
      rows,
      summary: {
        // active_strings = scored, peer-comparable strings (healthy+warning+critical+no_data).
        active_strings: scoredRows.length,
        healthy,
        warning,
        critical,
        no_data: noData,
        // The coloured counts are a SNAPSHOT of this date (the most recent scored
        // day in range), not an average — surfaced as "Status as of …" in the UI.
        as_of_date: latestDate,
        inactive_strings: rows.filter(r => r.type === 'inactive').length,
        unused_strings: rows.filter(r => r.type === 'unused').length,
        // Peer-excluded strings — NULL/no_data P2P score, kept out of the tally
        // above (mirrors the donut's excluded.nonStandard). UI tags these rows so
        // admins know the score is provisional until PR-based scoring lands.
        peer_excluded_strings: rows.filter(r => r.peer_excluded).length,
      },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Analysis String-Level]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
