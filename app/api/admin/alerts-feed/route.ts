import { NextRequest, NextResponse } from 'next/server'
import {
  getUserFromRequest,
  requireRole,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { serverError } from '@/lib/api-errors'
import { VALID_SEVERITIES } from '@/lib/api-validation'
import { PROVIDERS } from '@/lib/constants'
import { buildAlertsFeed, type AlertsFeedResult, type FeedItem } from '@/lib/alerts-feed'

/**
 * GET /api/admin/alerts-feed
 *
 * Thin admin wrapper over the shared `buildAlertsFeed` builder. Merges our
 * computed `alerts` (kind=system) with the inverters' own `vendor_alarms`
 * (kind=vendor) into ONE time-sorted, paginated feed. SUPER_ADMIN only.
 *
 * Sees ALL orgs by default (allowedPlantIds=null). The optional `organization`
 * param scopes the feed to one org's plants. Org fields are populated on every
 * row (includeOrg=true) so the admin UI can show the org breadcrumb.
 *
 * Filters: kind / provider / severity / resolved / q + organization.
 */

// Re-export the shared types so existing importers of this route keep working.
export type { FeedItem, AlertsFeedResult }

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const sp = request.nextUrl.searchParams

    // ── Params (all optional) ──────────────────────────────────────────
    const kindParam = sp.get('kind') || 'all'
    const kind: 'system' | 'vendor' | 'all' =
      kindParam === 'system' || kindParam === 'vendor' ? kindParam : 'all'

    const provider = sp.get('provider')?.trim() || ''
    const severity = sp.get('severity')?.trim() || ''
    const resolved = (sp.get('resolved') || 'false') as 'true' | 'false' | 'all'
    const q = (sp.get('q') || '').trim()
    const organization = sp.get('organization')?.trim() || ''

    const pageRaw = parseInt(sp.get('page') || '1', 10)
    const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1
    const sizeRaw = parseInt(sp.get('pageSize') || '50', 10)
    const pageSize = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? Math.min(sizeRaw, 100) : 50

    // Validate severity against the shared vocab — a typo used to silently
    // return 0 rows with 200 OK; surface it as a 400 instead.
    if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 },
      )
    }

    // Same for provider — use the canonical PROVIDERS set (csi is valid but
    // absent from VALID_PROVIDERS). The builder treats provider opaquely, so
    // new vendors only need to land in PROVIDERS to be accepted here.
    const allowedProviders = Object.values(PROVIDERS) as string[]
    if (provider && !allowedProviders.includes(provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${allowedProviders.join(', ')}` },
        { status: 400 },
      )
    }

    // Optional org scope: resolve that org's plant_ids. An org with no plants
    // yields [] → the builder returns an empty feed (never falls open). No org
    // param → null = ALL plants.
    let allowedPlantIds: string[] | null = null
    if (organization) {
      const assignments = await prisma.plant_assignments.findMany({
        where: { organization_id: organization },
        select: { plant_id: true },
      })
      allowedPlantIds = assignments.map((a) => a.plant_id)
    }

    const result = await buildAlertsFeed({
      allowedPlantIds,
      includeOrg: true,
      kind,
      provider,
      severity,
      resolved,
      q,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Alerts Feed GET', error)
  }
}
