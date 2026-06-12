import { prisma } from '@/lib/prisma'

/**
 * Shared Alerts-feed builder.
 *
 * ONE unified notification feed merging the two alert sources:
 *   - system  → our computed `alerts` (string health / performance / DQ)
 *   - vendor  → the inverters' OWN faults from `vendor_alarms`
 *
 * Both are normalized to a single row shape, merged in memory, sorted by
 * started_at DESC, then paginated. This is the SINGLE source of truth used by
 * BOTH portals:
 *   - admin    → `/api/admin/alerts-feed`     (all orgs; allowedPlantIds=null)
 *   - customer → `/api/dashboard/alerts-feed` (own org; allowedPlantIds scoped)
 *
 * RDS-friendly: each source is bounded by its filters + a SOURCE_CAP of the
 * most-recent rows before the in-memory merge, so a busy fleet can never pull
 * an unbounded result set into the API process.
 *
 * Vendor-agnostic: `provider` is just a string throughout — adding Sungrow /
 * Growatt / CSI etc. requires zero changes here. The route layer validates the
 * provider against the canonical vocab; the builder treats it opaquely.
 */

// Per-source ceiling pulled into memory before merge/sort/paginate.
const SOURCE_CAP = 500

// Default + max page sizes.
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export type FeedKind = 'system' | 'vendor'

export interface FeedItem {
  id: string // 'system:<int>' | 'vendor:<uuid>' (the representative row of a group)
  kind: FeedKind
  provider: string
  /** null when not joined (customer view, includeOrg=false). */
  organization_id: string | null
  organization_name: string | null
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  /** system rows carry it; vendor rows are always null. */
  string_number: number | null
  severity: string
  /** A plain-language headline — NEVER a bare code. See buildAlertsFeed. */
  title: string
  /** Short, single-line supplementary evidence/advice ('' when none). */
  detail: string
  /** Vendor alarm code (for the small `code N` chip); null for system rows. */
  alarm_code: string | null
  /** How many raw alerts this row collapses (1 when not grouped). */
  count: number
  /** Distinct device names in the group, sorted (length 1 when not grouped). */
  device_names: string[]
  started_at: string
  resolved_at: string | null
}

export interface SeverityCounts {
  critical: number
  warning: number
  info: number
}

export interface AlertsFeedResult {
  items: FeedItem[]
  /** Number of GROUPED rows in the full filtered set (post-collapse). */
  total: number
  page: number
  pageSize: number
  /** True when either source hit SOURCE_CAP — `total` then undercounts and
   *  the oldest rows are unreachable by paging. UI should surface this. */
  capped: boolean
  /** True severity totals over the FULL filtered, UNGROUPED set — so 7 grouped
   *  Sungrow faults still count as 7 critical even though shown as one row. */
  counts: SeverityCounts
}

export interface BuildAlertsFeedOptions {
  /** null = ALL plants (admin, unrestricted); [] = none (fast empty);
   *  array = scope BOTH sources to plant_id IN (...). THE security boundary. */
  allowedPlantIds: string[] | null
  kind?: FeedKind | 'all'
  provider?: string
  severity?: string
  /** 'false' (default) = open only; 'true' = resolved only; 'all' = no filter. */
  resolved?: 'true' | 'false' | 'all'
  q?: string
  page?: number
  pageSize?: number
  /** true → join plant_assignments→organizations + populate org fields. */
  includeOrg?: boolean
}

