import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

// Lock the contracts that two production deploys (4c8d530, f373084) landed:
//   - latest-measurement read uses $queryRaw with Postgres DISTINCT ON
//     (NOT prisma.findMany + distinct, which post-processes in Node and would
//     scan all of history on each request)
//   - rows are grouped by device in the response shape
//   - empty plant / empty measurements stay sane
//   - admin string_configs flags (is_used, exclude_from_peer_comparison) are
//     honoured in the response

const mockPrisma = {
  devices: { findMany: vi.fn() },
  plants: { findUnique: vi.fn().mockResolvedValue({ latitude: 31.5, longitude: 74.3 }) },
  string_configs: { findMany: vi.fn().mockResolvedValue([]) },
  device_daily: { findMany: vi.fn().mockResolvedValue([]) },
  string_measurements: { findMany: vi.fn().mockResolvedValue([]) },
  $queryRaw: vi.fn().mockResolvedValue([]),
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({
    userId: 'u1',
    clerkUserId: 'c1',
    organizationId: null,
    role: 'SUPER_ADMIN',
  }),
  createErrorResponse: vi.fn(),
  ApiAuthError: class ApiAuthError extends Error {},
}))

vi.mock('@/lib/api-access', () => ({
  requirePlantAccess: vi.fn().mockResolvedValue(undefined),
}))

const now = new Date('2026-05-12T12:00:00Z')
const oneMinAgo = new Date(now.getTime() - 60_000)
const oneHourAgo = new Date(now.getTime() - 60 * 60_000)

function buildLatestRow(overrides: Partial<{
  device_id: string
  plant_id: string
  timestamp: Date
  string_number: number
  voltage: Decimal | null
  current: Decimal | null
  power: Decimal | null
}> = {}) {
  return {
    device_id: 'dev-A',
    plant_id: 'plantX',
    timestamp: oneMinAgo,
    string_number: 1,
    voltage: new Decimal('600'),
    current: new Decimal('5.0'),
    power: new Decimal('3000'),
    ...overrides,
  }
}

async function invoke(plantId: string) {
  // Re-import the route inside each test to ensure fresh module state and
  // that our vi.mock calls above are bound before the route's imports run.
  const { GET } = await import('@/app/api/plants/[code]/strings/route')
  const res = await GET({} as any, { params: { code: plantId } })
  const body = await res.json()
  return { res, body }
}

