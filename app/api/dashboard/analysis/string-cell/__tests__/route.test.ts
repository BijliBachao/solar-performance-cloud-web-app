import { describe, it, expect, vi, beforeEach } from 'vitest'

// V1 drill-down route: reads string_hourly.median_current/reading_count, recomputes
// via the SAME shared helper (prepSettledDayInputs) + scoreStringPerformance, and
// returns raw_performance, data_completeness, band, condition_tag alongside the
// existing back-compat fields (status, performance, repr_current, peers, …).

const mockPrisma = {
  plant_assignments: { findMany: vi.fn() },
  devices: { findFirst: vi.fn() },
  string_hourly: { findMany: vi.fn() },
  string_configs: { findMany: vi.fn(), findUnique: vi.fn() },
  string_daily: { findMany: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/api-auth', () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({ userId: 'u1', organizationId: 'org1', role: 'ORG_ADMIN' }),
  requireOrganization: vi.fn(),
  createErrorResponse: (err: any) =>
    new Response(JSON.stringify({ error: err.message }), { status: err.statusCode ?? 403 }),
  ApiAuthError: class ApiAuthError extends Error {},
}))

// PKT hour h → UTC (h-5). Full window 8..15 PKT, two equal strings + one weak.
function hourly(pktHours: number[], sn: number, med: number) {
  return pktHours.map(p => ({
    string_number: sn,
    hour: new Date(Date.UTC(2026, 5, 15, p - 5)),
    avg_current: med,
    median_current: med,
    reading_count: 12,
  }))
}

function makeReq(query: string): any {
  const url = new URL(`http://localhost:3001/api/dashboard/analysis/string-cell${query}`)
  return { nextUrl: { searchParams: url.searchParams } }
}

async function invoke(query: string) {
  const { GET } = await import('@/app/api/dashboard/analysis/string-cell/route')
  const res = await GET(makeReq(query))
  return res.json()
}

describe('GET /api/dashboard/analysis/string-cell (V1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.plant_assignments.findMany.mockResolvedValue([{ plant_id: 'p1' }])
    mockPrisma.devices.findFirst.mockResolvedValue({ id: 'dev1', device_name: 'INV-1' })
    mockPrisma.string_daily.findMany.mockResolvedValue([])
    mockPrisma.string_configs.findUnique.mockResolvedValue(null)
  })

  it('returns raw_performance, data_completeness, band, condition_tag for a healthy string', async () => {
    const win = [8, 9, 10, 11, 12, 13, 14, 15]
    mockPrisma.string_hourly.findMany.mockResolvedValue([
      ...hourly(win, 1, 6),
      ...hourly(win, 2, 6),
      ...hourly(win, 3, 6),
    ])
    mockPrisma.string_configs.findMany.mockResolvedValue([
      { string_number: 1, is_used: true, exclude_from_peer_comparison: false, condition_tag: 'normal' },
    ])

    const body = await invoke('?device_id=dev1&string_number=1&date=2026-06-15')
    expect(body.performance).toBe(100)
    expect(body.raw_performance).toBe(100)
    expect(body.band).toBe('normal')
    expect(body.status).toBe('healthy') // back-compat
    expect(body.data_completeness).toBe(100) // 96/96
    expect(body.repr_current).toBe(6)
    expect(body.peer_median_current).toBe(6)
    expect(body.condition_tag).toBe('normal')
    expect(body.peers.length).toBe(3)
  })

  it('a weak string reports its underperforming band + uncapped raw', async () => {
    const win = [8, 9, 10, 11, 12, 13, 14, 15]
    mockPrisma.string_hourly.findMany.mockResolvedValue([
      ...hourly(win, 1, 10),
      ...hourly(win, 2, 10),
      ...hourly(win, 3, 10),
      ...hourly(win, 4, 7), // 70%
    ])
    mockPrisma.string_configs.findMany.mockResolvedValue([])

    const body = await invoke('?device_id=dev1&string_number=4&date=2026-06-15')
    expect(body.performance).toBe(70)
    expect(body.raw_performance).toBe(70)
    expect(body.band).toBe('underperforming')
    expect(body.status).toBe('warning') // back-compat (abnormal → warning)
  })

  it('a thin day (<60% readings) reports insufficient_data + completeness', async () => {
    mockPrisma.string_hourly.findMany.mockResolvedValue([
      ...hourly([8, 9], 1, 6),
      ...hourly([8, 9], 2, 6),
    ]) // 24/96 = 25%
    mockPrisma.string_configs.findMany.mockResolvedValue([])

    const body = await invoke('?device_id=dev1&string_number=1&date=2026-06-15')
    expect(body.performance).toBeNull()
    expect(body.band).toBe('insufficient_data')
    expect(body.status).toBe('no_data')
    expect(body.data_completeness).toBe(25)
    expect(body.historical).toBeNull() // not peer-excluded → no own-trend block
  })

  it('peer-excluded string returns a historical own-trend block (informational, not a peer ratio)', async () => {
    const win = [8, 9, 10, 11, 12, 13, 14, 15]
    mockPrisma.string_hourly.findMany.mockResolvedValue([
      ...hourly(win, 1, 10),
      ...hourly(win, 2, 10),
      ...hourly(win, 3, 4), // shaded string runs low — but it's peer-excluded
    ])
    mockPrisma.string_configs.findMany.mockResolvedValue([
      { string_number: 3, is_used: true, exclude_from_peer_comparison: true, condition_tag: 'shaded' },
    ])
    // Own 30-day history → median 5; today's repr_current is 4 → 80%.
    mockPrisma.string_daily.findMany.mockResolvedValue([
      { avg_current: 4 }, { avg_current: 6 },
    ])

    const body = await invoke('?device_id=dev1&string_number=3&date=2026-06-15')
    expect(body.band).toBe('peer_excluded')
    expect(body.status).toBe('peer_excluded')
    expect(body.performance).toBeNull() // no peer ratio for excluded strings
    expect(body.historical).not.toBeNull()
    expect(body.historical.source).toBe('30d')
    expect(body.historical.baseline).toBe(5)
    expect(body.historical.todayRepr).toBe(4)
    expect(body.historical.pct).toBe(80)
  })
})
