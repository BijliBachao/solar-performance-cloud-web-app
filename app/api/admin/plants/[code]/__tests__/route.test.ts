import { describe, it, expect, beforeEach, vi } from 'vitest'

// Chunk C — plant_type Single/Multi PATCH (SUPER_ADMIN only).

const mockPrisma = {
  plants: { findUnique: vi.fn(), update: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const requireRole = vi.fn()
vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({
    userId: 'admin-1',
    clerkUserId: 'c1',
    organizationId: null,
    role: 'SUPER_ADMIN',
  }),
  requireRole,
  createErrorResponse: vi.fn(),
  ApiAuthError: class ApiAuthError extends Error {},
}))

function makeRequest(body: unknown) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

async function invokePatch(body: unknown, code = 'plantX') {
  const { PATCH } = await import('@/app/api/admin/plants/[code]/route')
  const res = await PATCH(makeRequest(body), { params: Promise.resolve({ code }) })
  return { res, body: await res.json() }
}

describe('PATCH /api/admin/plants/[code] — plant_type', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.plants.findUnique.mockResolvedValue({ id: 'plantX', plant_type: 'single_location' })
    mockPrisma.plants.update.mockImplementation(async (args: any) => ({
      id: 'plantX',
      plant_name: 'Test Plant',
      plant_type: args.data.plant_type,
    }))
  })

  it('requires SUPER_ADMIN', async () => {
    await invokePatch({ plant_type: 'multi_location' })
    expect(requireRole).toHaveBeenCalledWith(expect.anything(), ['SUPER_ADMIN'])
  })

  it('updates plant_type to multi_location and returns the updated plant', async () => {
    const { res, body } = await invokePatch({ plant_type: 'multi_location' })
    expect(res.status).toBe(200)
    expect(mockPrisma.plants.update).toHaveBeenCalledWith({
      where: { id: 'plantX' },
      data: { plant_type: 'multi_location' },
    })
    expect(body.plant_type).toBe('multi_location')
  })

  it('accepts single_location', async () => {
    const { res } = await invokePatch({ plant_type: 'single_location' })
    expect(res.status).toBe(200)
  })

  it('rejects a bad plant_type with 400', async () => {
    const { res } = await invokePatch({ plant_type: 'orbital' })
    expect(res.status).toBe(400)
    expect(mockPrisma.plants.update).not.toHaveBeenCalled()
  })

  it('404s when the plant does not exist', async () => {
    mockPrisma.plants.findUnique.mockResolvedValue(null)
    const { res } = await invokePatch({ plant_type: 'multi_location' })
    expect(res.status).toBe(404)
  })
})
