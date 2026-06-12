/**
 * Donut Data Loader — single source of truth for fetching string-health
 * donut data, used by both the per-plant API and the fleet (NOC) API.
 *
 * Centralization wins:
 *   - One SQL pattern, indexed once, optimized once
 *   - One PKT timezone calculation
 *   - One NULL / Decimal coercion path
 *   - One place to add openCircuit override when v2.1 ships it
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §3
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  aggregateForDonut,
  type DonutAggregate,
  type DonutInput,
  type DonutBucket,
} from '@/lib/string-health-donut'
import {
  PERF_NORMAL,
  PERF_CRITICAL,
  classifyStringPerformance,
  perfBandToDonutBucket,
} from '@/lib/string-health'
import { deviceConnectivity } from '@/lib/connectivity'
import { isDaylight } from '@/lib/solar-geometry'
import {
  clampToFleetCoords,
  rollupPlantStatus,
  type ConnectivityStatus,
  type PlantOpStatus,
} from '@/lib/string-health'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TimeBasis {
  label: string
  startsAt: Date
  endsAt: Date
  hoursCovered?: number
}

export interface Freshness {
  lastDataAt: Date | null
  coveragePct: number
}

export interface Warning {
  code: string
  message: string
}

export interface PerStringRow {
  orgId: string
  orgName: string
  plantCode: string
  plantName: string
  deviceId: string
  inverterName: string
  stringNumber: number
  healthScore: number | null
  bucket: DonutBucket
}

export interface PlantDonutResult extends DonutAggregate {
  timeBasis: TimeBasis
  freshness: Freshness
  warnings: Warning[]
}

export interface FleetCountsResult extends DonutAggregate {
  timeBasis: TimeBasis
  freshness: Freshness
  warnings: Warning[]
}

export interface FleetRowsPage {
  page: number
  pageSize: number
  total: number
  items: PerStringRow[]
}

export interface FleetConnectivityDevice {
  deviceId: string
  plantCode: string
  plantName: string
  inverterName: string
  provider: string
  status: ConnectivityStatus
  effectiveFreshAt: string | null
}

export interface FleetConnectivity {
  counts: { live: number; frozen: number; offline: number; idle: number }
  devices: FleetConnectivityDevice[]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PKT clock helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pakistan Standard Time is UTC+5, no DST since 2010. Hardcoded offset is
// safe; if DST is ever reintroduced, swap for a tz library.

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000
const FLEET_PAGE_SIZE = 50

/**
 * Returns UTC midnight of the PKT date one day before "now". Suitable for
 * PostgreSQL DATE column lookups (string_daily.date).
 */
export function getPktYesterdayDate(now: Date = new Date()): Date {
  const nowPKT = new Date(now.getTime() + PKT_OFFSET_MS)
  return new Date(Date.UTC(
    nowPKT.getUTCFullYear(),
    nowPKT.getUTCMonth(),
    nowPKT.getUTCDate() - 1,
    0, 0, 0, 0,
  ))
}

/**
 * Returns UTC midnight of the CURRENT PKT date. NOC "Today · live" mode reads
 * string_daily at this date — the poller recomputes today's rows every cycle
 * (~5 min), so these scores update intraday and settle by end of day.
 */
export function getPktTodayDate(now: Date = new Date()): Date {
  const nowPKT = new Date(now.getTime() + PKT_OFFSET_MS)
  return new Date(Date.UTC(
    nowPKT.getUTCFullYear(),
    nowPKT.getUTCMonth(),
    nowPKT.getUTCDate(),
    0, 0, 0, 0,
  ))
}

function formatPktDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Row helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function decimalToNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

function bigintToNumber(v: unknown): number {
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number') return v
  return Number(v)
}

