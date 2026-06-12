import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import { bucketHealthScore, MAX_DATE_RANGE_DAYS, ACTIVE_LOOKBACK_DAYS } from '@/lib/string-health'

export async function GET(request: NextRequest) {
  try {
    // 1. Auth — require org membership
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    // 2. Security boundary — ONLY this org's assigned plants
    const assignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      select: { plant_id: true },
    })
    const allowedPlantIds = assignments.map(a => a.plant_id)

    if (allowedPlantIds.length === 0) {
      return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, inactive_strings: 0, unused_strings: 0, peer_excluded_strings: 0 } })
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

    // 3. Validate plant_id (404 — no info leakage)
    if (plantId && !allowedPlantIds.includes(plantId)) {
      return NextResponse.json({ error: 'Plant not found' }, { status: 404 })
    }

    // 4. ALWAYS scope to allowed plants
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
      return NextResponse.json({ dates: [], rows: [], summary: { active_strings: 0, healthy: 0, warning: 0, critical: 0, no_data: 0, inactive_strings: 0, unused_strings: 0, peer_excluded_strings: 0 } })
    }

    const deviceIds = devices.map(d => d.id)
    const deviceMap = new Map(devices.map(d => [d.id, d]))

    // ── 3-Category Detection ────────────────────────────────────────
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - ACTIVE_LOOKBACK_DAYS)

    const recentRecords = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: { device_id: { in: deviceIds }, date: { gte: fourteenDaysAgo } },
    })
    const recentSet = new Set<string>()
    for (const rec of recentRecords) recentSet.add(`${rec.device_id}:${rec.string_number}`)

    const lifetimeRecords = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: { device_id: { in: deviceIds } },
    })
    const lifetimeSet = new Set<string>()
    for (const rec of lifetimeRecords) lifetimeSet.add(`${rec.device_id}:${rec.string_number}`)

    // Admin-flagged unused — overrides the data-history heuristic.
    // These strings are forced into unusedStringSet regardless of whether
    // they show induction-leak data. Org users will see them in the bottom
    // "Unused / Spare Ports" section like other unused (no distinguishing
    // chip — that's admin-side only).
    //
    // Admin-flagged peer-excluded (exclude_from_peer_comparison=true) is a
    // separate concept — the string IS used and producing energy, just at a
    // non-standard orientation/tilt or under shade, so peer-comparison would
    // be unfair. We tag the row with peer_excluded:true so the UI can render
    // a distinct chip; the row stays in the active bucket.
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
    const panelCountSet = new Set(
      adminConfigs.filter(c => c.panel_count != null).map(c => `${c.device_id}:${c.string_number}`),
    )

    const activeStringSet = new Set<string>()
    const inactiveStringSet = new Set<string>()
    const unusedStringSet = new Set<string>()

    for (const key of lifetimeSet) {
      if (adminUnusedSet.has(key)) {
        unusedStringSet.add(key)
      } else if (recentSet.has(key)) {
        activeStringSet.add(key)
      } else {
        inactiveStringSet.add(key)
      }
    }

    for (const d of devices) {
      if (d.max_strings) {
        for (let s = 1; s <= d.max_strings; s++) {
          const key = `${d.id}:${s}`
          if (!lifetimeSet.has(key)) unusedStringSet.add(key)
        }
      }
    }

    // ── kW per string ───────────────────────────────────────────────
    const plantCapacities = new Map<string, number>()
    for (const d of devices) plantCapacities.set(d.plant_id, Number(d.plants?.capacity_kw) || 0)

    const plantActiveStringCounts = new Map<string, number>()
    for (const key of activeStringSet) {
      const [devId] = key.split(':')
      const dev = deviceMap.get(devId)
      if (dev) plantActiveStringCounts.set(dev.plant_id, (plantActiveStringCounts.get(dev.plant_id) || 0) + 1)
    }

    // ── Query string_daily ──────────────────────────────────────────
    const dailyData = await prisma.string_daily.findMany({
      where: { device_id: { in: deviceIds }, date: { gte: fromDate, lte: toDate } },
      select: { device_id: true, plant_id: true, string_number: true, date: true, health_score: true, performance: true, availability: true, data_completeness: true, energy_kwh: true },
      orderBy: [{ device_id: 'asc' }, { string_number: 'asc' }, { date: 'asc' }],
    })

    const dates: string[] = []
    const d = new Date(fromDate)
    while (d <= toDate) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1) }

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
      if (row.energy_kwh != null) energyMap.set(key, Number(row.energy_kwh))
    }

    // Exclude admin-flagged unused from the 'active' bucket — they still
    // have historical rows in string_daily (raw data preserved) but must
    // appear only in the 'unused' section so the customer dashboard
    // doesn't keep showing red on physically-empty PV ports.
    const stringSet = new Set<string>()
    for (const row of dailyData) {
      const key = `${row.device_id}:${row.string_number}`
      if (!adminUnusedSet.has(key)) stringSet.add(key)
    }
    for (const key of activeStringSet) stringSet.add(key)

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

    const rows: any[] = []

    const buildRow = (key: string, type: 'active' | 'inactive' | 'unused') => {
      const [devId, strNum] = key.split(':')
      const device = deviceMap.get(devId)
      if (!device) return

      const plantCap = plantCapacities.get(device.plant_id) || 0
      const plantStrings = plantActiveStringCounts.get(device.plant_id) || 0
      const kwPerString = type === 'active' && plantStrings > 0 && plantCap > 0
        ? Math.round((plantCap / plantStrings) * 100) / 100 : null

      const scores: Record<string, number | null> = {}
      let perfSum = 0, perfCount = 0, availSum = 0, availCount = 0, energySum = 0
      let complSum = 0, complCount = 0

      if (type !== 'unused') {
        for (const date of dates) {
          const mk = `${devId}:${strNum}:${date}`
          scores[date] = scoreMap.get(mk) ?? null
          const p = perfMap.get(mk); const a = availMap.get(mk); const c = complMap.get(mk)
          if (p !== null && p !== undefined) { perfSum += p; perfCount++ }
          if (a !== null && a !== undefined) { availSum += a; availCount++ }
          if (c !== null && c !== undefined) { complSum += c; complCount++ }
          const e = energyMap.get(mk)
          if (e !== undefined) energySum += e
        }
      }

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
        avail_avg: availCount > 0 ? Math.round(availSum / availCount) : null,
        // Data Completeness % (received ÷ 96) — Reyyan §9, its own column, not merged.
        compl_avg: complCount > 0 ? Math.round(complSum / complCount) : null,
        energy_kwh: energySum > 0 ? Math.round(energySum * 10) / 10 : null,
        scores,
        type,
        peer_excluded: adminPeerExcludedSet.has(key),
        panel_count_set: panelCountSet.has(key),
      })
    }

    for (const key of Array.from(stringSet).sort(sortByPlantDeviceString)) buildRow(key, 'active')
    for (const key of Array.from(inactiveStringSet).sort(sortByPlantDeviceString)) {
      if (!stringSet.has(key)) buildRow(key, 'inactive')
    }
    for (const key of Array.from(unusedStringSet).sort(sortByPlantDeviceString)) buildRow(key, 'unused')

    // Summary tally — aligned with the central NOC donut (lib/string-health-donut.ts).
    // The donut EXCLUDES peer-excluded ("non-standard orientation") strings from
    // its total entirely (excluded.nonStandard) because their P2P score is NULL
    // and non-comparable. We mirror that here: peer-excluded rows still render in
    // the table (with a "Non-standard" chip) but are kept OUT of the
    // healthy/warning/critical/no_data tally and out of active_strings, so the
    // counts an operator cross-checks against the donut match. They are surfaced
    // separately via peer_excluded_strings (analogous to unused).
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
      dates, rows,
      summary: {
        // active_strings = scored, peer-comparable strings (healthy+warning+critical+no_data).
        active_strings: scoredRows.length, healthy, warning, critical, no_data: noData,
        // The coloured counts are a SNAPSHOT of this date (the most recent scored
        // day in range), not an average — surfaced as "Status as of …" in the UI.
        as_of_date: latestDate,
        inactive_strings: rows.filter(r => r.type === 'inactive').length,
        unused_strings: rows.filter(r => r.type === 'unused').length,
        // Peer-excluded strings — NULL/no_data P2P score, kept out of the tally
        // above (mirrors the donut's excluded.nonStandard). The UI tags these rows
        // so users understand the score is provisional until PR-based scoring lands.
        peer_excluded_strings: rows.filter(r => r.peer_excluded).length,
      },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Dashboard Analysis String-Level]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
