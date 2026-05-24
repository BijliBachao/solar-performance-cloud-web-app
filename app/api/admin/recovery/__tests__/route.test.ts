import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Recovery worklist endpoint: SUPER_ADMIN only; rolls up org activity into
// recovery buckets; sorts most-urgent-first; super-admins (org_id=null) never
// appear because they have no organizations relation.

const mockPrisma = {
  organizations: { findMany: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const mockGetUser = vi.fn()
const mockRequireRole = vi.fn()
vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: (...a: any[]) => mockGetUser(...a),
  requireRole: (...a: any[]) => mockRequireRole(...a),
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

const NOW = new Date('2026-05-25T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

async function invoke() {
  const { GET } = await import('@/app/api/admin/recovery/route')
  const res = await GET()
  const body = await res.json()
  return { res, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mockGetUser.mockResolvedValue({ userId: 'u1', role: 'SUPER_ADMIN' })
  mockRequireRole.mockReturnValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('GET /api/admin/recovery', () => {
  it('403 when caller is not SUPER_ADMIN', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    mockRequireRole.mockImplementationOnce(() => {
      throw new (ApiAuthError as any)('Required roles: SUPER_ADMIN', 403, 'INSUFFICIENT_ROLE')
    })
    const { res, body } = await invoke()
    expect(res.status).toBe(403)
    expect(body.code).toBe('INSUFFICIENT_ROLE')
  })

  it('buckets clients and sorts most-urgent-first', async () => {
    mockPrisma.organizations.findMany.mockResolvedValue([
      { id: 'o1', name: 'Active Co', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'a@x.com', first_name: 'A', last_name: null, last_active_at: daysAgo(2), login_count: 5 }] },
      { id: 'o2', name: 'Lost Co', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'b@x.com', first_name: 'B', last_name: null, last_active_at: daysAgo(120), login_count: 1 }] },
      { id: 'o3', name: 'AtRisk Co', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'c@x.com', first_name: 'C', last_name: null, last_active_at: daysAgo(60), login_count: 2 }] },
      { id: 'o4', name: 'Never Co', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'd@x.com', first_name: 'D', last_name: null, last_active_at: null, login_count: 0 }] },
    ])

    const { res, body } = await invoke()
    expect(res.status).toBe(200)

    // Sort order: lost → at_risk → never → cooling → active
    expect(body.clients.map((c: any) => c.orgName))
      .toEqual(['Lost Co', 'AtRisk Co', 'Never Co', 'Active Co'])
    expect(body.clients[0].bucket).toBe('lost')
    expect(body.clients[1].bucket).toBe('at_risk')
    expect(body.clients[2].bucket).toBe('never')
    expect(body.clients[3].bucket).toBe('active')
  })

  it('computes org-level rollup from most-recent user activity', async () => {
    mockPrisma.organizations.findMany.mockResolvedValue([
      { id: 'o1', name: 'Multi-user Co', status: 'ACTIVE', email: null, phone: null,
        users: [
          { email: 'old@x.com', first_name: null, last_name: null, last_active_at: daysAgo(100), login_count: 1 },
          { email: 'recent@x.com', first_name: null, last_name: null, last_active_at: daysAgo(3), login_count: 4 },
        ] },
    ])
    const { body } = await invoke()
    const c = body.clients[0]
    // Org should be Active (its most-recent user was 3 days ago), not Lost
    expect(c.bucket).toBe('active')
    expect(c.totalLogins).toBe(5)
    expect(c.userCount).toBe(2)
    // Users sorted most-recent first
    expect(c.users[0].email).toBe('recent@x.com')
  })

  it('summary counts + needsAttention reflect buckets', async () => {
    mockPrisma.organizations.findMany.mockResolvedValue([
      { id: 'o1', name: 'Lost', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'a@x.com', first_name: null, last_name: null, last_active_at: daysAgo(120), login_count: 1 }] },
      { id: 'o2', name: 'Active', status: 'ACTIVE', email: null, phone: null,
        users: [{ email: 'b@x.com', first_name: null, last_name: null, last_active_at: daysAgo(1), login_count: 1 }] },
    ])
    const { body } = await invoke()
    expect(body.summary.lost).toBe(1)
    expect(body.summary.active).toBe(1)
    expect(body.needsAttention).toBe(1) // only the Lost org
  })

  it('handles empty org list', async () => {
    mockPrisma.organizations.findMany.mockResolvedValue([])
    const { res, body } = await invoke()
    expect(res.status).toBe(200)
    expect(body.clients).toEqual([])
    expect(body.needsAttention).toBe(0)
  })
})
