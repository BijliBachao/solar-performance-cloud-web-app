import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// NOC fleet endpoint contracts:
//   - SUPER_ADMIN only (requireSuperAdmin)
//   - Zod-validates ?mode (must be 'prev-day'), ?org, ?bucket, ?page
//   - Calls three loader functions in parallel: loadFleetCounts, loadFleetRows, loadOrgList
//   - Composes the full response with proper pagination

const mockLoadFleetCounts = vi.fn()
const mockLoadFleetRows = vi.fn()
const mockLoadOrgList = vi.fn()

vi.mock('@/lib/donut-data-loader', () => ({
  loadFleetCounts: (...args: any[]) => mockLoadFleetCounts(...args),
  loadFleetRows: (...args: any[]) => mockLoadFleetRows(...args),
  loadOrgList: (...args: any[]) => mockLoadOrgList(...args),
}))

const mockGetUserFromRequest = vi.fn()
const mockRequireSuperAdmin = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: (...args: any[]) => mockGetUserFromRequest(...args),
  requireSuperAdmin: (...args: any[]) => mockRequireSuperAdmin(...args),
  createErrorResponse: (err: any) => new Response(
    JSON.stringify({ error: err.message, code: err.code }),
    { status: err.statusCode, headers: { 'Content-Type': 'application/json' } },
  ),
  ApiAuthError: class ApiAuthError extends Error {
    constructor(public message: string, public statusCode = 403, public code = 'UNAUTHORIZED') {
      super(message)
    }
  },
}))

const sampleCounts = {
  totalStrings: 100,
  counts: { healthy: 90, abnormal: 8, critical: 2, noData: 0 },
  breakdown: {
    healthy: { byScore: 90 },
    abnormal: { byScore: 8, noData: 0 },
    critical: { byScore: 2, openCircuit: 0 },
  },
  excluded: { unused: 0, nonStandard: 0 },
  timeBasis: { label: 'Yesterday · 2026-05-23', startsAt: new Date('2026-05-23'), endsAt: new Date('2026-05-24') },
  freshness: { lastDataAt: new Date('2026-05-24'), coveragePct: 100 },
  warnings: [],
}

const sampleRows = {
  page: 1, pageSize: 50, total: 2,
  items: [
    { orgId: 'o1', orgName: 'Acme', plantCode: 'p1', plantName: 'Plant 1', deviceId: 'd1', inverterName: 'INV-1', stringNumber: 1, healthScore: 95, bucket: 'healthy' as const },
    { orgId: 'o1', orgName: 'Acme', plantCode: 'p1', plantName: 'Plant 1', deviceId: 'd1', inverterName: 'INV-1', stringNumber: 2, healthScore: 30, bucket: 'critical' as const },
  ],
}

const sampleOrgs = [
  { id: 'o1', name: 'Acme', stringCount: 100 },
  { id: 'o2', name: 'Beta', stringCount: 50 },
]

function makeRequest(query: string = ''): any {
  return { url: `http://localhost:3001/api/admin/string-health-donut${query}` }
}

async function invoke(query: string) {
  const { GET } = await import('@/app/api/admin/string-health-donut/route')
  const res = await GET(makeRequest(query))
  const body = await res.json()
  return { res, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserFromRequest.mockResolvedValue({ userId: 'u1', role: 'SUPER_ADMIN' })
  mockRequireSuperAdmin.mockReturnValue(undefined)
  mockLoadFleetCounts.mockResolvedValue(sampleCounts)
  mockLoadFleetRows.mockResolvedValue(sampleRows)
  mockLoadOrgList.mockResolvedValue(sampleOrgs)
})

afterEach(() => {
  vi.resetModules()
})

describe('GET /api/admin/string-health-donut', () => {
  it('returns 200 with full payload for SUPER_ADMIN, no filters', async () => {
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(200)
    expect(body.totalStrings).toBe(100)
    expect(body.rows.items).toHaveLength(2)
    expect(body.orgs).toHaveLength(2)
  })

  it('returns 400 when mode is missing', async () => {
    const { res, body } = await invoke('')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 400 when mode is anything other than prev-day', async () => {
    const { res, body } = await invoke('?mode=last-3h')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 403 when caller is not SUPER_ADMIN', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    mockRequireSuperAdmin.mockImplementationOnce(() => {
      throw new (ApiAuthError as any)('Super admin required', 403, 'SUPER_ADMIN_REQUIRED')
    })
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(403)
    expect(body.code).toBe('SUPER_ADMIN_REQUIRED')
  })

  it('passes org filter through to loaders', async () => {
    await invoke('?mode=prev-day&org=acme-corp')
    expect(mockLoadFleetCounts).toHaveBeenCalledWith('acme-corp')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'acme-corp' }))
  })

  it('passes bucket filter through to loadFleetRows only (counts always show all)', async () => {
    await invoke('?mode=prev-day&bucket=critical')
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined)
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'critical' }))
  })

  it('returns 400 on invalid bucket value', async () => {
    const { res, body } = await invoke('?mode=prev-day&bucket=warning')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('passes page param to loadFleetRows (defaults to 1)', async () => {
    await invoke('?mode=prev-day&page=3')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
  })

  it('clamps invalid page to 400 (Zod rejects negatives)', async () => {
    const { res, body } = await invoke('?mode=prev-day&page=-1')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('sets Cache-Control 300s + private', async () => {
    const { res } = await invoke('?mode=prev-day')
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toMatch(/max-age=300/)
    expect(cc).toMatch(/private/)
  })

  it('returns 500 on unexpected loader error', async () => {
    mockLoadFleetCounts.mockRejectedValueOnce(new Error('DB exploded'))
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('parallelises the three loader calls (counts, rows, orgs)', async () => {
    let countsResolve: any, rowsResolve: any, orgsResolve: any
    mockLoadFleetCounts.mockReturnValueOnce(new Promise((r) => { countsResolve = r }))
    mockLoadFleetRows.mockReturnValueOnce(new Promise((r) => { rowsResolve = r }))
    mockLoadOrgList.mockReturnValueOnce(new Promise((r) => { orgsResolve = r }))

    const pending = invoke('?mode=prev-day')

    // Yield enough microtasks for the dynamic import + auth + Zod chain to
    // reach Promise.all. After that point all three loaders must have been
    // invoked before any of them resolves — that's the contract.
    await new Promise((r) => setTimeout(r, 0))

    expect(mockLoadFleetCounts).toHaveBeenCalledTimes(1)
    expect(mockLoadFleetRows).toHaveBeenCalledTimes(1)
    expect(mockLoadOrgList).toHaveBeenCalledTimes(1)

    countsResolve(sampleCounts)
    rowsResolve(sampleRows)
    orgsResolve(sampleOrgs)
    await pending
  })
})
