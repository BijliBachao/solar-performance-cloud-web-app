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

/**
 * GET /api/admin/alerts-feed
 *
 * ONE unified notification feed merging the two alert sources:
 *   - system  → our computed `alerts` (string health / performance / DQ)
 *   - vendor  → the inverters' OWN faults from `vendor_alarms`
 *
 * Both are normalized to a single row shape, merged in memory, sorted by
 * started_at DESC, then paginated. SUPER_ADMIN only.
 *
 * RDS-friendly: each source is bounded by its filters + a SOURCE_CAP of the
 * most-recent rows before the in-memory merge, so a busy fleet can never pull
 * an unbounded result set into the API process.
 */

// Per-source ceiling pulled into memory before merge/sort/paginate.
const SOURCE_CAP = 500

export type FeedKind = 'system' | 'vendor'

export interface FeedItem {
  id: string
  kind: FeedKind
  provider: string
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  severity: string
  title: string
  detail: string
  started_at: string
  resolved_at: string | null
}

export interface AlertsFeedResponse {
  items: FeedItem[]
  total: number
  page: number
  pageSize: number
}

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
    const resolved = sp.get('resolved') || 'false' // false | true | all
    const q = (sp.get('q') || '').trim().toLowerCase()

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

    // Shared resolved_at fragment: open-only (default), resolved-only, or no filter.
    const resolvedWhere: { resolved_at?: null | { not: null } } = {}
    if (resolved === 'true') resolvedWhere.resolved_at = { not: null }
    else if (resolved === 'all') {
      /* no resolved_at constraint */
    } else resolvedWhere.resolved_at = null

    // ── Fetch each requested source, bounded by filters + SOURCE_CAP ────
    const wantSystem = kind === 'all' || kind === 'system'
    const wantVendor = kind === 'all' || kind === 'vendor'

    const systemWhere: Record<string, unknown> = { ...resolvedWhere }
    if (severity) systemWhere.severity = severity
    // NB: `alerts` has no provider column — provider is resolved from the
    // device below and the provider filter is applied to system rows in memory.

    const vendorWhere: Record<string, unknown> = { ...resolvedWhere }
    if (severity) vendorWhere.severity = severity
    if (provider) vendorWhere.provider = provider

    const [systemRows, vendorRows] = await Promise.all([
      wantSystem
        ? prisma.alerts.findMany({
            where: systemWhere,
            orderBy: { created_at: 'desc' },
            take: SOURCE_CAP,
          })
        : Promise.resolve([]),
      wantVendor
        ? prisma.vendor_alarms.findMany({
            where: vendorWhere,
            orderBy: { started_at: 'desc' },
            take: SOURCE_CAP,
          })
        : Promise.resolve([]),
    ])

    // ── Enrich: plant_name + device_name (+ device.provider for system rows) ─
    const deviceIds = [
      ...new Set([
        ...systemRows.map((r) => r.device_id),
        ...vendorRows.map((r) => r.device_id),
      ]),
    ]
    const plantIds = [
      ...new Set([
        ...systemRows.map((r) => r.plant_id),
        ...vendorRows.map((r) => r.plant_id),
      ]),
    ]

    const [devices, plants] = await Promise.all([
      deviceIds.length > 0
        ? prisma.devices.findMany({
            where: { id: { in: deviceIds } },
            select: { id: true, device_name: true, provider: true },
          })
        : Promise.resolve([]),
      plantIds.length > 0
        ? prisma.plants.findMany({
            where: { id: { in: plantIds } },
            select: { id: true, plant_name: true },
          })
        : Promise.resolve([]),
    ])

    const deviceMap = new Map(devices.map((d) => [d.id, d]))
    const plantNameMap = new Map(plants.map((p) => [p.id, p.plant_name]))

    // ── Normalize each source into the unified FeedItem shape ───────────
    const systemItems: FeedItem[] = systemRows.map((r) => {
      const dev = deviceMap.get(r.device_id)
      return {
        id: `system:${r.id}`,
        kind: 'system',
        provider: dev?.provider ?? '',
        plant_id: r.plant_id,
        plant_name: plantNameMap.get(r.plant_id) || r.plant_id,
        device_id: r.device_id,
        device_name: dev?.device_name || r.device_id,
        severity: r.severity,
        title: `PV${r.string_number} · ${r.severity}`,
        detail: r.message,
        started_at: r.created_at.toISOString(),
        resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
      }
    })

    const vendorItems: FeedItem[] = vendorRows.map((r) => {
      const dev = deviceMap.get(r.device_id)
      const detail = r.advice ? `${r.message} — ${r.advice}` : r.message
      return {
        id: `vendor:${r.id}`,
        kind: 'vendor',
        provider: r.provider,
        plant_id: r.plant_id,
        plant_name: plantNameMap.get(r.plant_id) || r.plant_id,
        device_id: r.device_id,
        device_name: dev?.device_name || r.device_id,
        severity: r.severity,
        title: r.alarm_code ? `${r.alarm_code}` : 'Device alarm',
        detail,
        started_at: r.started_at.toISOString(),
        resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
      }
    })

    // ── In-memory filters that depend on the joined names/provider ──────
    let merged = [...systemItems, ...vendorItems]

    // Provider filter: vendor rows were already DB-filtered; system rows are
    // filtered here by their device's provider (alerts carry no provider).
    if (provider) {
      merged = merged.filter((it) => it.provider === provider)
    }

    // Free-text search across plant_name + device_name (case-insensitive).
    if (q) {
      merged = merged.filter(
        (it) =>
          it.plant_name.toLowerCase().includes(q) ||
          it.device_name.toLowerCase().includes(q),
      )
    }

    // ── Sort by started_at DESC, then paginate ──────────────────────────
    merged.sort((a, b) => b.started_at.localeCompare(a.started_at))

    const total = merged.length
    const start = (page - 1) * pageSize
    const items = merged.slice(start, start + pageSize)

    const body: AlertsFeedResponse = { items, total, page, pageSize }
    return NextResponse.json(body)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Alerts Feed GET', error)
  }
}
