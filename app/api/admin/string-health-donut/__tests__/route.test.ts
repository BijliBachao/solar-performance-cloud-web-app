import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// NOC fleet endpoint contracts (v3.1):
//   - SUPER_ADMIN only (requireRole)
//   - Zod-validates ?mode ('today' | 'prev-day'), ?org, ?bucket|?buckets,
//     ?conn (mode=today ONLY), ?q, ?page
//   - TIME-BASIS CONSISTENCY: one date drives every health query.
//       mode=today    → today's intraday scores + live connectivity
//       mode=prev-day → yesterday's settled scores; connectivity NOT loaded
//                       (null in payload), conn facet rejected (400),
//                       kpis/attention built with null connectivity
//   - Facets: AND across facets, OR within. Coordinated views: counts get the
//     connectivity-selection device list; connectivity gets the health-selection
//     device set; rows get both.
//   - Two-stage parallelism: (connectivity?, bucketDeviceIds?, critPerPlant, orgs)
//     then (counts, rows).
//   - Payload adds kpis + attention.

const TODAY = new Date('2026-06-04T00:00:00.000Z')
const YESTERDAY = new Date('2026-06-03T00:00:00.000Z')

const mockLoadFleetCounts = vi.fn()
const mockLoadFleetRows = vi.fn()
const mockLoadOrgList = vi.fn()
const mockLoadFleetConnectivity = vi.fn()
const mockLoadDeviceIdsForBuckets = vi.fn()
const mockLoadCritStringsPerPlant = vi.fn()
const mockBuildFleetKpis = vi.fn()
const mockBuildAttention = vi.fn()

vi.mock('@/lib/donut-data-loader', () => ({
  loadFleetCounts: (...args: any[]) => mockLoadFleetCounts(...args),
  loadFleetRows: (...args: any[]) => mockLoadFleetRows(...args),
  loadOrgList: (...args: any[]) => mockLoadOrgList(...args),
  loadFleetConnectivity: (...args: any[]) => mockLoadFleetConnectivity(...args),
  loadDeviceIdsForBuckets: (...args: any[]) => mockLoadDeviceIdsForBuckets(...args),
  loadCritStringsPerPlant: (...args: any[]) => mockLoadCritStringsPerPlant(...args),
  buildFleetKpis: (...args: any[]) => mockBuildFleetKpis(...args),
  buildAttention: (...args: any[]) => mockBuildAttention(...args),
  getPktTodayDate: () => TODAY,
  getPktYesterdayDate: () => YESTERDAY,
}))

const mockGetUserFromRequest = vi.fn()
const mockRequireRole = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: (...args: any[]) => mockGetUserFromRequest(...args),
  requireRole: (...args: any[]) => mockRequireRole(...args),
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
  timeBasis: { label: 'Yesterday · 2026-06-03', startsAt: new Date('2026-06-03'), endsAt: new Date('2026-06-04') },
  freshness: { lastDataAt: new Date('2026-06-04'), coveragePct: 100 },
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

// counts must equal the re-tally of devices — the route recomputes from the
// device list when applying facets.
const sampleConnectivity = {
  counts: { live: 1, frozen: 1, offline: 1, idle: 0 },
  devices: [
    { deviceId: 'd1', plantCode: 'p1', plantName: 'Plant 1', inverterName: 'INV-1', provider: 'csi', status: 'frozen' as const, effectiveFreshAt: new Date('2026-06-03').toISOString() },
    { deviceId: 'd2', plantCode: 'p1', plantName: 'Plant 1', inverterName: 'INV-2', provider: 'csi', status: 'live' as const, effectiveFreshAt: new Date('2026-06-03').toISOString() },
    { deviceId: 'd3', plantCode: 'p2', plantName: 'Plant 2', inverterName: 'INV-3', provider: 'solis', status: 'offline' as const, effectiveFreshAt: null },
  ],
}

const sampleKpis = { offlineInverters: 1, frozenInverters: 1, criticalStrings: 2, plantsWithIssues: 2, livePct: 75 }
const sampleAttention = [
  { plantCode: 'p1', plantName: 'Plant 1', critStrings: 2, frozen: 1, offline: 0, worstSince: null, score: 4 },
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
  mockRequireRole.mockReturnValue(undefined)
  mockLoadFleetCounts.mockResolvedValue(sampleCounts)
  mockLoadFleetRows.mockResolvedValue(sampleRows)
  mockLoadOrgList.mockResolvedValue(sampleOrgs)
  mockLoadFleetConnectivity.mockResolvedValue(sampleConnectivity)
  mockLoadDeviceIdsForBuckets.mockResolvedValue(['d1'])
  mockLoadCritStringsPerPlant.mockResolvedValue([{ plantCode: 'p1', plantName: 'Plant 1', crit: 2 }])
  mockBuildFleetKpis.mockReturnValue(sampleKpis)
  mockBuildAttention.mockReturnValue(sampleAttention)
})

