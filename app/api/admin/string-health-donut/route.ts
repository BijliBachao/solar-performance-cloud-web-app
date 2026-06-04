import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getUserFromRequest,
  requireRole,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import {
  loadFleetCounts,
  loadFleetRows,
  loadFleetConnectivity,
  loadDeviceIdsForBuckets,
  loadCritStringsPerPlant,
  buildFleetKpis,
  buildAttention,
  loadOrgList,
  getPktTodayDate,
  getPktYesterdayDate,
  type FleetConnectivity,
} from '@/lib/donut-data-loader'
import type { ConnectivityStatus } from '@/lib/string-health'
import type { DonutBucket } from '@/lib/string-health-donut'

/**
 * GET /api/admin/string-health-donut?mode=today|prev-day
 *   &org=<id>            — organization facet
 *   &buckets=critical,abnormal — health facet (CSV, OR within facet) [NOC v3]
 *   &bucket=<b>          — back-compat single health bucket (NOC v2)
 *   &conn=offline,frozen — connectivity facet (CSV, OR within facet) [NOC v3, mode=today ONLY]
 *   &q=<text>            — search facet (plant name/code, inverter name) [NOC v3]
 *   &page=<n>
 *
 * Fleet triage console (/admin/noc), SUPER_ADMIN only.
 *
 * TIME-BASIS CONSISTENCY (NOC v3.1): the page never mixes time bases.
 *   mode=today    — health scores from TODAY's string_daily rows (the poller
 *                   recomputes them every ~5 min, settling by end of day) +
 *                   live connectivity. Everything on screen = "now".
 *   mode=prev-day — YESTERDAY's settled scores only. Connectivity is a
 *                   live-only signal with no historical snapshot, so it is
 *                   NOT loaded and `connectivity` is null; the conn facet is
 *                   rejected (400); KPIs/attention are health-only.
 *
 * Facet semantics (NOC v3 spec, docs/superpowers/specs/2026-06-04-*.md):
 * AND across facets, OR within a facet. Coordinated views: each donut
 * recomputes under the OTHER facets but never under its own —
 *   health donut  = counts under org ∧ q ∧ connectivity-selection
 *   conn   donut  = device statuses under org ∧ q ∧ health-selection
 *   rows (table)  = org ∧ q ∧ health-selection ∧ connectivity-selection
 * KPIs + attention are org-scoped only (fleet state, used as quick filters).
 */

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(allowed as unknown as [T, ...T[]])).min(1))
    .optional()

