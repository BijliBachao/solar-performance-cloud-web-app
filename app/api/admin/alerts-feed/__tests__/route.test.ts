import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Unified admin Alerts feed: merges our computed `alerts` (kind=system) with
// the inverters' own `vendor_alarms` (kind=vendor) into ONE time-sorted,
// paginated, normalized feed. SUPER_ADMIN only. Filters: kind / provider /
// severity / resolved / q; both sources bounded + merged in memory.

const mockPrisma = {
  alerts: { findMany: vi.fn() },
  vendor_alarms: { findMany: vi.fn() },
  devices: { findMany: vi.fn() },
  plants: { findMany: vi.fn() },
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

const NOW = new Date('2026-06-12T12:00:00Z')
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

// ── Fixture rows (raw Prisma shape) ───────────────────────────────────
// Two system alerts + two vendor alarms across two plants / two devices.
const SYSTEM_ROWS = [
  { id: 1, device_id: 'd1', plant_id: 'p1', string_number: 3, severity: 'CRITICAL',
    message: 'String PV3 dead', gap_percent: 92.5, created_at: minsAgo(10), resolved_at: null },
  { id: 2, device_id: 'd2', plant_id: 'p2', string_number: 1, severity: 'WARNING',
    message: 'Underperforming', gap_percent: 22.1, created_at: minsAgo(50), resolved_at: null },
]
const VENDOR_ROWS = [
  { id: 'v-aaa', device_id: 'd1', plant_id: 'p1', provider: 'solis', alarm_code: 'F23',
    severity: 'CRITICAL', message: 'DC arc fault', advice: 'Inspect wiring',
    started_at: minsAgo(30), resolved_at: null },
  { id: 'v-bbb', device_id: 'd2', plant_id: 'p2', provider: 'growatt', alarm_code: null,
    severity: 'INFO', message: 'Grid voltage high', advice: null,
    started_at: minsAgo(5), resolved_at: null },
]
const DEVICES = [
  { id: 'd1', device_name: 'INV-A', provider: 'solis' },
  { id: 'd2', device_name: 'INV-B', provider: 'growatt' },
]
const PLANTS = [
  { id: 'p1', plant_name: 'Gulberg Rooftop' },
  { id: 'p2', plant_name: 'DHA Site' },
]

async function invoke(qs = '') {
  const { GET } = await import('@/app/api/admin/alerts-feed/route')
  const url = `http://localhost/api/admin/alerts-feed${qs}`
  const res = await GET({ nextUrl: new URL(url) } as any)
  const body = await res.json()
  return { res, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mockGetUser.mockResolvedValue({ userId: 'u1', role: 'SUPER_ADMIN' })
  mockRequireRole.mockReturnValue(undefined)
  mockPrisma.alerts.findMany.mockResolvedValue(SYSTEM_ROWS)
  mockPrisma.vendor_alarms.findMany.mockResolvedValue(VENDOR_ROWS)
  mockPrisma.devices.findMany.mockResolvedValue(DEVICES)
  mockPrisma.plants.findMany.mockResolvedValue(PLANTS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('GET /api/admin/alerts-feed', () => {
  it('403 when caller is not SUPER_ADMIN', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth')
    mockRequireRole.mockImplementationOnce(() => {
      throw new (ApiAuthError as any)('Required roles: SUPER_ADMIN', 403, 'INSUFFICIENT_ROLE')
    })
    const { res, body } = await invoke()
    expect(res.status).toBe(403)
    expect(body.code).toBe('INSUFFICIENT_ROLE')
  })

  it('merges both sources, sorted by started_at DESC, with the normalized shape', async () => {
    const { res, body } = await invoke()
    expect(res.status).toBe(200)
    expect(body.total).toBe(4)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(50)
    expect(body.items).toHaveLength(4)

    // Order by started_at DESC: vendor(5m) > system(10m) > vendor(30m) > system(50m)
    expect(body.items.map((i: any) => i.id)).toEqual([
      'vendor:v-bbb', 'system:1', 'vendor:v-aaa', 'system:2',
    ])

    // Every item carries the full normalized shape.
    for (const it of body.items) {
      expect(Object.keys(it).sort()).toEqual([
        'detail', 'device_id', 'device_name', 'id', 'kind', 'plant_id',
        'plant_name', 'provider', 'resolved_at', 'severity', 'started_at', 'title',
      ])
    }
  })

  it('normalizes a system row correctly', async () => {
    const { body } = await invoke()
    const sys = body.items.find((i: any) => i.id === 'system:1')
    expect(sys.kind).toBe('system')
    expect(sys.provider).toBe('solis') // from the device
    expect(sys.plant_id).toBe('p1')
    expect(sys.plant_name).toBe('Gulberg Rooftop')
    expect(sys.device_id).toBe('d1')
    expect(sys.device_name).toBe('INV-A')
    expect(sys.severity).toBe('CRITICAL')
    expect(sys.title).toBe('PV3 · CRITICAL')
    expect(sys.detail).toBe('String PV3 dead')
    expect(sys.started_at).toBe(SYSTEM_ROWS[0].created_at.toISOString())
    expect(sys.resolved_at).toBeNull()
  })

  it('normalizes a vendor row correctly (alarm_code title + advice appended to detail)', async () => {
    const { body } = await invoke()
    const v = body.items.find((i: any) => i.id === 'vendor:v-aaa')
    expect(v.kind).toBe('vendor')
    expect(v.provider).toBe('solis')
    expect(v.plant_name).toBe('Gulberg Rooftop')
    expect(v.device_name).toBe('INV-A')
    expect(v.severity).toBe('CRITICAL')
    expect(v.title).toBe('F23')
    expect(v.detail).toBe('DC arc fault — Inspect wiring')
    expect(v.started_at).toBe(VENDOR_ROWS[0].started_at.toISOString())
  })

  it('vendor row with no alarm_code falls back to "Device alarm" and omits advice', async () => {
    const { body } = await invoke()
    const v = body.items.find((i: any) => i.id === 'vendor:v-bbb')
    expect(v.title).toBe('Device alarm')
    expect(v.detail).toBe('Grid voltage high')
  })

  it('kind=system returns only system rows and never queries vendor_alarms', async () => {
    const { body } = await invoke('?kind=system')
    expect(mockPrisma.alerts.findMany).toHaveBeenCalled()
    expect(mockPrisma.vendor_alarms.findMany).not.toHaveBeenCalled()
    expect(body.total).toBe(2)
    expect(body.items.every((i: any) => i.kind === 'system')).toBe(true)
  })

  it('kind=vendor returns only vendor rows and never queries alerts', async () => {
    const { body } = await invoke('?kind=vendor')
    expect(mockPrisma.vendor_alarms.findMany).toHaveBeenCalled()
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled()
    expect(body.total).toBe(2)
    expect(body.items.every((i: any) => i.kind === 'vendor')).toBe(true)
  })

  it('provider filter passes through to vendor_alarms where and constrains system rows by device provider', async () => {
    // Only growatt: system row d2 (growatt) + vendor row v-bbb (growatt)
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([VENDOR_ROWS[1]])
    const { body } = await invoke('?provider=growatt')

    // vendor_alarms queried with provider in where
    const vendorCall = mockPrisma.vendor_alarms.findMany.mock.calls[0][0]
    expect(vendorCall.where.provider).toBe('growatt')

    // system rows are filtered by their device's provider (growatt → d2 only)
    expect(body.items.map((i: any) => i.id).sort()).toEqual(['system:2', 'vendor:v-bbb'])
    expect(body.items.every((i: any) => i.provider === 'growatt')).toBe(true)
  })

  it('severity filter is passed to both source queries', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([SYSTEM_ROWS[0]])
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([VENDOR_ROWS[0]])
    const { body } = await invoke('?severity=CRITICAL')
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.severity).toBe('CRITICAL')
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.severity).toBe('CRITICAL')
    expect(body.items.every((i: any) => i.severity === 'CRITICAL')).toBe(true)
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
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([])
    mockPrisma.alerts.findMany.mockResolvedValue([])
    const { res } = await invoke('?provider=csi')
    expect(res.status).toBe(200)
  })

  it('resolved defaults to open-only (resolved_at: null on both queries)', async () => {
    await invoke()
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toBeNull()
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.resolved_at).toBeNull()
  })

  it('resolved=true filters to resolved rows on both queries', async () => {
    await invoke('?resolved=true')
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toEqual({ not: null })
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.resolved_at).toEqual({ not: null })
  })

  it('resolved=all applies no resolved_at filter on either query', async () => {
    await invoke('?resolved=all')
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toBeUndefined()
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.resolved_at).toBeUndefined()
  })

  it('q matches case-insensitively on plant_name OR device_name', async () => {
    // "dha" → only plant p2 (DHA Site): system:2 + vendor:v-bbb
    const { body } = await invoke('?q=dha')
    expect(body.items.map((i: any) => i.id).sort()).toEqual(['system:2', 'vendor:v-bbb'])

    // device name match
    const { body: body2 } = await invoke('?q=inv-a')
    expect(body2.items.map((i: any) => i.id).sort()).toEqual(['system:1', 'vendor:v-aaa'])
  })

  it('paginates the merged feed (total reflects the full merge)', async () => {
    const { body } = await invoke('?page=2&pageSize=2')
    expect(body.total).toBe(4)
    expect(body.page).toBe(2)
    expect(body.pageSize).toBe(2)
    expect(body.items).toHaveLength(2)
    // Page 2 of the DESC merge = the two oldest: vendor:v-aaa(30m), system:2(50m)
    expect(body.items.map((i: any) => i.id)).toEqual(['vendor:v-aaa', 'system:2'])
  })

  it('caps pageSize at 100', async () => {
    const { body } = await invoke('?pageSize=9999')
    expect(body.pageSize).toBe(100)
  })

  it('returns an empty feed when both sources are empty', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([])
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([])
    const { res, body } = await invoke()
    expect(res.status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
  })

  it('capped=false when neither source hits the per-source cap', async () => {
    const { body } = await invoke()
    expect(body.capped).toBe(false)
  })

  it('capped=true when a source hits SOURCE_CAP (500 rows)', async () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, device_id: 'd1', plant_id: 'p1', string_number: 1, severity: 'INFO',
      message: 'x', gap_percent: 0, created_at: minsAgo(i + 1), resolved_at: null,
    }))
    mockPrisma.alerts.findMany.mockResolvedValue(big)
    const { body } = await invoke()
    expect(body.capped).toBe(true)
  })
})
