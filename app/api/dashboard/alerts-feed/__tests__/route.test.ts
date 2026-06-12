import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Customer Alerts feed: tenant-scoped wrapper over the shared `buildAlertsFeed`
// builder. requireOrganization; resolves the caller org's plant_ids from
// plant_assignments and passes them as allowedPlantIds (THE security boundary).
// includeOrg=false (a customer never sees the org breadcrumb). Same response
// shape + same severity/provider validation as the admin route.

const mockPrisma = {
  alerts: { findMany: vi.fn() },
  vendor_alarms: { findMany: vi.fn() },
  devices: { findMany: vi.fn() },
  plants: { findMany: vi.fn() },
  plant_assignments: { findMany: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const mockGetUser = vi.fn()
const mockRequireOrg = vi.fn()
vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: (...a: any[]) => mockGetUser(...a),
  requireOrganization: (...a: any[]) => mockRequireOrg(...a),
  createErrorResponse: (err: any) => new Response(
    JSON.stringify({ error: err.message, code: err.code }),
    { status: err.statusCode, headers: { 'Content-Type': 'application/json' } },
  ),
  ApiAuthError: class ApiAuthError extends Error {
    constructor(public message: string, public statusCode = 403, public code = 'UNAUTHORIZED') { super(message) }
  },
}))
vi.mock('@/lib/api-errors', () => ({
  serverError: (_ctx: string, _e: unknown) =>
    new Response(JSON.stringify({ error: 'server' }), { status: 500 }),
}))

const NOW = new Date('2026-06-12T12:00:00Z')
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

// p1 belongs to the caller's org; p2 belongs to ANOTHER org.
const SYSTEM_ROWS_ALL = [
  { id: 1, device_id: 'd1', plant_id: 'p1', string_number: 3, severity: 'CRITICAL',
    message: 'String PV3 dead', gap_percent: 92.5, created_at: minsAgo(10), resolved_at: null },
  { id: 2, device_id: 'd2', plant_id: 'p2', string_number: 1, severity: 'WARNING',
    message: 'Other org alert', gap_percent: 22.1, created_at: minsAgo(50), resolved_at: null },
]
const VENDOR_ROWS_ALL = [
  { id: 'v-aaa', device_id: 'd1', plant_id: 'p1', provider: 'solis', alarm_code: 'F23',
    severity: 'CRITICAL', message: 'DC arc fault', advice: 'Inspect wiring',
    started_at: minsAgo(30), resolved_at: null },
  { id: 'v-bbb', device_id: 'd2', plant_id: 'p2', provider: 'growatt', alarm_code: 'X9',
    severity: 'INFO', message: 'Other org alarm', advice: null,
    started_at: minsAgo(5), resolved_at: null },
]
const DEVICES = [
  { id: 'd1', device_name: 'INV-A', provider: 'solis' },
  { id: 'd2', device_name: 'INV-B', provider: 'growatt' },
]
const PLANTS = [
  { id: 'p1', plant_name: 'My Plant' },
  { id: 'p2', plant_name: 'Other Org Plant' },
]

// Emulate the DB's plant_id IN(...) scoping so the merged result reflects what
// the builder actually queries (the mock would otherwise return every row).
const scopeTo = (rows: any[]) => (args: any) => {
  const inList: string[] | undefined = args?.where?.plant_id?.in
  return Promise.resolve(inList ? rows.filter((r) => inList.includes(r.plant_id)) : rows)
}

