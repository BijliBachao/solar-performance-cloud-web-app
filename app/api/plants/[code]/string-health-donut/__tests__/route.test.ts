import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Per-plant donut endpoint contracts:
//   - Authenticates via getUserFromRequest()
//   - Authorizes via requirePlantAccess(ctx, code)
//   - Zod-validates ?mode query param
//   - Delegates data fetching to the centralized loader
//   - Returns the loader's result + cache headers

const mockLoadPlantPrevDay = vi.fn()
const mockLoadPlantToday = vi.fn()

vi.mock('@/lib/donut-data-loader', () => ({
  loadPlantDonutPrevDay: (...args: any[]) => mockLoadPlantPrevDay(...args),
  loadPlantDonutToday: (...args: any[]) => mockLoadPlantToday(...args),
}))

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({ userId: 'u1', role: 'SUPER_ADMIN' }),
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

vi.mock('@/lib/api-access', () => ({
  requirePlantAccess: vi.fn().mockResolvedValue(undefined),
}))

const sampleResult = {
  totalStrings: 100,
  counts: { healthy: 95, abnormal: 4, critical: 1, noData: 0 },
  breakdown: {
    healthy: { byScore: 95 },
    abnormal: { byScore: 4, noData: 0 },
    critical: { byScore: 1, openCircuit: 0 },
  },
  excluded: { unused: 5, nonStandard: 0 },
  timeBasis: {
    label: 'Yesterday · 2026-05-23',
    startsAt: new Date('2026-05-23T00:00:00Z'),
    endsAt: new Date('2026-05-24T00:00:00Z'),
  },
  freshness: { lastDataAt: new Date('2026-05-24T00:00:00Z'), coveragePct: 100 },
  warnings: [],
}

function makeRequest(query: string = ''): any {
  return { url: `http://localhost:3001/api/plants/plantX/string-health-donut${query}` }
}

async function invoke(query: string, plantCode = 'plantX') {
  const { GET } = await import('@/app/api/plants/[code]/string-health-donut/route')
  const res = await GET(makeRequest(query), { params: { code: plantCode } })
  const body = await res.json()
  return { res, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadPlantPrevDay.mockResolvedValue(sampleResult)
  mockLoadPlantToday.mockResolvedValue({ ...sampleResult, timeBasis: { ...sampleResult.timeBasis, label: 'Today · 2026-05-24 · live' } })
})

afterEach(() => {
  vi.resetModules()
})

describe('GET /api/plants/[code]/string-health-donut', () => {
  it('returns 200 with prev-day data when ?mode=prev-day', async () => {
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(200)
    expect(mockLoadPlantPrevDay).toHaveBeenCalledWith('plantX')
    expect(mockLoadPlantToday).not.toHaveBeenCalled()
    expect(body.totalStrings).toBe(100)
    expect(body.timeBasis.label).toBe('Yesterday · 2026-05-23')
  })

  it('returns 200 with today (live) data when ?mode=today', async () => {
    const { res, body } = await invoke('?mode=today')
    expect(res.status).toBe(200)
    expect(mockLoadPlantToday).toHaveBeenCalledWith('plantX')
    expect(mockLoadPlantPrevDay).not.toHaveBeenCalled()
    expect(body.timeBasis.label).toBe('Today · 2026-05-24 · live')
  })

  it('returns 400 when the retired last-3h mode is requested', async () => {
    const { res, body } = await invoke('?mode=last-3h')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
    expect(mockLoadPlantToday).not.toHaveBeenCalled()
  })

  it('returns 400 when mode is missing', async () => {
    const { res, body } = await invoke('')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 400 when mode is invalid', async () => {
    const { res, body } = await invoke('?mode=realtime')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_QUERY')
  })

  it('returns 404 when requirePlantAccess throws NOT_FOUND', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    const apiAccess = await import('@/lib/api-access')
    vi.mocked(apiAccess.requirePlantAccess).mockRejectedValueOnce(
      new (ApiAuthError as any)('Not found', 404, 'NOT_FOUND'),
    )
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 401 when getUserFromRequest throws NOT_AUTHENTICATED', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    const apiAuth = await import('@/lib/api-auth')
    vi.mocked(apiAuth.getUserFromRequest).mockRejectedValueOnce(
      new (ApiAuthError as any)('Not authenticated', 401, 'NOT_AUTHENTICATED'),
    )
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(401)
    expect(body.code).toBe('NOT_AUTHENTICATED')
  })

  it('sets Cache-Control to 300s for prev-day mode', async () => {
    const { res } = await invoke('?mode=prev-day')
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toMatch(/max-age=300/)
    expect(cc).toMatch(/private/)
  })

  it('sets Cache-Control to 60s for today (live) mode', async () => {
    const { res } = await invoke('?mode=today')
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toMatch(/max-age=60/)
  })

  it('surfaces loader warnings in the response body', async () => {
    mockLoadPlantPrevDay.mockResolvedValue({
      ...sampleResult,
      totalStrings: 0,
      counts: { healthy: 0, abnormal: 0, critical: 0, noData: 0 },
      warnings: [{ code: 'NO_DATA_YESTERDAY', message: 'No data' }],
    })
    const { body } = await invoke('?mode=prev-day')
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0].code).toBe('NO_DATA_YESTERDAY')
  })

  it('returns 500 with a structured error when the loader throws unexpectedly', async () => {
    mockLoadPlantPrevDay.mockRejectedValueOnce(new Error('DB exploded'))
    const { res, body } = await invoke('?mode=prev-day')
    expect(res.status).toBe(500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})
