import { describe, it, expect, beforeEach, vi } from 'vitest'

// Chunk C — bulk POST accepts + applies condition_tag with the same auto-set
// rule as the per-string PUT.

const mockPrisma = {
  devices: { findMany: vi.fn() },
  string_daily: { groupBy: vi.fn().mockResolvedValue([]) },
  string_configs: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
  alerts: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({
    userId: 'admin-1',
    clerkUserId: 'c1',
    organizationId: null,
    role: 'SUPER_ADMIN',
  }),
  requireRole: vi.fn(),
  createErrorResponse: vi.fn(),
  ApiAuthError: class ApiAuthError extends Error {},
}))

vi.mock('@/lib/constants', () => ({ INVERTER_DEVICE_TYPE_IDS: [1, 100, 200, 300] }))

function makeRequest(body: unknown) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

async function invokePost(body: unknown, code = 'plantX') {
  const { POST } = await import('@/app/api/admin/plants/[code]/strings-config/route')
  const res = await POST(makeRequest(body), { params: Promise.resolve({ code }) })
  return { res, body: await res.json() }
}

describe('POST /api/admin/plants/[code]/strings-config — bulk condition_tag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.devices.findMany.mockResolvedValue([{ id: 'dev-A', max_strings: 2 }])
    mockPrisma.string_daily.groupBy.mockResolvedValue([])
    mockPrisma.string_configs.findMany.mockResolvedValue([])
    mockPrisma.string_configs.upsert.mockResolvedValue({})
    mockPrisma.alerts.updateMany.mockResolvedValue({ count: 0 })
  })

  it('applies condition_tag to every target string', async () => {
    const { body } = await invokePost({ condition_tag: 'under_observation' })
    expect(body.updated).toBe(2)
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.condition_tag).toBe('under_observation')
    expect(args.create.condition_tag).toBe('under_observation')
  })

  it('auto-sets exclude=true for known_shaded when exclude not sent', async () => {
    await invokePost({ condition_tag: 'known_shaded' })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.exclude_from_peer_comparison).toBe(true)
  })

  it('honours explicit exclude over the tag default in bulk', async () => {
    await invokePost({ condition_tag: 'known_shaded', exclude_from_peer_comparison: false })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.exclude_from_peer_comparison).toBe(false)
  })

  it('rejects a bad condition_tag with 400', async () => {
    const { res } = await invokePost({ condition_tag: 'banana' })
    expect(res.status).toBe(400)
  })
})