export async function buildAlertsFeed(
  opts: BuildAlertsFeedOptions,
): Promise<AlertsFeedResult> {
  const {
    allowedPlantIds,
    kind = 'all',
    provider = '',
    severity = '',
    resolved = 'false',
    q = '',
    includeOrg = false,
  } = opts

  const page = Number.isInteger(opts.page) && (opts.page as number) >= 1 ? (opts.page as number) : 1
  const pageSize =
    Number.isInteger(opts.pageSize) && (opts.pageSize as number) >= 1
      ? Math.min(opts.pageSize as number, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE

  // Empty allow-list ⇒ this caller can see nothing. Return fast without ever
  // touching the DB — and never fall open to an unscoped query.
  if (Array.isArray(allowedPlantIds) && allowedPlantIds.length === 0) {
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      capped: false,
      counts: { critical: 0, warning: 0, info: 0 },
    }
  }

  // Plant-scope fragment, spread into BOTH source WHEREs. null ⇒ no constraint.
  const plantWhere: { plant_id?: { in: string[] } } =
    allowedPlantIds === null ? {} : { plant_id: { in: allowedPlantIds } }

  const lq = q.trim().toLowerCase()

  // Shared resolved_at fragment: open-only (default), resolved-only, or no filter.
  const resolvedWhere: { resolved_at?: null | { not: null } } = {}
  if (resolved === 'true') resolvedWhere.resolved_at = { not: null }
  else if (resolved === 'all') {
    /* no resolved_at constraint */
  } else resolvedWhere.resolved_at = null

  // ── Fetch each requested source, bounded by filters + SOURCE_CAP ────
  const wantSystem = kind === 'all' || kind === 'system'
  const wantVendor = kind === 'all' || kind === 'vendor'

  const systemWhere: Record<string, unknown> = { ...plantWhere, ...resolvedWhere }
  if (severity) systemWhere.severity = severity
  // NB: `alerts` has no provider column — provider is resolved from the device
  // below and the provider filter is applied to system rows in memory.

  const vendorWhere: Record<string, unknown> = { ...plantWhere, ...resolvedWhere }
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

  const [devices, plants, assignments] = await Promise.all([
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
    // Org join only when asked for (admin view). plant→org is many-to-one in
    // practice; if a plant has >1 assignment we pick the first deterministically.
    includeOrg && plantIds.length > 0
      ? prisma.plant_assignments.findMany({
          where: { plant_id: { in: plantIds } },
          select: {
            plant_id: true,
            organization_id: true,
            organizations: { select: { name: true } },
          },
          orderBy: [{ plant_id: 'asc' }, { organization_id: 'asc' }],
        })
      : Promise.resolve([]),
  ])

  const deviceMap = new Map(devices.map((d) => [d.id, d]))
  const plantNameMap = new Map(plants.map((p) => [p.id, p.plant_name]))

  // First-assignment-wins per plant (deterministic via the orderBy above).
  const orgByPlant = new Map<string, { id: string; name: string | null }>()
  for (const a of assignments) {
    if (!orgByPlant.has(a.plant_id)) {
      orgByPlant.set(a.plant_id, {
        id: a.organization_id,
        name: a.organizations?.name ?? null,
      })
    }
  }

  // ── Normalize each source into the unified FeedItem shape ───────────
  // THE RULE: `title` is always a plain-language headline a non-technical
  // person can read — never a bare numeric code. Codes live in `alarm_code`
  // (rendered as a small chip). `detail` is short, single-line supplementary
  // evidence/advice. Every row collapses-friendly: count=1, device_names=[one].

  // System messages are written as "<headline> — <evidence>" (em-dash). Split
  // on the FIRST " — ": headline → title, the rest → detail (else whole/empty).
  const splitSystemMessage = (message: string): { title: string; detail: string } => {
    const idx = message.indexOf(' — ')
    if (idx === -1) return { title: message, detail: '' }
    return { title: message.slice(0, idx), detail: message.slice(idx + 3) }
  }

  const systemItems: FeedItem[] = systemRows.map((r) => {
    const dev = deviceMap.get(r.device_id)
    const org = includeOrg ? orgByPlant.get(r.plant_id) ?? null : null
    const { title, detail } = splitSystemMessage(r.message)
    const device_name = dev?.device_name || r.device_id
    return {
      id: `system:${r.id}`,
      kind: 'system',
      provider: dev?.provider ?? '',
      organization_id: org?.id ?? null,
      organization_name: org?.name ?? null,
      plant_id: r.plant_id,
      plant_name: plantNameMap.get(r.plant_id) || r.plant_id,
      device_id: r.device_id,
      device_name,
      string_number: r.string_number,
      severity: r.severity,
      title,
      detail,
      alarm_code: null,
      count: 1,
      device_names: [device_name],
      started_at: r.created_at.toISOString(),
      resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
    }
  })

  const vendorItems: FeedItem[] = vendorRows.map((r) => {
    const dev = deviceMap.get(r.device_id)
    const org = includeOrg ? orgByPlant.get(r.plant_id) ?? null : null
    const device_name = dev?.device_name || r.device_id
    return {
      id: `vendor:${r.id}`,
      kind: 'vendor',
      provider: r.provider,
      organization_id: org?.id ?? null,
      organization_name: org?.name ?? null,
      plant_id: r.plant_id,
      plant_name: plantNameMap.get(r.plant_id) || r.plant_id,
      device_id: r.device_id,
      device_name,
      string_number: null,
      severity: r.severity,
      // The human message IS the headline ("Device fault detected (status 4)").
      title: r.message,
      detail: r.advice ?? '',
      alarm_code: r.alarm_code ?? null,
      count: 1,
      device_names: [device_name],
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
  if (lq) {
    merged = merged.filter(
      (it) =>
        it.plant_name.toLowerCase().includes(lq) ||
        it.device_name.toLowerCase().includes(lq),
    )
  }

  // ── True severity totals over the FULL filtered, UNGROUPED set ───────
  // Computed BEFORE collapsing, so a group of 7 critical faults contributes 7
  // — the grouped row count would understate the real picture.
  const counts: SeverityCounts = { critical: 0, warning: 0, info: 0 }
  for (const it of merged) {
    const s = it.severity.toUpperCase()
    if (s === 'CRITICAL') counts.critical++
    else if (s === 'WARNING') counts.warning++
    else if (s === 'INFO') counts.info++
  }

  // ── Sort by started_at DESC, then collapse duplicates ───────────────
  merged.sort((a, b) => b.started_at.localeCompare(a.started_at))

  // Collapse rows sharing (kind, provider, plant_id, severity, title) into ONE
  // representative — the most-recent (first after the DESC sort). `count` =
  // group size; `device_names` = the distinct device names in the group,
  // sorted. Distinct alerts on different strings differ by title → stay apart;
  // 7 identical Sungrow faults on one plant fold into a single ×7 row.
  const groups = new Map<string, FeedItem>()
  for (const it of merged) {
    const gk = `${it.kind} ${it.provider} ${it.plant_id} ${it.severity} ${it.title}`
    const rep = groups.get(gk)
    if (!rep) {
      // First (most-recent) row becomes the representative; clone so we can
      // mutate count/device_names without touching the source array.
      groups.set(gk, { ...it, device_names: [...it.device_names] })
    } else {
      rep.count++
      if (!rep.device_names.includes(it.device_name)) rep.device_names.push(it.device_name)
    }
  }
  const grouped = [...groups.values()]
  for (const g of grouped) g.device_names.sort((a, b) => a.localeCompare(b))

  // ── Paginate the grouped feed ────────────────────────────────────────
  const total = grouped.length
  const start = (page - 1) * pageSize
  const items = grouped.slice(start, start + pageSize)

  // Either source hitting the per-source cap means `total` undercounts and
  // the oldest rows are unreachable by paging — flag it so the UI can say so.
  const capped = systemRows.length >= SOURCE_CAP || vendorRows.length >= SOURCE_CAP

  return { items, total, page, pageSize, capped, counts }
}
