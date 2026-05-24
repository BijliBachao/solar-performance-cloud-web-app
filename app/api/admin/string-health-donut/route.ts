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
  loadOrgList,
} from '@/lib/donut-data-loader'

/**
 * GET /api/admin/string-health-donut?mode=prev-day&org=<id>&bucket=<b>&page=<n>
 *
 * Fleet-wide string-health donut for the NOC console (/admin/noc).
 * SUPER_ADMIN only. Aggregates across all orgs by default; ?org filter
 * narrows to one. ?bucket filter narrows the rows list (counts always
 * show the full distribution).
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §4b
 */

const querySchema = z.object({
  mode: z.literal('prev-day'),
  org: z.string().min(1).optional(),
  bucket: z.enum(['healthy', 'abnormal', 'critical']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})

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
      page: url.searchParams.get('page') ?? undefined,
    })
    if (!parsed.success) {
      throw new ApiAuthError(
        'Invalid query: mode must be "prev-day"; bucket must be healthy|abnormal|critical; page must be a positive integer',
        400,
        'INVALID_QUERY',
      )
    }

    const { mode, org, bucket, page } = parsed.data

    // Parallel: counts (donut), rows (table), orgs (filter dropdown)
    const [counts, rows, orgs] = await Promise.all([
      loadFleetCounts(org),
      loadFleetRows({ orgId: org, bucket, page }),
      loadOrgList(),
    ])

    return new Response(
      JSON.stringify({ mode, ...counts, rows, orgs }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
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