const querySchema = z
  .object({
    mode: z.enum(['today', 'prev-day']),
    org: z.string().min(1).optional(),
    bucket: z.enum(['healthy', 'abnormal', 'critical']).optional(),
    buckets: csv(['healthy', 'abnormal', 'critical'] as const),
    conn: csv(['live', 'frozen', 'offline', 'idle'] as const),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  // Connectivity has no yesterday snapshot — filtering yesterday's scores by
  // today's connectivity would silently mix time bases. Hard-reject.
  .refine((v) => v.mode === 'today' || v.conn === undefined, {
    message: 'conn facet requires mode=today',
  })

/** Re-tally a connectivity rollup against a device-id allowlist + q (in JS —
 *  the per-device statuses are already classified; facets only narrow them). */
function facetConnectivity(
  full: FleetConnectivity,
  allowedDeviceIds: Set<string> | null,
  q: string | undefined,
): FleetConnectivity {
  const needle = q?.trim().toLowerCase()
  const devices = full.devices.filter((d) => {
    if (allowedDeviceIds && !allowedDeviceIds.has(d.deviceId)) return false
    if (needle) {
      const hay = `${d.plantName}\n${d.plantCode}\n${d.inverterName}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  const counts = { live: 0, frozen: 0, offline: 0, idle: 0 }
  for (const d of devices) counts[d.status] += 1
  return { counts, devices }
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    // NOC is internal-team only; matches the pattern used by every other
    // /api/admin/* route in this codebase.
    requireRole(userContext, ['SUPER_ADMIN'])

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      mode: url.searchParams.get('mode'),
      org: url.searchParams.get('org') ?? undefined,
      bucket: url.searchParams.get('bucket') ?? undefined,
      buckets: url.searchParams.get('buckets') ?? undefined,
      conn: url.searchParams.get('conn') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
    })
    if (!parsed.success) {
      throw new ApiAuthError(
        'Invalid query: mode must be "today" or "prev-day"; buckets ∈ healthy|abnormal|critical; conn ∈ live|frozen|offline|idle (mode=today only); page must be a positive integer',
        400,
        'INVALID_QUERY',
      )
    }

    const { mode, org, bucket, page, q } = parsed.data
    // Back-compat: single `bucket` folds into the buckets OR-set.
    const buckets: DonutBucket[] | undefined =
      parsed.data.buckets ?? (bucket ? [bucket] : undefined)
    const conn: ConnectivityStatus[] | undefined = parsed.data.conn

    const isToday = mode === 'today'
    // ONE date drives every health query in this request — the consistency
    // guarantee. Today = intraday-updating scores; prev-day = settled.
    const date = isToday ? getPktTodayDate() : getPktYesterdayDate()

    // Stage 1 (parallel): full org-scoped connectivity (today mode only —
    // classifies every device once, facet narrowing happens in JS), the
    // health-facet device set (only when needed for the conn donut recompute),
    // org-scoped crit-per-plant, org list.
    const [fullConnectivity, bucketDeviceIds, critPerPlant, orgs] = await Promise.all([
      isToday ? loadFleetConnectivity(org) : Promise.resolve(null),
      isToday && buckets && buckets.length > 0
        ? loadDeviceIdsForBuckets({ orgId: org, buckets, q, date })
        : Promise.resolve(null),
      loadCritStringsPerPlant(org, date),
      loadOrgList(date),
    ])

    // Devices matching the CONNECTIVITY selection (for the table + health donut).
    const connDeviceIds: string[] | undefined =
      fullConnectivity && conn && conn.length > 0
        ? fullConnectivity.devices.filter((d) => conn.includes(d.status)).map((d) => d.deviceId)
        : undefined

    // Stage 2 (parallel): table rows under ALL facets; health-donut counts
    // under org ∧ q ∧ connectivity (not under its own bucket selection).
    const [counts, rows] = await Promise.all([
      loadFleetCounts(org, { q, deviceIds: connDeviceIds, date }),
      loadFleetRows({ orgId: org, buckets, deviceIds: connDeviceIds, q, page, date }),
    ])

    // Connectivity donut under org ∧ q ∧ health-selection (not its own).
    // Yesterday·settled mode: null — live-only signal, never shown there.
    const connectivity = fullConnectivity
      ? facetConnectivity(fullConnectivity, bucketDeviceIds ? new Set(bucketDeviceIds) : null, q)
      : null

    // KPI strip + Needs-Attention: org-scoped fleet state, independent of
    // facets. Health-only when connectivity is absent (prev-day mode).
    const kpis = buildFleetKpis(fullConnectivity, critPerPlant)
    const attention = buildAttention(fullConnectivity, critPerPlant)

    return new Response(
      JSON.stringify({ mode, ...counts, rows, connectivity, kpis, attention, orgs }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Today is a live triage view on a 60s client poll — keep the HTTP
          // cache window short. Yesterday is settled and can sit longer.
          'Cache-Control': isToday
            ? 'private, max-age=30, stale-while-revalidate=30'
            : 'private, max-age=300, stale-while-revalidate=60',
        },
      },
    )
  } catch (err) {
    if (err instanceof ApiAuthError) return createErrorResponse(err)
    console.error('[admin/string-health-donut] unexpected error:', err)
    return createErrorResponse(
      new ApiAuthError('Internal error loading NOC data', 500, 'INTERNAL_ERROR'),
    )
  }
}
