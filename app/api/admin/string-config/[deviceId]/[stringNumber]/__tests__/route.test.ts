import { describe, it, expect, beforeEach, vi } from 'vitest'

// Chunk C — condition_tag persistence + auto-set of the peer-comp flag.
//
// Auto-set rule (server-side):
//   known_shaded | different_tilt | different_orientation | excluded
//                                       → exclude_from_peer_comparison = true
//   normal | under_observation          → exclude_from_peer_comparison = false
//   other                               → leave existing value untouched
// UNLESS the request explicitly sends exclude_from_peer_comparison, in which
// case the admin override always wins.

const mockPrisma = {
  devices: { findUnique: vi.fn() },
  string_configs: { upsert: vi.fn() },
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

function makeRequest(body: unknown) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

async function invokePut(body: unknown, deviceId = 'dev-A', sn = '1') {
  const { PUT } = await import('@/app/api/admin/string-config/[deviceId]/[stringNumber]/route')
  const res = await PUT(makeRequest(body), {
    params: Promise.resolve({ deviceId, stringNumber: sn }),
  })
  return { res, body: await res.json() }
}

// Return whatever was written so the response/echo can be asserted.
function upsertEchoesInput() {
  mockPrisma.string_configs.upsert.mockImplementation(async (args: any) => ({
    device_id: args.where.device_id_string_number.device_id,
    string_number: args.where.device_id_string_number.string_number,
    panel_count: args.update.panel_count ?? args.create.panel_count ?? null,
    panel_make: args.update.panel_make ?? args.create.panel_make ?? null,
    panel_rating_w: args.update.panel_rating_w ?? args.create.panel_rating_w ?? null,
    notes: args.update.notes ?? args.create.notes ?? null,
    is_used: args.update.is_used ?? args.create.is_used ?? true,
    exclude_from_peer_comparison:
      args.update.exclude_from_peer_comparison ?? args.create.exclude_from_peer_comparison ?? false,
    condition_tag: args.update.condition_tag ?? args.create.condition_tag ?? null,
    updated_at: new Date('2026-06-12T00:00:00Z'),
    updated_by: 'admin-1',
  }))
}

describe('PUT /api/admin/string-config — condition_tag + auto-set', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.devices.findUnique.mockResolvedValue({ id: 'dev-A' })
    mockPrisma.alerts.updateMany.mockResolvedValue({ count: 0 })
    upsertEchoesInput()
  })

  it('persists condition_tag and returns it in the response', async () => {
    const { body } = await invokePut({ condition_tag: 'under_observation' })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.create.condition_tag).toBe('under_observation')
    expect(args.update.condition_tag).toBe('under_observation')
    expect(body.condition_tag).toBe('under_observation')
  })

  it('auto-sets exclude=true for known_shaded when exclude not sent', async () => {
    await invokePut({ condition_tag: 'known_shaded' })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.exclude_from_peer_comparison).toBe(true)
    expect(args.create.exclude_from_peer_comparison).toBe(true)
  })

  it.each(['known_shaded', 'different_tilt', 'different_orientation', 'excluded'])(
    'auto-sets exclude=true for %s',
    async (tag) => {
      await invokePut({ condition_tag: tag })
      const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
      expect(args.update.exclude_from_peer_comparison).toBe(true)
    },
  )

  it.each(['normal', 'under_observation'])('auto-sets exclude=false for %s', async (tag) => {
    await invokePut({ condition_tag: tag })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.exclude_from_peer_comparison).toBe(false)
  })

  it('leaves exclude untouched for the "other" tag', async () => {
    await invokePut({ condition_tag: 'other' })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update).not.toHaveProperty('exclude_from_peer_comparison')
  })

  it('honours an explicit exclude_from_peer_comparison over the tag default (override wins)', async () => {
    // known_shaded would default to true, but the admin explicitly sent false.
    await invokePut({ condition_tag: 'known_shaded', exclude_from_peer_comparison: false })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update.exclude_from_peer_comparison).toBe(false)
  })

  it('auto-set true triggers peer-comparison alert auto-resolve (gap_percent not null)', async () => {
    await invokePut({ condition_tag: 'excluded' })
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1)
    const where = mockPrisma.alerts.updateMany.mock.calls[0][0].where
    expect(where.gap_percent).toEqual({ not: null })
  })

  it('still works with no condition_tag (back-compat: does not touch exclude or tag)', async () => {
    await invokePut({ panel_count: 8 })
    const args = mockPrisma.string_configs.upsert.mock.calls[0][0]
    expect(args.update).not.toHaveProperty('condition_tag')
    expect(args.update).not.toHaveProperty('exclude_from_peer_comparison')
  })
})
