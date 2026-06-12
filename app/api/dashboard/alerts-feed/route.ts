import { NextRequest, NextResponse } from 'next/server'
import {
  getUserFromRequest,
  requireOrganization,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { serverError } from '@/lib/api-errors'
import { VALID_SEVERITIES } from '@/lib/api-validation'
import { PROVIDERS } from '@/lib/constants'
import { buildAlertsFeed } from '@/lib/alerts-feed'

/**
 * GET /api/dashboard/alerts-feed
 *
 * Customer-facing, tenant-scoped notification feed. Same shared builder as the
 * admin feed (lib/alerts-feed.ts), merging our computed `alerts` (kind=system)
 * with the inverters' own `vendor_alarms` (kind=vendor).
 *
 * SECURITY: requireOrganization, then resolve the caller org's plant_ids from
 * plant_assignments and pass them as `allowedPlantIds` — THE tenancy boundary.
 * The builder scopes BOTH sources to those plants, so a row outside the org's
 * plants can never be returned. An org with no plants yields [] → empty feed
 * (the builder short-circuits; it never falls open to an unscoped query).
 *
 * includeOrg=false → a customer never sees the org breadcrumb. Read-only:
 * resolve is an admin action and lives on the admin surface only.
 *
 * Filters: kind / provider / severity / resolved / q. Same validation +
 * response shape as the admin feed.
 */
export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)

    const sp = request.nextUrl.searchParams

    const kindParam = sp.get('kind') || 'all'
    const kind: 'system' | 'vendor' | 'all' =
      kindParam === 'system' || kindParam === 'vendor' ? kindParam : 'all'

    const provider = sp.get('provider')?.trim() || ''
    const severity = sp.get('severity')?.trim() || ''
    const resolved = (sp.get('resolved') || 'false') as 'true' | 'false' | 'all'
    const q = (sp.get('q') || '').trim()

    const pageRaw = parseInt(sp.get('page') || '1', 10)
    const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1
    const sizeRaw = parseInt(sp.get('pageSize') || '50', 10)
    const pageSize = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? Math.min(sizeRaw, 100) : 50

    // Validate severity + provider exactly as the admin feed (400 on a typo,
    // which would otherwise silently return 0 rows with 200 OK).
    if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 },
      )
    }
    const allowedProviders = Object.values(PROVIDERS) as string[]
    if (provider && !allowedProviders.includes(provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${allowedProviders.join(', ')}` },
        { status: 400 },
      )
    }

    // THE security boundary — only this org's assigned plant_ids.
    const assignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! },
      select: { plant_id: true },
    })
    const orgPlantIds = assignments.map((a) => a.plant_id)

    const result = await buildAlertsFeed({
      allowedPlantIds: orgPlantIds,
      includeOrg: false,
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
    return serverError('Dashboard Alerts Feed GET', error)
  }
}