async function invoke(qs = '') {
  const { GET } = await import('@/app/api/dashboard/alerts-feed/route')
  const url = `http://localhost/api/dashboard/alerts-feed${qs}`
  const res = await GET({ nextUrl: new URL(url) } as any)
  const body = await res.json()
  return { res, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mockGetUser.mockResolvedValue({ userId: 'u1', role: 'ORG_USER', organizationId: 'org-1', status: 'ACTIVE' })
  mockRequireOrg.mockReturnValue(undefined)
  // The caller's org owns ONLY p1.
  mockPrisma.plant_assignments.findMany.mockResolvedValue([{ plant_id: 'p1' }])
  mockPrisma.alerts.findMany.mockImplementation(scopeTo(SYSTEM_ROWS_ALL))
  mockPrisma.vendor_alarms.findMany.mockImplementation(scopeTo(VENDOR_ROWS_ALL))
  mockPrisma.devices.findMany.mockResolvedValue(DEVICES)
  mockPrisma.plants.findMany.mockResolvedValue(PLANTS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('GET /api/dashboard/alerts-feed (customer, tenant-scoped)', () => {
  it('403 when caller is not assigned to an organization', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    mockRequireOrg.mockImplementationOnce(() => {
      throw new (ApiAuthError as any)('Must be assigned to an organization', 403, 'NO_ORGANIZATION')
    })
    const { res, body } = await invoke()
    expect(res.status).toBe(403)
    expect(body.code).toBe('NO_ORGANIZATION')
  })

  it('resolves the caller org plant_ids and scopes BOTH sources to them', async () => {
    await invoke()
    expect(mockPrisma.plant_assignments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: 'org-1' } }),
    )
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.plant_id).toEqual({ in: ['p1'] })
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.plant_id).toEqual({ in: ['p1'] })
  })

  // ── TENANCY: the critical guarantee ─────────────────────────────────
  it('NEVER returns a row outside the caller org plants (p2 alerts exist but are invisible)', async () => {
    const { body } = await invoke('?resolved=all')
    // p2 system + vendor rows exist in the DB, but the org owns only p1.
    expect(body.items.every((i: any) => i.plant_id === 'p1')).toBe(true)
    const ids = body.items.map((i: any) => i.id)
    expect(ids).toContain('system:1')
    expect(ids).toContain('vendor:v-aaa')
    expect(ids).not.toContain('system:2')
    expect(ids).not.toContain('vendor:v-bbb')
  })

  it('an org with NO plants gets an empty feed (never falls open to all tenants)', async () => {
    mockPrisma.plant_assignments.findMany.mockResolvedValue([])
    const { res, body } = await invoke('?resolved=all')
    expect(res.status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    // [] short-circuits the builder — no source query is ever run unscoped.
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.vendor_alarms.findMany).not.toHaveBeenCalled()
  })

  it('does NOT populate org fields (includeOrg=false → customer never sees the org breadcrumb)', async () => {
    const { body } = await invoke()
    expect(mockPrisma.plant_assignments.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ organizations: expect.anything() }) }),
    )
    expect(body.items.every((i: any) => i.organization_id === null && i.organization_name === null)).toBe(true)
  })

  it('returns the same response shape as the admin feed', async () => {
    const { body } = await invoke()
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('pageSize')
    expect(body).toHaveProperty('capped')
    for (const it of body.items) {
      expect(Object.keys(it).sort()).toEqual([
        'detail', 'device_id', 'device_name', 'id', 'kind', 'organization_id',
        'organization_name', 'plant_id', 'plant_name', 'provider', 'resolved_at',
        'severity', 'started_at', 'string_number', 'title',
      ])
    }
  })

  it('rejects an invalid severity with 400', async () => {
    const { res, body } = await invoke('?severity=BOGUS')
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/severity/i)
  })

  it('rejects an invalid provider with 400', async () => {
    const { res, body } = await invoke('?provider=soliss')
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/provider/i)
  })

  it('accepts csi as a valid provider', async () => {
    const { res } = await invoke('?provider=csi')
    expect(res.status).toBe(200)
  })

  it('passes kind / severity / resolved through to the builder', async () => {
    await invoke('?kind=vendor&severity=CRITICAL&resolved=true')
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled() // kind=vendor
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.severity).toBe('CRITICAL')
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.resolved_at).toEqual({ not: null })
  })
})