// 3-band rebrand: a row's bucket comes from the central classifier (the SAME
// source the /analysis cells use), then the donut rollup. null score (no-data)
// folds into Abnormal — the donut's deliberate taxonomy (rule #4) — never its
// own arc. normal→healthy, watch→abnormal, critical→critical.
function scoreToBucket(score: number | null): DonutBucket {
  if (score === null) return 'abnormal'
  const bucket = perfBandToDonutBucket(
    classifyStringPerformance(score, { isUsed: true, peerExcluded: false, insufficientData: false }),
  )
  return (bucket === 'no_data' || bucket == null ? 'abnormal' : bucket) as DonutBucket
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-plant: previous-day mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PlantPrevDayRow {
  device_id: string
  string_number: number
  health_score: Prisma.Decimal | number | null
  is_used: boolean
  exclude_from_peer_comparison: boolean
}

export async function loadPlantDonutPrevDay(plantCode: string): Promise<PlantDonutResult> {
  const yesterday = getPktYesterdayDate()

  // Parallel fetch: daily aggregates + admin-flagged "unused" configs.
  // The poller filters is_used=false rows before writing string_daily, so we
  // cannot derive `excluded.unused` from the daily rows themselves; pull
  // them from string_configs directly.
  const [rows, unusedRows] = await Promise.all([
    prisma.$queryRaw<PlantPrevDayRow[]>`
      SELECT
        sd.device_id,
        sd.string_number,
        sd.health_score,
        COALESCE(sc.is_used, true) as is_used,
        COALESCE(sc.exclude_from_peer_comparison, false) as exclude_from_peer_comparison
      FROM string_daily sd
      LEFT JOIN string_configs sc
        ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
      WHERE sd.plant_id = ${plantCode}
        AND sd.date = ${yesterday}
    `,
    prisma.$queryRaw<{ unused: bigint }[]>`
      SELECT COUNT(*)::bigint AS unused
      FROM string_configs sc
      JOIN devices d ON d.id = sc.device_id
      WHERE d.plant_id = ${plantCode}
        AND sc.is_used = false
    `,
  ])

  const inputs: DonutInput[] = rows.map((r) => ({
    healthScore: decimalToNumberOrNull(r.health_score),
    isUsed: r.is_used,
    peerExcluded: r.exclude_from_peer_comparison,
    openCircuit: false, // v2: deferred to v2.1 (see spec §3c)
  }))

  const aggregate = aggregateForDonut(inputs)
  // Override excluded.unused with the true count from string_configs.
  aggregate.excluded.unused = bigintToNumber(unusedRows[0]?.unused ?? BigInt(0))

  const warnings: Warning[] = []
  if (rows.length === 0) {
    warnings.push({
      code: 'NO_DATA_YESTERDAY',
      message: 'No string data found for the previous day. The plant may have just been installed or experienced a comms outage.',
    })
  }

  const startsAt = yesterday
  const endsAt = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000)

  return {
    ...aggregate,
    timeBasis: {
      label: `Yesterday · ${formatPktDateLabel(yesterday)}`,
      startsAt,
      endsAt,
    },
    freshness: {
      lastDataAt: rows.length > 0 ? endsAt : null,
      coveragePct: rows.length > 0 ? 100 : 0,
    },
    warnings,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-plant: today · live mode (V1 cutover, Task 10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Replaces the retired last-3h SR-anchored donut. Reads TODAY's PKT
// string_daily — recomputed every poll cycle by updateDailyAggregates via the
// shared buildPerfInputsFromHourly (8–4 PKT window, median-of-medians, 60%
// completeness gate) — and buckets it with the SAME V1 classifier the NOC
// "today" donut and the /analysis today cell use. So per-plant Today (live) ==
// NOC today == /analysis today cell, by construction. Mirrors
// loadPlantDonutPrevDay; only the date differs (today instead of yesterday).

export async function loadPlantDonutToday(plantCode: string): Promise<PlantDonutResult> {
  const today = getPktTodayDate()

  // Parallel fetch: daily aggregates + admin-flagged "unused" configs.
  // The poller filters is_used=false rows before writing string_daily, so we
  // cannot derive `excluded.unused` from the daily rows themselves; pull
  // them from string_configs directly. (Identical to prev-day, date = today.)
  const [rows, unusedRows, freshRows] = await Promise.all([
    prisma.$queryRaw<PlantPrevDayRow[]>`
      SELECT
        sd.device_id,
        sd.string_number,
        sd.health_score,
        COALESCE(sc.is_used, true) as is_used,
        COALESCE(sc.exclude_from_peer_comparison, false) as exclude_from_peer_comparison
      FROM string_daily sd
      LEFT JOIN string_configs sc
        ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
      WHERE sd.plant_id = ${plantCode}
        AND sd.date = ${today}
    `,
    prisma.$queryRaw<{ unused: bigint }[]>`
      SELECT COUNT(*)::bigint AS unused
      FROM string_configs sc
      JOIN devices d ON d.id = sc.device_id
      WHERE d.plant_id = ${plantCode}
        AND sc.is_used = false
    `,
    // Honest liveness for the "Today (live)" donut: the newest poll cycle that
    // saw any of this plant's devices. last_seen_at is stamped every cycle the
    // poller observes the device (even on a frozen feed — that case is surfaced
    // separately by the connectivity layer), so it goes stale exactly when the
    // pipeline stops delivering — which is what the component's 30-min isStale()
    // check means. We deliberately do NOT report "now" (which would make the
    // live donut incapable of ever showing the stale badge).
    prisma.$queryRaw<{ last_seen: Date | null }[]>`
      SELECT MAX(last_seen_at) AS last_seen
      FROM devices
      WHERE plant_id = ${plantCode}
    `,
  ])

  const inputs: DonutInput[] = rows.map((r) => ({
    healthScore: decimalToNumberOrNull(r.health_score),
    isUsed: r.is_used,
    peerExcluded: r.exclude_from_peer_comparison,
    openCircuit: false, // v2: deferred to v2.1 (see spec §3c). It's V1 now — no bucket override.
  }))

  const aggregate = aggregateForDonut(inputs)
  // Override excluded.unused with the true count from string_configs.
  aggregate.excluded.unused = bigintToNumber(unusedRows[0]?.unused ?? BigInt(0))

  const warnings: Warning[] = []
  if (rows.length === 0) {
    warnings.push({
      code: 'NO_DATA_TODAY',
      message: 'No string scores yet for today (PKT). Scores appear once the plant starts producing after sunrise, and update every poll cycle.',
    })
  }

  const startsAt = today
  // Today's window is still open — it ends "now", not at PKT midnight.
  const endsAt = new Date()

  return {
    ...aggregate,
    timeBasis: {
      label: `Today · ${formatPktDateLabel(today)} · live`,
      startsAt,
      endsAt,
    },
    freshness: {
      // Real last-poll time (not "now") so isStale() can fire if the poller dies
      // mid-afternoon; null pre-dawn / brand-new plant so it doesn't false-alarm.
      lastDataAt: rows.length > 0 ? (freshRows[0]?.last_seen ?? null) : null,
      coveragePct: rows.length > 0 ? 100 : 0,
    },
    warnings,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fleet: aggregate counts only (SQL aggregation, fast at any scale)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FleetCountsRow {
  healthy: bigint
  abnormal_by_score: bigint
  critical_by_score: bigint
  no_data: bigint
  excluded_unused: bigint
  excluded_nonstandard: bigint
}

export interface FleetCountsFacets {
  /** Case-insensitive match on plant name / plant code / inverter name. */
  q?: string
  /** Restrict to these devices (the connectivity facet's matching devices).
   *  Pass an EMPTY array to match nothing; undefined = no device filter. */
  deviceIds?: string[]
  /** PKT date (UTC midnight) of the string_daily rows to read. Defaults to
   *  yesterday (settled). Pass getPktTodayDate() for the live intraday view. */
  date?: Date
}

export async function loadFleetCounts(orgId?: string, facets: FleetCountsFacets = {}): Promise<FleetCountsResult> {
  const date = facets.date ?? getPktYesterdayDate()
  // Re-derived here (not threaded from the route): if PKT midnight rolls over
  // between the route computing `date` and this line, isToday flips — but the
  // SQL already binds the route's date, so only the LABEL/warning-code would
  // read "Yesterday" for that single request. Data is never wrong.
  const isToday = date.getTime() === getPktTodayDate().getTime()

  // Plants↔orgs is a many-to-many via plant_assignments (no organization_id on
  // plants directly). DISTINCT on (device_id, string_number) so a plant
  // assigned to multiple orgs isn't double-counted when no org filter is set.
  const orgFilter = orgId ?? null
  // NOC v3 cross-facet scope: the health donut recomputes under the
  // connectivity selection + search (AND across facets), but NOT under its own
  // bucket selection — a facet always shows all of its own values.
  const qLike = facets.q && facets.q.trim() !== '' ? `%${facets.q.trim()}%` : null
  const useDeviceFilter = facets.deviceIds != null
  const deviceIdsArr = facets.deviceIds ?? []

  const rows = await prisma.$queryRaw<FleetCountsRow[]>`
    WITH scoped AS (
      SELECT DISTINCT
        sd.device_id,
        sd.string_number,
        sd.health_score,
        COALESCE(sc.is_used, true) AS is_used,
        COALESCE(sc.exclude_from_peer_comparison, false) AS exclude_from_peer_comparison
      FROM string_daily sd
      LEFT JOIN string_configs sc
        ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
      JOIN plants p ON p.id = sd.plant_id
      JOIN devices d ON d.id = sd.device_id
      -- LEFT JOIN so plants with no organization assignment ("orphan" plants)
      -- still appear in the fleet aggregate. Client requirement: "see all of
      -- the managed strings in 1 place" — strings exist regardless of admin
      -- having assigned the plant to an org. The rows query (loadFleetRows)
      -- uses the same LEFT JOIN so counts and rows stay reconciled.
      LEFT JOIN plant_assignments pa ON pa.plant_id = sd.plant_id
      WHERE sd.date = ${date}
        AND (${orgFilter}::text IS NULL OR pa.organization_id = ${orgFilter}::text)
        AND (${useDeviceFilter}::bool = false OR sd.device_id = ANY(${deviceIdsArr}))
        AND (${qLike}::text IS NULL OR p.plant_name ILIKE ${qLike} OR p.id ILIKE ${qLike} OR d.device_name ILIKE ${qLike})
    ),
    excluded_from_configs AS (
      -- excluded_unused is counted from string_configs directly. The poller
      -- filters is_used=false BEFORE writing string_daily, so unused
      -- strings never appear in the scoped CTE above. Peer-excluded strings
      -- DO get string_daily rows (only excluded from alerts), so the
      -- scoped CTE handles those.
      -- LEFT JOIN + DISTINCT pair: orphan plants stay counted (matches the
      -- scoped CTE's deliberate inclusion) and a plant assigned to multiple
      -- orgs isn't double-counted in the all-orgs view.
      SELECT
        COUNT(DISTINCT (sc.device_id, sc.string_number)) FILTER (WHERE NOT sc.is_used)::bigint AS excluded_unused
      FROM string_configs sc
      JOIN devices d ON d.id = sc.device_id
      LEFT JOIN plant_assignments pa ON pa.plant_id = d.plant_id
      WHERE (${orgFilter}::text IS NULL OR pa.organization_id = ${orgFilter}::text)
    )
    -- 3-band rebrand: cutpoints interpolated from the central PERF_* constants
    -- so the NOC counts match the /analysis cells (classifier) bucket-for-bucket.
    -- healthy ≥ PERF_NORMAL (85); abnormal [PERF_CRITICAL, PERF_NORMAL)
    -- = [50, 85) (watch); critical < PERF_CRITICAL (50); no-data = NULL health_score.
    SELECT
      COUNT(*) FILTER (
        WHERE is_used = true
          AND exclude_from_peer_comparison = false
          AND health_score IS NOT NULL
          AND health_score >= ${PERF_NORMAL}
      )::bigint AS healthy,
      COUNT(*) FILTER (
        WHERE is_used = true
          AND exclude_from_peer_comparison = false
          AND health_score IS NOT NULL
          AND health_score >= ${PERF_CRITICAL}
          AND health_score < ${PERF_NORMAL}
      )::bigint AS abnormal_by_score,
      COUNT(*) FILTER (
        WHERE is_used = true
          AND exclude_from_peer_comparison = false
          AND health_score IS NOT NULL
          AND health_score < ${PERF_CRITICAL}
      )::bigint AS critical_by_score,
      COUNT(*) FILTER (
        WHERE is_used = true
          AND exclude_from_peer_comparison = false
          AND health_score IS NULL
      )::bigint AS no_data,
      (SELECT excluded_unused FROM excluded_from_configs)::bigint AS excluded_unused,
      COUNT(*) FILTER (
        WHERE is_used = true
          AND exclude_from_peer_comparison = true
      )::bigint AS excluded_nonstandard
    FROM scoped
  `

  const zero = BigInt(0)
  const r = rows[0] ?? {
    healthy: zero, abnormal_by_score: zero, critical_by_score: zero, no_data: zero,
    excluded_unused: zero, excluded_nonstandard: zero,
  }

  const healthy = bigintToNumber(r.healthy)
  const abnormalByScore = bigintToNumber(r.abnormal_by_score)
  const criticalByScore = bigintToNumber(r.critical_by_score)
  const noData = bigintToNumber(r.no_data)
  const excludedUnused = bigintToNumber(r.excluded_unused)
  const excludedNonStandard = bigintToNumber(r.excluded_nonstandard)

  const totalStrings = healthy + abnormalByScore + criticalByScore + noData

  const warnings: Warning[] = []
  if (totalStrings === 0) {
    warnings.push(isToday
      ? {
          code: 'NO_DATA_TODAY',
          message: 'No string scores yet for today (PKT). Scores appear once plants start producing after sunrise.',
        }
      : {
          code: 'NO_DATA_YESTERDAY',
          message: orgId
            ? 'No string data for this organization on the previous day.'
            : 'No string data across the fleet on the previous day.',
        })
  }

  const startsAt = date
  // Today's window is still open — it ends "now", not at PKT midnight.
  const endsAt = isToday ? new Date() : new Date(date.getTime() + 24 * 60 * 60 * 1000)

  return {
    totalStrings,
    counts: {
      healthy,
      abnormal: abnormalByScore + noData,
      critical: criticalByScore,
      noData,
    },
    breakdown: {
      healthy: { byScore: healthy },
      abnormal: { byScore: abnormalByScore, noData },
      critical: { byScore: criticalByScore, openCircuit: 0 },
    },
    excluded: { unused: excludedUnused, nonStandard: excludedNonStandard },
    timeBasis: {
      label: isToday
        ? `Today · ${formatPktDateLabel(date)} · live`
        : `Yesterday · ${formatPktDateLabel(date)}`,
      startsAt,
      endsAt,
    },
    freshness: {
      lastDataAt: totalStrings > 0 ? endsAt : null,
      coveragePct: totalStrings > 0 ? 100 : 0,
    },
    warnings,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fleet: paginated per-string rows (for NOC table)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FleetRowSql {
  org_id: string
  org_name: string
  plant_code: string
  plant_name: string
  device_id: string
  inverter_name: string | null
  string_number: number
  health_score: Prisma.Decimal | number | null
}

interface FleetRowCountSql {
  total: bigint
}

export interface LoadFleetRowsParams {
  orgId?: string
  /** Back-compat single bucket (NOC v2). Superseded by `buckets`. */
  bucket?: DonutBucket
  /** OR-set within the health facet (NOC v3). */
  buckets?: DonutBucket[]
  /** Restrict rows to these devices (computed from the connectivity facet). */
  deviceIds?: string[]
  /** Case-insensitive match on plant name / plant code / inverter name. */
  q?: string
  page?: number
  /** PKT date (UTC midnight) of the string_daily rows to read. Defaults to
   *  yesterday (settled). Pass getPktTodayDate() for the live intraday view. */
  date?: Date
}

/** One health bucket → its score predicate (shared by rows + facet helpers).
 *  3-band rebrand: cutpoints from PERF_NORMAL/PERF_CRITICAL — the same source as
 *  the /analysis classifier, so the NOC facet filter and the cells agree.
 *  healthy ≥85; critical <50; abnormal [50,85) OR NULL (no-data). */
function bucketCondition(bucket: DonutBucket): Prisma.Sql {
  switch (bucket) {
    case 'healthy':
      return Prisma.sql`(sd.health_score IS NOT NULL AND sd.health_score >= ${PERF_NORMAL})`
    case 'critical':
      return Prisma.sql`(sd.health_score IS NOT NULL AND sd.health_score < ${PERF_CRITICAL})`
    case 'abnormal':
      // Abnormal = [PERF_CRITICAL, PERF_NORMAL) OR NULL health_score (no-data).
      return Prisma.sql`(
        (sd.health_score IS NOT NULL AND sd.health_score >= ${PERF_CRITICAL} AND sd.health_score < ${PERF_NORMAL})
        OR sd.health_score IS NULL
      )`
  }
}

/** Shared facet WHERE fragments (NOC v3 faceted filtering: AND across facets,
 *  OR within the health facet). Used by rows, counts, and facet helpers so the
 *  donuts and the table always agree. */
function fleetFacetWheres(params: {
  orgId?: string
  buckets?: DonutBucket[]
  deviceIds?: string[]
  q?: string
}): Prisma.Sql[] {
  const wheres: Prisma.Sql[] = []
  if (params.orgId != null) {
    wheres.push(Prisma.sql`pa.organization_id = ${params.orgId}`)
  }
  if (params.buckets && params.buckets.length > 0) {
    wheres.push(Prisma.sql`(${Prisma.join(params.buckets.map(bucketCondition), ' OR ')})`)
  }
  if (params.deviceIds) {
    // Empty list = the connectivity facet matched nothing → match no rows.
    wheres.push(Prisma.sql`sd.device_id = ANY(${params.deviceIds})`)
  }
  if (params.q && params.q.trim() !== '') {
    const like = `%${params.q.trim()}%`
    wheres.push(Prisma.sql`(p.plant_name ILIKE ${like} OR p.id ILIKE ${like} OR d.device_name ILIKE ${like})`)
  }
  return wheres
}

export async function loadFleetRows(params: LoadFleetRowsParams = {}): Promise<FleetRowsPage> {
  const date = params.date ?? getPktYesterdayDate()
  const page = Math.max(1, params.page ?? 1)
  const offset = (page - 1) * FLEET_PAGE_SIZE

  // Back-compat: single `bucket` (NOC v2) folds into the OR-set.
  const buckets = params.buckets ?? (params.bucket ? [params.bucket] : undefined)

  // Build the WHERE clause via Prisma.sql composition for safe parameterization.
  // Note: org filtering goes through plant_assignments (M2M); see schema.prisma.
  const wheres: Prisma.Sql[] = [
    Prisma.sql`sd.date = ${date}`,
    Prisma.sql`COALESCE(sc.is_used, true) = true`,
    Prisma.sql`COALESCE(sc.exclude_from_peer_comparison, false) = false`,
    ...fleetFacetWheres({ orgId: params.orgId, buckets, deviceIds: params.deviceIds, q: params.q }),
  ]
  const where = Prisma.sql`WHERE ${Prisma.join(wheres, ' AND ')}`

  // Inner DISTINCT ON dedupes rows when a plant belongs to multiple orgs (M2M
  // via plant_assignments) and orgFilter is not set; the outer SELECT re-sorts
  // worst-first — the triage default per the NOC v3 spec. NULL health_score
  // (no-data) is bucketed ABNORMAL by scoreToBucket/the donut, so it must sort
  // within the abnormal band (after scored abnormals, BEFORE healthy) — never
  // below healthy. 3-band cutpoints: criticals (<50) first, scored abnormals
  // [50,85) ascending — no-data pinned at 84.99 sits inside that abnormal band
  // (between 50 and 85) — then healthy (>=85). DISTINCT ON requires its own
  // ORDER BY to lead with the distinct keys, hence two layers.
  const items = await prisma.$queryRaw<FleetRowSql[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (sd.device_id, sd.string_number)
        o.id           as org_id,
        o.name         as org_name,
        p.id           as plant_code,
        p.plant_name   as plant_name,
        sd.device_id,
        d.device_name  as inverter_name,
        sd.string_number,
        sd.health_score
      FROM string_daily sd
      LEFT JOIN string_configs sc
        ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
      JOIN plants p ON p.id = sd.plant_id
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN plant_assignments pa ON pa.plant_id = p.id
      LEFT JOIN organizations o ON o.id = pa.organization_id
      ${where}
      ORDER BY sd.device_id, sd.string_number, o.name, p.plant_name, d.device_name
    ) AS deduped
    ORDER BY
      CASE WHEN deduped.health_score IS NULL THEN 84.99 ELSE deduped.health_score END ASC,
      deduped.plant_name, deduped.inverter_name, deduped.string_number
    LIMIT ${FLEET_PAGE_SIZE}
    OFFSET ${offset}
  `

  const countRows = await prisma.$queryRaw<FleetRowCountSql[]>`
    SELECT COUNT(*)::bigint AS total
    FROM (
      SELECT DISTINCT sd.device_id, sd.string_number
      FROM string_daily sd
      LEFT JOIN string_configs sc
        ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
      JOIN plants p ON p.id = sd.plant_id
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN plant_assignments pa ON pa.plant_id = p.id
      ${where}
    ) AS distinct_rows
  `

  const total = countRows.length > 0 ? bigintToNumber(countRows[0].total) : 0

  return {
    page,
    pageSize: FLEET_PAGE_SIZE,
    total,
    items: items.map((r) => {
      const score = decimalToNumberOrNull(r.health_score)
      // Plant has no organization assignment → show as Unassigned so the NOC
      // operator knows the string is real but not yet attached to an org.
      const orgId = r.org_id ?? ''
      const orgName = r.org_name ?? 'Unassigned'
      return {
        orgId,
        orgName,
        plantCode: r.plant_code,
        plantName: r.plant_name,
        deviceId: r.device_id,
        inverterName: r.inverter_name ?? r.device_id,
        stringNumber: r.string_number,
        healthScore: score,
        bucket: scoreToBucket(score),
      }
    }),
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fleet: inverter connectivity rollup (live / frozen / offline / idle)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Same Live/Frozen/Offline/Idle classification as the per-plant API
// (app/api/plants/[code]/route.ts), rolled up across the whole fleet for the
// NOC. Per device we combine three signals: the vendor's data timestamp and
// our value-change timestamp (effectiveFreshAt = max of the two), MAX(
// string_measurements.timestamp) for when WE last wrote a row, and the sun
// gate (isDaylight) from the device's plant lat/long.

interface FleetConnectivityRow {
  device_id: string
  plant_code: string
  plant_name: string | null
  inverter_name: string | null
  provider: string
  vendor_last_data_at: Date | null
  reading_changed_at: Date | null
  last_seen_at: Date | null
  last_write_at: Date | null
  latitude: Prisma.Decimal | number | null
  longitude: Prisma.Decimal | number | null
}

export async function loadFleetConnectivity(orgId?: string): Promise<FleetConnectivity> {
  const orgFilter = orgId ?? null
  const now = Date.now()

  // One row per device. last_write_at = MAX(string_measurements.timestamp) via
  // a correlated subquery (index: string_measurements(device_id, timestamp DESC)).
  // DISTINCT so a plant assigned to multiple orgs isn't double-counted when no
  // org filter is set; LEFT JOIN plant_assignments so orphan plants still show.
  const rows = await prisma.$queryRaw<FleetConnectivityRow[]>`
    SELECT DISTINCT
      d.id              AS device_id,
      d.plant_id        AS plant_code,
      p.plant_name      AS plant_name,
      d.device_name     AS inverter_name,
      d.provider        AS provider,
      d.vendor_last_data_at,
      d.reading_changed_at,
      d.last_seen_at,
      -- last_seen_at is stamped every poll cycle (even on gated skips), so
      -- the expensive correlated MAX() probe against the 4M-row measurements
      -- table only runs for devices never seen since the column shipped —
      -- a set that empties after one daylight cycle. COALESCE evaluates its
      -- arguments lazily. (CQ audit 2026-06-05 finding #2.)
      COALESCE(
        d.last_seen_at,
        (SELECT MAX(sm.timestamp) FROM string_measurements sm WHERE sm.device_id = d.id)
      )                 AS last_write_at,
      p.latitude        AS latitude,
      p.longitude       AS longitude
    FROM devices d
    JOIN plants p ON p.id = d.plant_id
    LEFT JOIN plant_assignments pa ON pa.plant_id = d.plant_id
    WHERE (${orgFilter}::text IS NULL OR pa.organization_id = ${orgFilter}::text)
  `

  const counts = { live: 0, frozen: 0, offline: 0, idle: 0 }
  const devices: FleetConnectivityDevice[] = rows.map((r) => {
    // Coords clamped to the Pakistan bounding box (fleet default for missing
    // OR garbage values). Vendor-default Beijing coords would otherwise hit
    // "Beijing sunrise" at ~01:45 PKT and flag sleeping inverters OFFLINE for
    // the rest of the night (seen live on Zahoor Diary Farm, 2026-06-05).
    const { lat, lng } = clampToFleetCoords(r.latitude, r.longitude)
    const sunUp = isDaylight(lat, lng, new Date(now))
    // "Last contact" = newest of last_seen_at (poll cycle saw the device, even
    // when the write gate skipped a duplicate replay) and MAX(measurement ts)
    // (pre-gate fallback until last_seen_at populates). Keeps frozen (still
    // seen, values stuck) distinguishable from offline (gone) now that frozen
    // feeds no longer produce measurement rows.
    const seenMs = r.last_seen_at?.getTime() ?? null
    const writeMs = r.last_write_at?.getTime() ?? null
    const lastContactMs = seenMs == null && writeMs == null ? null : Math.max(seenMs ?? 0, writeMs ?? 0)
    const conn = deviceConnectivity(
      { vendor_last_data_at: r.vendor_last_data_at, reading_changed_at: r.reading_changed_at },
      lastContactMs,
      sunUp,
      now,
      { lat, lng }, // clamped — lets a noon-dead feed stay frozen through the night
    )
    counts[conn.status] += 1
    return {
      deviceId: r.device_id,
      plantCode: r.plant_code,
      plantName: r.plant_name ?? r.plant_code,
      inverterName: r.inverter_name ?? r.device_id,
      provider: r.provider,
      status: conn.status,
      effectiveFreshAt: conn.effectiveFreshAt ? conn.effectiveFreshAt.toISOString() : null,
    }
  })

  return { counts, devices }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Status Unification: plant-level operational status (ONE engine, every screen)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Unified plant status for EVERY plant (device-less plants → 'offline').
 *  Derived from the per-device connectivity engine + vendor-fault overlay via
 *  rollupPlantStatus — the same truth the NOC shows, rolled up per plant.
 *  Pages must consume this instead of inventing local status recipes.
 *  Pass a preloaded connectivity to avoid a second fleet scan when the caller
 *  already has one (e.g. /api/admin/dashboard). */
export async function loadPlantOpStatuses(preloaded?: FleetConnectivity): Promise<Map<string, PlantOpStatus>> {
  const [conn, healthRows] = await Promise.all([
    preloaded ?? loadFleetConnectivity(),
    prisma.plants.findMany({ select: { id: true, health_state: true } }),
  ])
  const devicesByPlant = new Map<string, ConnectivityStatus[]>()
  for (const d of conn.devices) {
    const arr = devicesByPlant.get(d.plantCode) ?? []
    arr.push(d.status)
    devicesByPlant.set(d.plantCode, arr)
  }
  const out = new Map<string, PlantOpStatus>()
  for (const p of healthRows) {
    out.set(p.id, rollupPlantStatus(devicesByPlant.get(p.id) ?? [], p.health_state))
  }
  return out
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOC v3 facet helpers + KPI / Needs-Attention rollups
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Device ids having ≥1 string in the selected health buckets (under org + q).
 *  Used to recompute the CONNECTIVITY donut under the health facet. */
export async function loadDeviceIdsForBuckets(params: {
  orgId?: string
  buckets: DonutBucket[]
  q?: string
  /** PKT date (UTC midnight) of string_daily to read; defaults to yesterday. */
  date?: Date
}): Promise<string[]> {
  if (params.buckets.length === 0) return []
  const date = params.date ?? getPktYesterdayDate()
  const wheres: Prisma.Sql[] = [
    Prisma.sql`sd.date = ${date}`,
    Prisma.sql`COALESCE(sc.is_used, true) = true`,
    Prisma.sql`COALESCE(sc.exclude_from_peer_comparison, false) = false`,
    ...fleetFacetWheres({ orgId: params.orgId, buckets: params.buckets, q: params.q }),
  ]
  const rows = await prisma.$queryRaw<Array<{ device_id: string }>>`
    SELECT DISTINCT sd.device_id
    FROM string_daily sd
    LEFT JOIN string_configs sc
      ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
    JOIN plants p ON p.id = sd.plant_id
    JOIN devices d ON d.id = sd.device_id
    LEFT JOIN plant_assignments pa ON pa.plant_id = sd.plant_id
    WHERE ${Prisma.join(wheres, ' AND ')}
  `
  return rows.map((r) => r.device_id)
}

export interface CritPerPlant {
  plantCode: string
  plantName: string
  crit: number
}

/** Critical-string count per plant (org-scoped, unfaceted — feeds KPIs + Needs-Attention). */
export async function loadCritStringsPerPlant(orgId?: string, date?: Date): Promise<CritPerPlant[]> {
  const scoreDate = date ?? getPktYesterdayDate()
  const orgFilter = orgId ?? null
  const rows = await prisma.$queryRaw<Array<{ plant_code: string; plant_name: string; crit: bigint }>>`
    SELECT p.id AS plant_code, p.plant_name, COUNT(DISTINCT (sd.device_id, sd.string_number))::bigint AS crit
    FROM string_daily sd
    LEFT JOIN string_configs sc
      ON sc.device_id = sd.device_id AND sc.string_number = sd.string_number
    JOIN plants p ON p.id = sd.plant_id
    LEFT JOIN plant_assignments pa ON pa.plant_id = sd.plant_id
    WHERE sd.date = ${scoreDate}
      AND COALESCE(sc.is_used, true) = true
      AND COALESCE(sc.exclude_from_peer_comparison, false) = false
      -- 3-band critical = health_score < PERF_CRITICAL (50).
      AND sd.health_score IS NOT NULL AND sd.health_score < ${PERF_CRITICAL}
      AND (${orgFilter}::text IS NULL OR pa.organization_id = ${orgFilter}::text)
    GROUP BY p.id, p.plant_name
  `
  return rows.map((r) => ({ plantCode: r.plant_code, plantName: r.plant_name, crit: bigintToNumber(r.crit) }))
}

export interface FleetKpis {
  /** null in Yesterday·settled mode — connectivity is a live-only signal and
   *  has no historical snapshot; mixing it under a "Yesterday" header would
   *  put two time bases on one screen. */
  offlineInverters: number | null
  frozenInverters: number | null
  criticalStrings: number
  plantsWithIssues: number
  livePct: number | null // null when no reporting (non-idle) devices or Yesterday mode
}

export interface AttentionPlant {
  plantCode: string
  plantName: string
  critStrings: number
  frozen: number
  offline: number
  /** Oldest effectiveFreshAt among this plant's frozen/offline devices (ISO) — "down since". */
  worstSince: string | null
  score: number
}

/** Pure: assemble the KPI strip from the (org-scoped, unfaceted) connectivity
 *  rollup + critical-strings-per-plant. KPIs deliberately ignore donut facets —
 *  they describe the fleet state, and each acts as a one-click quick filter.
 *
 *  connectivity = null → Yesterday·settled mode: the strip is health-only
 *  (plantsWithIssues = plants with critical strings, no conn union) so the
 *  whole page stays on ONE time basis. */
export function buildFleetKpis(connectivity: FleetConnectivity | null, critPerPlant: CritPerPlant[]): FleetKpis {
  const criticalStrings = critPerPlant.reduce((a, p) => a + p.crit, 0)
  const plantsWithCrit = new Set(critPerPlant.filter((p) => p.crit > 0).map((p) => p.plantCode))
  if (connectivity === null) {
    return {
      offlineInverters: null,
      frozenInverters: null,
      criticalStrings,
      plantsWithIssues: plantsWithCrit.size,
      livePct: null,
    }
  }
  const { live, frozen, offline } = connectivity.counts
  const reporting = live + frozen + offline
  const plantsWithConnIssues = new Set(
    connectivity.devices.filter((d) => d.status === 'frozen' || d.status === 'offline').map((d) => d.plantCode),
  )
  const plantsWithIssues = new Set([...plantsWithConnIssues, ...plantsWithCrit]).size
  return {
    offlineInverters: offline,
    frozenInverters: frozen,
    criticalStrings,
    plantsWithIssues,
    livePct: reporting > 0 ? Math.round((live / reporting) * 1000) / 10 : null,
  }
}

/** Pure: rank plants needing attention. score = crit×1 + frozen×2 + offline×3
 *  (offline is the most actionable signal: nothing is being received at all).
 *  connectivity = null → Yesterday·settled mode: ranks by critical strings
 *  only (no live signals on a settled view). */
export function buildAttention(
  connectivity: FleetConnectivity | null,
  critPerPlant: CritPerPlant[],
  limit = 8,
): AttentionPlant[] {
  const byPlant = new Map<string, AttentionPlant>()
  const ensure = (plantCode: string, plantName: string): AttentionPlant => {
    let p = byPlant.get(plantCode)
    if (!p) {
      p = { plantCode, plantName, critStrings: 0, frozen: 0, offline: 0, worstSince: null, score: 0 }
      byPlant.set(plantCode, p)
    }
    return p
  }
  for (const c of critPerPlant) {
    if (c.crit > 0) ensure(c.plantCode, c.plantName).critStrings = c.crit
  }
  for (const d of connectivity?.devices ?? []) {
    if (d.status !== 'frozen' && d.status !== 'offline') continue
    const p = ensure(d.plantCode, d.plantName)
    if (d.status === 'frozen') p.frozen += 1
    else p.offline += 1
    if (d.effectiveFreshAt && (p.worstSince === null || d.effectiveFreshAt < p.worstSince)) {
      p.worstSince = d.effectiveFreshAt
    }
  }
  const ranked = [...byPlant.values()]
    .map((p) => ({ ...p, score: p.critStrings + p.frozen * 2 + p.offline * 3 }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || (a.worstSince ?? 'z').localeCompare(b.worstSince ?? 'z'))
  return ranked.slice(0, limit)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Org list (for the NOC filter dropdown)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface OrgListRow {
  id: string
  name: string
  string_count: bigint
}

export async function loadOrgList(date?: Date): Promise<Array<{ id: string; name: string; stringCount: number }>> {
  // The dropdown count is "strings with scores on the page's date" — scoped to
  // the SAME time basis as everything else (one basis per screen, by design).
  // In Today mode before sunrise this reads (0) for every org; the page-level
  // NO_DATA_TODAY warning explains why, so the zeros are coherent, not broken.
  const scoreDate = date ?? getPktYesterdayDate()

  // Walk organizations → plant_assignments → string_daily. M2M join means a
  // plant assigned to two orgs contributes to both orgs' counts (correct: each
  // org "sees" that plant's strings).
  const rows = await prisma.$queryRaw<OrgListRow[]>`
    SELECT
      o.id,
      o.name,
      COUNT(sd.id)::bigint as string_count
    FROM organizations o
    LEFT JOIN plant_assignments pa ON pa.organization_id = o.id
    LEFT JOIN string_daily sd
      ON sd.plant_id = pa.plant_id AND sd.date = ${scoreDate}
    GROUP BY o.id, o.name
    ORDER BY o.name
  `

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stringCount: bigintToNumber(r.string_count),
  }))
}