describe('GET /api/plants/[code]/strings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Pin the clock to the fixtures' `now` (17:00 PKT, sun well up) so the live
    // SR sun-gate is ARMED — otherwise the suite fails at night when the real
    // sun is down and every string is correctly suppressed to OFFLINE.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    mockPrisma.plants.findUnique.mockResolvedValue({ latitude: 31.5, longitude: 74.3 })
    mockPrisma.string_configs.findMany.mockResolvedValue([])
    mockPrisma.device_daily.findMany.mockResolvedValue([])
    mockPrisma.string_measurements.findMany.mockResolvedValue([])
    mockPrisma.$queryRaw.mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns { devices: [] } and skips the latest-measurements query when the plant has no inverters', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([])

    const { body } = await invoke('plantX')

    expect(body).toEqual({ devices: [] })
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
    expect(mockPrisma.string_measurements.findMany).not.toHaveBeenCalled()
  })

  it('uses $queryRaw with Postgres DISTINCT ON (not Prisma findMany+distinct) for latest measurements — regression guard for the N+1 fix', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([buildLatestRow()])

    await invoke('plantX')

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
    // First call arg is the TemplateStringsArray; join it back to assert
    // the SQL shape (the .raw property is the Postgres SQL text).
    const sqlFragments = (mockPrisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).raw.join(' ')
    expect(sqlFragments).toMatch(/DISTINCT ON\s*\(\s*device_id\s*,\s*string_number\s*\)/i)
    expect(sqlFragments).toMatch(/FROM\s+string_measurements/i)
    expect(sqlFragments).toMatch(/ORDER BY\s+device_id\s*,\s*string_number\s*,\s*timestamp\s+DESC/i)
    // Latest measurements must NOT fall back to findMany+distinct
    const latestFindManyCalls = mockPrisma.string_measurements.findMany.mock.calls.filter(
      (c) => !(c[0] as any)?.where?.timestamp,
    )
    expect(latestFindManyCalls).toHaveLength(0)
  })

  it('today-measurements query is bounded by timestamp gte todayStart (no unbounded history scan)', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([buildLatestRow()])

    await invoke('plantX')

    const todayCall = mockPrisma.string_measurements.findMany.mock.calls[0]
    expect(todayCall[0].where.timestamp).toBeDefined()
    expect(todayCall[0].where.timestamp.gte).toBeInstanceOf(Date)
    expect(todayCall[0].where.device_id.in).toEqual(['dev-A'])
  })

  it('groups raw rows by device_id and returns one entry per device with its strings', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
      { id: 'dev-B', device_name: 'INV-B', max_strings: 1 },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([
      buildLatestRow({ device_id: 'dev-A', string_number: 1 }),
      buildLatestRow({ device_id: 'dev-A', string_number: 2 }),
      buildLatestRow({ device_id: 'dev-B', string_number: 1 }),
    ])

    const { body } = await invoke('plantX')

    expect(body.devices).toHaveLength(2)
    const a = body.devices.find((d: any) => d.device_id === 'dev-A')
    const b = body.devices.find((d: any) => d.device_id === 'dev-B')
    expect(a.strings.map((s: any) => s.string_number)).toEqual([1, 2])
    expect(b.strings.map((s: any) => s.string_number)).toEqual([1])
  })

  it('marks a string as stale when its timestamp lags behind the freshest by more than the stale window', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([
      buildLatestRow({ string_number: 1, timestamp: oneMinAgo, current: new Decimal('5.0') }),
      buildLatestRow({ string_number: 2, timestamp: oneHourAgo, current: new Decimal('5.0') }),
    ])

    const { body } = await invoke('plantX')

    const strings = body.devices[0].strings
    const fresh = strings.find((s: any) => s.string_number === 1)
    const stale = strings.find((s: any) => s.string_number === 2)
    expect(fresh.status).not.toBe('OFFLINE')
    expect(stale.status).toBe('OFFLINE')
  })

  it('hides strings that admin flagged is_used=false', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
    ])
    mockPrisma.string_configs.findMany.mockResolvedValue([
      { device_id: 'dev-A', string_number: 2, panel_count: null, panel_make: null, panel_rating_w: null, is_used: false, exclude_from_peer_comparison: false },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([
      buildLatestRow({ string_number: 1 }),
      buildLatestRow({ string_number: 2 }),
    ])

    const { body } = await invoke('plantX')

    expect(body.devices[0].strings.map((s: any) => s.string_number)).toEqual([1])
  })

  it('marks peer-excluded strings with peer_excluded=true and null gap_percent (but still includes them in the response)', async () => {
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'dev-A', device_name: 'INV-A', max_strings: 2 },
    ])
    mockPrisma.string_configs.findMany.mockResolvedValue([
      { device_id: 'dev-A', string_number: 1, panel_count: null, panel_make: null, panel_rating_w: null, is_used: true, exclude_from_peer_comparison: true },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([
      buildLatestRow({ string_number: 1, current: new Decimal('4.5') }),
      buildLatestRow({ string_number: 2, current: new Decimal('5.0') }),
    ])

    const { body } = await invoke('plantX')

    const s1 = body.devices[0].strings.find((s: any) => s.string_number === 1)
    expect(s1.peer_excluded).toBe(true)
    expect(s1.gap_percent).toBeNull()
  })

  it('emits 500 + logs on unexpected Prisma errors (does not leak the error message to clients)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPrisma.devices.findMany.mockRejectedValue(new Error('boom — connection refused'))

    const { res, body } = await invoke('plantX')

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
