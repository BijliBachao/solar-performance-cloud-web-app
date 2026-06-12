import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getUserFromRequest,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import {
  loadPlantDonutPrevDay,
  loadPlantDonutToday,
} from '@/lib/donut-data-loader'

/**
 * GET /api/plants/{code}/string-health-donut?mode=prev-day|today
 *
 * Per-plant string-health donut data. Used by StringHealthDonut on the plant
 * detail pages (admin + dashboard). All business logic lives in the loader;
 * this route handles auth, validation, response shaping, and cache headers.
 *
 * V1 cutover (Task 10): the live mode is now `today` — it reads today's PKT
 * string_daily (recomputed every poll cycle) via the SAME V1 classifier as the
 * NOC "today" donut and the /analysis today cell, so all three agree. The old
 * SR-anchored `last-3h` mode was retired.
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §4a
 */

const querySchema = z.object({
  mode: z.enum(['prev-day', 'today']),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({ mode: url.searchParams.get('mode') })
    if (!parsed.success) {
      throw new ApiAuthError(
        `Invalid query: mode must be "prev-day" or "today"`,
        400,
        'INVALID_QUERY',
      )
    }

    const mode = parsed.data.mode
    const result = mode === 'prev-day'
      ? await loadPlantDonutPrevDay(params.code)
      : await loadPlantDonutToday(params.code)

    const cacheSeconds = mode === 'prev-day' ? 300 : 60

    return new Response(
      JSON.stringify({ mode, ...result }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `private, max-age=${cacheSeconds}, stale-while-revalidate=60`,
        },
      },
    )
  } catch (err) {
    if (err instanceof ApiAuthError) return createErrorResponse(err)
    // Unexpected — log it for ops, return a sanitized 500
    console.error('[string-health-donut] unexpected error:', err)
    return createErrorResponse(
      new ApiAuthError('Internal error loading donut data', 500, 'INTERNAL_ERROR'),
    )
  }
}