afterEach(() => {
  vi.resetModules()
})

describe('GET /api/admin/string-health-donut (mode=today)', () => {
  it('returns 200 with full payload for SUPER_ADMIN, no filters', async () => {
    const { res, body } = await invoke('?mode=today')
    expect(res.status).toBe(200)
    expect(body.mode).toBe('today')
    expect(body.totalStrings).toBe(100)
    expect(body.rows.items).toHaveLength(2)
    expect(body.orgs).toHaveLength(2)
    expect(body.connectivity.counts).toEqual({ live: 1, frozen: 1, offline: 1, idle: 0 })
    expect(body.kpis).toEqual(sampleKpis)
    expect(body.attention).toHaveLength(1)
  })

  it("threads TODAY's PKT date into every health loader (one time basis)", async () => {
    await invoke('?mode=today&buckets=critical')
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined, expect.objectContaining({ date: TODAY }))
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ date: TODAY }))
    expect(mockLoadDeviceIdsForBuckets).toHaveBeenCalledWith(expect.objectContaining({ date: TODAY }))
    expect(mockLoadCritStringsPerPlant).toHaveBeenCalledWith(undefined, TODAY)
    expect(mockLoadOrgList).toHaveBeenCalledWith(TODAY)
  })

  it('returns 400 when mode is missing', async () => {
    const { res, body } = await invoke('')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 400 on unknown mode', async () => {
    const { res, body } = await invoke('?mode=last-3h')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 403 when caller is not SUPER_ADMIN', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    mockRequireRole.mockImplementationOnce(() => {
      throw new (ApiAuthError as any)('Required roles: SUPER_ADMIN', 403, 'INSUFFICIENT_ROLE')
    })
    const { res, body } = await invoke('?mode=today')
    expect(res.status).toBe(403)
    expect(body.code).toBe('INSUFFICIENT_ROLE')
  })

  it('passes org filter through to loaders', async () => {
    await invoke('?mode=today&org=acme-corp')
    expect(mockLoadFleetCounts).toHaveBeenCalledWith('acme-corp', expect.any(Object))
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'acme-corp' }))
    expect(mockLoadFleetConnectivity).toHaveBeenCalledWith('acme-corp')
    expect(mockLoadCritStringsPerPlant).toHaveBeenCalledWith('acme-corp', TODAY)
  })

  it('back-compat: single ?bucket folds into the buckets OR-set for rows', async () => {
    await invoke('?mode=today&bucket=critical')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ buckets: ['critical'] }))
    // health donut never filters on its own facet
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined, expect.objectContaining({ deviceIds: undefined }))
  })

  it('NOC v3: ?buckets CSV becomes an OR-set and drives the connectivity recompute', async () => {
    await invoke('?mode=today&buckets=critical,abnormal')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ buckets: ['critical', 'abnormal'] }))
    expect(mockLoadDeviceIdsForBuckets).toHaveBeenCalledWith(
      expect.objectContaining({ buckets: ['critical', 'abnormal'] }),
    )
  })

  it('NOC v3: ?conn narrows rows + health donut to matching devices (AND across facets)', async () => {
    const { body } = await invoke('?mode=today&conn=frozen,offline')
    // d1 frozen + d3 offline match the conn selection
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ deviceIds: ['d1', 'd3'] }))
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined, expect.objectContaining({ deviceIds: ['d1', 'd3'] }))
    // the connectivity donut does NOT filter on its own facet — full counts returned
    expect(body.connectivity.counts).toEqual({ live: 1, frozen: 1, offline: 1, idle: 0 })
  })

  it('NOC v3: with ?buckets active, the connectivity donut re-tallies to bucket-matching devices', async () => {
    mockLoadDeviceIdsForBuckets.mockResolvedValueOnce(['d1']) // only d1 has strings in selected buckets
    const { body } = await invoke('?mode=today&buckets=critical')
    expect(body.connectivity.counts).toEqual({ live: 0, frozen: 1, offline: 0, idle: 0 })
    expect(body.connectivity.devices).toHaveLength(1)
    expect(body.connectivity.devices[0].deviceId).toBe('d1')
  })

  it('NOC v3: ?q is passed to rows + counts and narrows the connectivity device list', async () => {
    const { body } = await invoke('?mode=today&q=Plant 2')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ q: 'Plant 2' }))
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined, expect.objectContaining({ q: 'Plant 2' }))
    expect(body.connectivity.devices).toHaveLength(1)
    expect(body.connectivity.devices[0].plantName).toBe('Plant 2')
  })

  it('returns 400 on invalid bucket value', async () => {
    const { res, body } = await invoke('?mode=today&bucket=warning')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 400 on invalid conn value', async () => {
    const { res, body } = await invoke('?mode=today&conn=sleeping')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('passes page param to loadFleetRows (defaults to 1)', async () => {
    await invoke('?mode=today&page=3')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
  })

  it('clamps invalid page to 400 (Zod rejects negatives)', async () => {
    const { res, body } = await invoke('?mode=today&page=-1')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('sets Cache-Control 30s + private (live triage view)', async () => {
    const { res } = await invoke('?mode=today')
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toMatch(/max-age=30\b/)
    expect(cc).toMatch(/private/)
  })

  it('returns 500 on unexpected loader error', async () => {
    mockLoadFleetCounts.mockRejectedValueOnce(new Error('DB exploded'))
    const { res, body } = await invoke('?mode=today')
    expect(res.status).toBe(500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('two-stage parallelism: stage-1 loaders fire together, then counts+rows', async () => {
    let connResolve: any, critResolve: any, orgsResolve: any
    mockLoadFleetConnectivity.mockReturnValueOnce(new Promise((r) => { connResolve = r }))
    mockLoadCritStringsPerPlant.mockReturnValueOnce(new Promise((r) => { critResolve = r }))
    mockLoadOrgList.mockReturnValueOnce(new Promise((r) => { orgsResolve = r }))

    const pending = invoke('?mode=today')
    await new Promise((r) => setTimeout(r, 0))

    // Stage 1 in flight together; stage 2 not started yet.
    expect(mockLoadFleetConnectivity).toHaveBeenCalledTimes(1)
    expect(mockLoadCritStringsPerPlant).toHaveBeenCalledTimes(1)
    expect(mockLoadOrgList).toHaveBeenCalledTimes(1)
    expect(mockLoadFleetCounts).not.toHaveBeenCalled()
    expect(mockLoadFleetRows).not.toHaveBeenCalled()

    connResolve(sampleConnectivity)
    critResolve([])
    orgsResolve(sampleOrgs)
    await new Promise((r) => setTimeout(r, 0))

    expect(mockLoadFleetCounts).toHaveBeenCalledTimes(1)
    expect(mockLoadFleetRows).toHaveBeenCalledTimes(1)
    await pending
  })
})

describe('GET /api/admin/string-health-donut (mode=prev-day — settled, one time basis)', () => {
  it('does NOT load connectivity and returns connectivity: null', async () => {
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(200)
    expect(body.mode).toBe('prev-day')
    expect(body.connectivity).toBeNull()
    expect(mockLoadFleetConnectivity).not.toHaveBeenCalled()
  })

  it("threads YESTERDAY's PKT date into every health loader", async () => {
    await invoke('?mode=prev-day')
    expect(mockLoadFleetCounts).toHaveBeenCalledWith(undefined, expect.objectContaining({ date: YESTERDAY }))
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ date: YESTERDAY }))
    expect(mockLoadCritStringsPerPlant).toHaveBeenCalledWith(undefined, YESTERDAY)
    expect(mockLoadOrgList).toHaveBeenCalledWith(YESTERDAY)
  })

  it('rejects the conn facet with 400 (connectivity has no yesterday snapshot)', async () => {
    const { res, body } = await invoke('?mode=prev-day&conn=offline')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('builds kpis + attention with NULL connectivity (health-only basis)', async () => {
    await invoke('?mode=prev-day')
    expect(mockBuildFleetKpis).toHaveBeenCalledWith(null, [{ plantCode: 'p1', plantName: 'Plant 1', crit: 2 }])
    expect(mockBuildAttention).toHaveBeenCalledWith(null, [{ plantCode: 'p1', plantName: 'Plant 1', crit: 2 }])
  })

  it('health buckets still filter the table, WITHOUT the conn-donut device recompute', async () => {
    await invoke('?mode=prev-day&buckets=critical')
    expect(mockLoadFleetRows).toHaveBeenCalledWith(expect.objectContaining({ buckets: ['critical'] }))
    // no connectivity donut in this mode → no device-set recompute needed
    expect(mockLoadDeviceIdsForBuckets).not.toHaveBeenCalled()
  })

  it('sets a longer Cache-Control (settled data: 300s)', async () => {
    const { res } = await invoke('?mode=prev-day')
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toMatch(/max-age=300\b/)
    expect(cc).toMatch(/private/)
  })
})
