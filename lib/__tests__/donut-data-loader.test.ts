import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

// All loaders touch the DB, so we stub the prisma client. Tests verify:
//   - the right query is issued for the right scope
//   - rows are correctly mapped → DonutInput[] → DonutAggregate
//   - PKT timezone boundaries
//   - NULL / Decimal coercion
//   - warnings surfaced for empty / partial data

const mockPrisma = {
  $queryRaw: vi.fn(),
  organizations: { findMany: vi.fn().mockResolvedValue([]) },
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

// ─── PKT clock control ──────────────────────────────────────────────
// 2026-05-24 10:00:00 PKT = 2026-05-24 05:00:00 UTC
const PKT_NOW_UTC = new Date('2026-05-24T05:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(PKT_NOW_UTC)
  mockPrisma.$queryRaw.mockResolvedValue([])
  mockPrisma.organizations.findMany.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getPktYesterdayDate', () => {
  it('returns 2026-05-23 00:00:00 UTC when now is 2026-05-24 10:00 PKT', async () => {
    const { getPktYesterdayDate } = await import('@/lib/donut-data-loader')
    const result = getPktYesterdayDate()
    expect(result.toISOString()).toBe('2026-05-23T00:00:00.000Z')
  })

  it('returns yesterday in PKT across the midnight boundary', async () => {
    vi.setSystemTime(new Date('2026-05-24T19:30:00Z')) // 00:30 PKT on May 25
    const { getPktYesterdayDate } = await import('@/lib/donut-data-loader')
    const result = getPktYesterdayDate()
    expect(result.toISOString()).toBe('2026-05-24T00:00:00.000Z')
  })

  it('returns yesterday at the last UTC second before PKT midnight rolls over', async () => {
    vi.setSystemTime(new Date('2026-05-24T18:59:59Z')) // 23:59:59 PKT on May 24
    const { getPktYesterdayDate } = await import('@/lib/donut-data-loader')
    const result = getPktYesterdayDate()
    expect(result.toISOString()).toBe('2026-05-23T00:00:00.000Z')
  })
})

describe('getPktTodayDate', () => {
  it('returns 2026-05-24 00:00:00 UTC when now is 2026-05-24 10:00 PKT', async () => {
    const { getPktTodayDate } = await import('@/lib/donut-data-loader')
    expect(getPktTodayDate().toISOString()).toBe('2026-05-24T00:00:00.000Z')
  })

  it('rolls to the next PKT date across the midnight boundary', async () => {
    vi.setSystemTime(new Date('2026-05-24T19:30:00Z')) // 00:30 PKT on May 25
    const { getPktTodayDate } = await import('@/lib/donut-data-loader')
    expect(getPktTodayDate().toISOString()).toBe('2026-05-25T00:00:00.000Z')
  })

  it('is exactly one day after getPktYesterdayDate at any instant', async () => {
    const { getPktTodayDate, getPktYesterdayDate } = await import('@/lib/donut-data-loader')
    expect(getPktTodayDate().getTime() - getPktYesterdayDate().getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

// Helper: mock the two-query sequence for the per-plant prev-day path
//   1st call: string_daily JOIN string_configs rows
//   2nd call: SELECT COUNT(*) AS unused from string_configs (excluded.unused)
function mockPrevDay(dailyRows: any[], unusedCount: number = 0) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce(dailyRows)
    .mockResolvedValueOnce([{ unused: BigInt(unusedCount) }])
}

describe('loadPlantDonutPrevDay', () => {
  it('queries string_daily for the plant on yesterday', async () => {
    mockPrevDay([])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    await loadPlantDonutPrevDay('plantX')

    // Two calls: daily rows + unused count from configs
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2)
    const firstCall = mockPrisma.$queryRaw.mock.calls[0]
    const interpolated = firstCall.slice(1)
    expect(interpolated).toContain('plantX')
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-23T00:00:00.000Z')).toBe(true)
  })

  it('returns counts derived from rows (typical happy path, V1 bands)', async () => {
    mockPrevDay([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('95'),   is_used: true,  exclude_from_peer_comparison: false }, // healthy (Normal >=95)
      { device_id: 'd1', string_number: 2, health_score: new Decimal('92'),   is_used: true,  exclude_from_peer_comparison: false }, // abnormal (Watch [85,95))
      { device_id: 'd1', string_number: 3, health_score: new Decimal('70'),   is_used: true,  exclude_from_peer_comparison: false }, // abnormal (Underperforming [60,85))
      { device_id: 'd1', string_number: 4, health_score: new Decimal('40'),   is_used: true,  exclude_from_peer_comparison: false }, // critical (Serious Fault <60)
    ])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.totalStrings).toBe(4)
    expect(result.counts).toEqual({ healthy: 1, abnormal: 2, critical: 1, noData: 0 })
  })

  it('treats NULL health_score as no-data → Abnormal (override rule #4)', async () => {
    mockPrevDay([
      { device_id: 'd1', string_number: 1, health_score: null, is_used: true, exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 2, health_score: new Decimal('95'), is_used: true, exclude_from_peer_comparison: false },
    ])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.counts.abnormal).toBe(1)
    expect(result.counts.noData).toBe(1)
    expect(result.counts.healthy).toBe(1)
  })

  it('excluded.unused is derived from string_configs (poller filters is_used=false before writing string_daily)', async () => {
    // Daily rows contain only used strings (one healthy). Five additional
    // unused PV ports exist in string_configs but never made it into daily.
    mockPrevDay(
      [
        { device_id: 'd1', string_number: 1, health_score: new Decimal('95'), is_used: true, exclude_from_peer_comparison: false },
      ],
      5,
    )
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.totalStrings).toBe(1)
    expect(result.excluded.unused).toBe(5)
    expect(result.counts.healthy).toBe(1)
  })

  it('respects exclude_from_peer_comparison (counted under excluded.nonStandard)', async () => {
    mockPrevDay([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('95'), is_used: true, exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 2, health_score: new Decimal('30'), is_used: true, exclude_from_peer_comparison: true  },
    ])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.totalStrings).toBe(1)
    expect(result.excluded.nonStandard).toBe(1)
  })

  it('surfaces NO_DATA_YESTERDAY warning when zero rows returned', async () => {
    mockPrevDay([])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.totalStrings).toBe(0)
    expect(result.warnings.some(w => w.code === 'NO_DATA_YESTERDAY')).toBe(true)
  })

  it('time-basis label says "Yesterday · YYYY-MM-DD"', async () => {
    mockPrevDay([])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.timeBasis.label).toBe('Yesterday · 2026-05-23')
  })

  it('coerces Decimal health_score to Number cleanly', async () => {
    mockPrevDay([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('89.999'), is_used: true, exclude_from_peer_comparison: false },
    ])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    // 89.999 is in [85, 95) (Watch) so should bucket Abnormal (boundary test)
    expect(result.counts.abnormal).toBe(1)
  })
})

// loadPlantDonutToday mirrors loadPlantDonutPrevDay but reads TODAY's PKT
// string_daily (the V1 metric the poller recomputes every cycle), so the
// query shape is identical to prev-day.
function mockToday(dailyRows: any[], unusedCount: number = 0, lastSeen: Date | null = new Date('2026-05-24T04:55:00Z')) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce(dailyRows)
    .mockResolvedValueOnce([{ unused: BigInt(unusedCount) }])
    .mockResolvedValueOnce([{ last_seen: lastSeen }]) // MAX(devices.last_seen_at) — real liveness, not "now"
}

describe('loadPlantDonutToday (V1 cutover — reads today\'s string_daily)', () => {
  it('queries string_daily for the plant on TODAY (PKT)', async () => {
    mockToday([])
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    await loadPlantDonutToday('plantX')

    // Three calls: daily rows + unused count from configs + MAX(last_seen_at) liveness
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3)
    const firstCall = mockPrisma.$queryRaw.mock.calls[0]
    const interpolated = firstCall.slice(1)
    expect(interpolated).toContain('plantX')
    // Now = 2026-05-24T05:00:00Z = 2026-05-24 10:00 PKT → today = 2026-05-24.
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-24T00:00:00.000Z')).toBe(true)
  })

  it('buckets via the V1 classifier (95/85/60), same as prev-day / NOC / analysis', async () => {
    mockToday([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('96'), is_used: true, exclude_from_peer_comparison: false }, // healthy (Normal >=95)
      { device_id: 'd1', string_number: 2, health_score: new Decimal('90'), is_used: true, exclude_from_peer_comparison: false }, // abnormal (Watch)
      { device_id: 'd1', string_number: 3, health_score: new Decimal('70'), is_used: true, exclude_from_peer_comparison: false }, // abnormal (Underperforming)
      { device_id: 'd1', string_number: 4, health_score: new Decimal('40'), is_used: true, exclude_from_peer_comparison: false }, // critical (Serious Fault <60)
    ])
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    expect(result.totalStrings).toBe(4)
    expect(result.counts).toEqual({ healthy: 1, abnormal: 2, critical: 1, noData: 0 })
    expect(result.timeBasis.label).toMatch(/^Today · 2026-05-24 · live$/)
  })

  it('treats NULL health_score as no-data → Abnormal (override rule #4)', async () => {
    mockToday([
      { device_id: 'd1', string_number: 1, health_score: null, is_used: true, exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 2, health_score: new Decimal('96'), is_used: true, exclude_from_peer_comparison: false },
    ])
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    expect(result.counts.noData).toBe(1)
    expect(result.counts.abnormal).toBe(1)
    expect(result.counts.healthy).toBe(1)
  })

  it('returns empty + NO_DATA_TODAY warning when no rows for today', async () => {
    mockToday([], 3)
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    expect(result.totalStrings).toBe(0)
    expect(result.warnings.some(w => w.code === 'NO_DATA_TODAY')).toBe(true)
    // excluded.unused is pulled from string_configs even when no daily rows exist
    expect(result.excluded.unused).toBe(3)
  })

  it('does NOT use the SR-anchored bucket path (peer-excluded is dropped, not scored)', async () => {
    mockToday([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('96'), is_used: true, exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 2, health_score: new Decimal('30'), is_used: true, exclude_from_peer_comparison: true }, // peer-excluded → excluded.nonStandard, not critical
    ])
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    expect(result.totalStrings).toBe(1)
    expect(result.counts.healthy).toBe(1)
    expect(result.counts.critical).toBe(0)
    expect(result.excluded.nonStandard).toBe(1)
  })

  it('freshness.lastDataAt reflects the real MAX(last_seen_at), NOT "now" (so isStale can fire)', async () => {
    const realLastSeen = new Date('2026-05-24T04:30:00Z') // 30 min before the frozen "now"
    mockToday(
      [{ device_id: 'd1', string_number: 1, health_score: new Decimal('96'), is_used: true, exclude_from_peer_comparison: false }],
      0,
      realLastSeen,
    )
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    // Must be the device's last poll time, not request time — else a dead poller
    // would show frozen morning scores under a permanently-"live" badge.
    expect(result.freshness.lastDataAt).toEqual(realLastSeen)
  })

  it('freshness.lastDataAt is null when there are no scores yet (pre-dawn — no false stale)', async () => {
    mockToday([], 0, new Date('2026-05-24T04:55:00Z'))
    const { loadPlantDonutToday } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutToday('plantX')

    expect(result.freshness.lastDataAt).toBeNull()
  })
})

describe('loadFleetCounts', () => {
  it('queries with no org filter when orgId omitted', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 100n, abnormal_by_score: 5n, critical_by_score: 2n, no_data: 3n,
      excluded_unused: 10n, excluded_nonstandard: 4n,
    }])
    const { loadFleetCounts } = await import('@/lib/donut-data-loader')

    const result = await loadFleetCounts()

    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
    expect(result.totalStrings).toBe(110) // healthy + abnormal_by_score + critical + no_data
    expect(result.counts.healthy).toBe(100)
    expect(result.counts.abnormal).toBe(8) // by_score + no_data
    expect(result.counts.critical).toBe(2)
    expect(result.counts.noData).toBe(3)
    expect(result.excluded.unused).toBe(10)
    expect(result.excluded.nonStandard).toBe(4)
  })

  it('applies org filter when orgId provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 5n, abnormal_by_score: 0n, critical_by_score: 0n, no_data: 0n,
      excluded_unused: 0n, excluded_nonstandard: 0n,
    }])
    const { loadFleetCounts } = await import('@/lib/donut-data-loader')

    await loadFleetCounts('org-acme')

    const interpolated = mockPrisma.$queryRaw.mock.calls[0].slice(1)
    expect(interpolated).toContain('org-acme')
  })

  it('handles zero-data response gracefully', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 0n, abnormal_by_score: 0n, critical_by_score: 0n, no_data: 0n,
      excluded_unused: 0n, excluded_nonstandard: 0n,
    }])
    const { loadFleetCounts } = await import('@/lib/donut-data-loader')

    const result = await loadFleetCounts()

    expect(result.totalStrings).toBe(0)
    expect(result.warnings.some(w => w.code === 'NO_DATA_YESTERDAY')).toBe(true)
  })

  it('defaults to yesterday with the settled label', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 1n, abnormal_by_score: 0n, critical_by_score: 0n, no_data: 0n,
      excluded_unused: 0n, excluded_nonstandard: 0n,
    }])
    const { loadFleetCounts } = await import('@/lib/donut-data-loader')

    const result = await loadFleetCounts()

    expect(result.timeBasis.label).toBe('Yesterday · 2026-05-23')
    const interpolated = mockPrisma.$queryRaw.mock.calls[0].slice(1)
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-23T00:00:00.000Z')).toBe(true)
  })

  it("date=today → queries today's rows, labels 'Today · … · live', endsAt = now", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 1n, abnormal_by_score: 0n, critical_by_score: 0n, no_data: 0n,
      excluded_unused: 0n, excluded_nonstandard: 0n,
    }])
    const { loadFleetCounts, getPktTodayDate } = await import('@/lib/donut-data-loader')

    const result = await loadFleetCounts(undefined, { date: getPktTodayDate() })

    expect(result.timeBasis.label).toBe('Today · 2026-05-24 · live')
    // window is still open — ends "now", not at PKT midnight
    expect(result.timeBasis.endsAt.toISOString()).toBe(PKT_NOW_UTC.toISOString())
    const interpolated = mockPrisma.$queryRaw.mock.calls[0].slice(1)
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-24T00:00:00.000Z')).toBe(true)
  })

  it('date=today + zero rows → NO_DATA_TODAY warning (not NO_DATA_YESTERDAY)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      healthy: 0n, abnormal_by_score: 0n, critical_by_score: 0n, no_data: 0n,
      excluded_unused: 0n, excluded_nonstandard: 0n,
    }])
    const { loadFleetCounts, getPktTodayDate } = await import('@/lib/donut-data-loader')

    const result = await loadFleetCounts(undefined, { date: getPktTodayDate() })

    expect(result.warnings.some(w => w.code === 'NO_DATA_TODAY')).toBe(true)
    expect(result.warnings.some(w => w.code === 'NO_DATA_YESTERDAY')).toBe(false)
  })
})

describe('loadFleetRows', () => {
  it('returns paginated rows with bucket filter', async () => {
    // Two calls: items + count
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { org_id: 'o1', org_name: 'Acme', plant_code: 'p1', plant_name: 'Plant 1', device_id: 'd1', inverter_name: 'INV-1', string_number: 1, health_score: new Decimal('30') },
      ])
      .mockResolvedValueOnce([{ total: 1n }])

    const { loadFleetRows } = await import('@/lib/donut-data-loader')

    const result = await loadFleetRows({ bucket: 'critical', page: 1 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].bucket).toBe('critical')
    expect(result.items[0].plantCode).toBe('p1')
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
  })

  it('respects page offset (page 2 → OFFSET 50)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }])

    const { loadFleetRows } = await import('@/lib/donut-data-loader')

    await loadFleetRows({ page: 2 })

    const interpolated = mockPrisma.$queryRaw.mock.calls[0].slice(1)
    expect(interpolated).toContain(50) // offset
  })
})

describe('loadFleetConnectivity', () => {
  it('produces live/frozen/offline/idle counts from per-device signals', async () => {
    // Fixed clock = 2026-05-24T05:00:00Z (see PKT_NOW_UTC).
    const now = PKT_NOW_UTC.getTime()
    const minAgo = (m: number) => new Date(now - m * 60 * 1000)
    const hAgo = (h: number) => new Date(now - h * 60 * 60 * 1000)

    // null lat/long → isDaylight() returns true (can't gate ⇒ treat as sun up),
    // so live/frozen/offline are exercised independent of solar geometry.
    mockPrisma.$queryRaw.mockResolvedValue([
      // live: vendor data 5 min ago (< 2h) → live
      { device_id: 'd-live', plant_code: 'p1', inverter_name: 'INV-LIVE', provider: 'huawei',
        vendor_last_data_at: minAgo(5), reading_changed_at: null, last_write_at: minAgo(5),
        latitude: null, longitude: null },
      // frozen: vendor data 3h old (stale) but we wrote a row 5 min ago (< 15m) → frozen
      { device_id: 'd-frozen', plant_code: 'p1', inverter_name: 'INV-FROZEN', provider: 'solis',
        vendor_last_data_at: hAgo(3), reading_changed_at: null, last_write_at: minAgo(5),
        latitude: null, longitude: null },
      // offline: vendor data old and last write 1h ago (≥ 15m) → offline
      { device_id: 'd-offline', plant_code: 'p2', inverter_name: 'INV-OFF', provider: 'sungrow',
        vendor_last_data_at: hAgo(6), reading_changed_at: null, last_write_at: hAgo(1),
        latitude: null, longitude: null },
      // garbage coords (vendor-default Beijing) are CLAMPED to the fleet
      // centroid → Pakistan daytime at this instant → stale device reads
      // offline, not US/Beijing-night idle (Zahoor Diary Farm regression).
      { device_id: 'd-badcoords', plant_code: 'p3', inverter_name: 'INV-BJ', provider: 'huawei',
        vendor_last_data_at: hAgo(8), reading_changed_at: null, last_write_at: hAgo(8),
        latitude: new Decimal('39.906922'), longitude: new Decimal('116.397551') },
    ])

    const { loadFleetConnectivity } = await import('@/lib/donut-data-loader')

    const result = await loadFleetConnectivity()

    expect(result.counts).toEqual({ live: 1, frozen: 1, offline: 2, idle: 0 })
    expect(result.devices).toHaveLength(4)
    const live = result.devices.find((d) => d.deviceId === 'd-live')
    expect(live?.status).toBe('live')
    expect(live?.inverterName).toBe('INV-LIVE')
    expect(live?.effectiveFreshAt).toBe(minAgo(5).toISOString())
    expect(result.devices.find((d) => d.deviceId === 'd-badcoords')?.status).toBe('offline')
  })

  it('idle at PKT night for a sleeping device — even with garbage Beijing coords (clamp)', async () => {
    // 2026-05-23T21:00:00Z = 02:00 PKT (night in Pakistan; Beijing sunrise
    // hits ~01:45 PKT, which previously flipped these devices to OFFLINE).
    // Last real data 7h ago ≈ 19:00 PKT ≈ sunset — an honest dusk-sleeper
    // (sun below the 8° production-hours floor at its final reading).
    vi.setSystemTime(new Date('2026-05-23T21:00:00Z'))
    const now = Date.now()
    const hAgo = (h: number) => new Date(now - h * 3600e3)
    mockPrisma.$queryRaw.mockResolvedValue([
      { device_id: 'd-sleep', plant_code: 'p1', inverter_name: 'INV-SLEEP', provider: 'huawei',
        vendor_last_data_at: hAgo(7), reading_changed_at: null, last_write_at: hAgo(7),
        latitude: new Decimal('39.906922'), longitude: new Decimal('116.397551') },
    ])
    const { loadFleetConnectivity } = await import('@/lib/donut-data-loader')
    const result = await loadFleetConnectivity()
    expect(result.counts).toEqual({ live: 0, frozen: 0, offline: 0, idle: 1 })
  })

  it('night does NOT amnesty broken feeds: noon-dead and multi-day freezes stay frozen at 02:00 PKT', async () => {
    // Audit 2026-06-05: the idle branch preceded the frozen check, so every
    // frozen feed was reclassified "Idle · night" at dusk — the NOC frozen
    // count silently dropped to zero overnight (Qadir's 3-day freeze) and
    // "re-discovered" the same faults at dawn. 24/7 doctrine: night must not
    // hide a feed that was already broken in daylight.
    vi.setSystemTime(new Date('2026-05-23T21:00:00Z')) // 02:00 PKT
    const now = Date.now()
    const hAgo = (h: number) => new Date(now - h * 3600e3)
    mockPrisma.$queryRaw.mockResolvedValue([
      // Feed died ~13:00 PKT (13h ago, sun solidly up at its last reading).
      { device_id: 'd-noon-dead', plant_code: 'p1', inverter_name: 'INV-ND', provider: 'sungrow',
        vendor_last_data_at: null, reading_changed_at: hAgo(13), last_write_at: hAgo(0.05),
        latitude: new Decimal('31.5'), longitude: new Decimal('74.3') },
      // Qadir pattern: last real data 3 DAYS ago — missed whole daylight periods.
      { device_id: 'd-qadir', plant_code: 'p2', inverter_name: 'INV-Q', provider: 'sungrow',
        vendor_last_data_at: null, reading_changed_at: hAgo(72), last_write_at: hAgo(0.05),
        latitude: new Decimal('31.5'), longitude: new Decimal('74.3') },
    ])
    const { loadFleetConnectivity } = await import('@/lib/donut-data-loader')
    const result = await loadFleetConnectivity()
    expect(result.counts).toEqual({ live: 0, frozen: 2, offline: 0, idle: 0 })
  })
})

describe('loadOrgList', () => {
  it('returns ordered list with string counts', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'o1', name: 'Acme', string_count: 120n },
      { id: 'o2', name: 'Beta', string_count: 50n },
    ])
    const { loadOrgList } = await import('@/lib/donut-data-loader')

    const result = await loadOrgList()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 'o1', name: 'Acme', stringCount: 120 })
    expect(result[1].stringCount).toBe(50)
  })
})

// ─── NOC v3 pure assemblers ──────────────────────────────────────────
// Dynamic import (matches this file's pattern): the prisma vi.mock factory
// must initialize before the loader module is evaluated.

const connFixture = {
  counts: { live: 2, frozen: 1, offline: 1, idle: 1 },
  devices: [
    { deviceId: 'a', plantCode: 'P1', plantName: 'Alpha', inverterName: 'I1', provider: 'csi', status: 'frozen' as const, effectiveFreshAt: '2026-06-01T10:00:00.000Z' },
    { deviceId: 'b', plantCode: 'P1', plantName: 'Alpha', inverterName: 'I2', provider: 'csi', status: 'live' as const, effectiveFreshAt: '2026-06-04T10:00:00.000Z' },
    { deviceId: 'c', plantCode: 'P2', plantName: 'Beta', inverterName: 'I3', provider: 'solis', status: 'offline' as const, effectiveFreshAt: '2026-05-25T14:17:00.000Z' },
    { deviceId: 'd', plantCode: 'P3', plantName: 'Gamma', inverterName: 'I4', provider: 'huawei', status: 'live' as const, effectiveFreshAt: '2026-06-04T10:00:00.000Z' },
    { deviceId: 'e', plantCode: 'P4', plantName: 'Delta', inverterName: 'I5', provider: 'huawei', status: 'idle' as const, effectiveFreshAt: null },
  ],
}
const critFixture = [
  { plantCode: 'P1', plantName: 'Alpha', crit: 3 },
  { plantCode: 'P5', plantName: 'Epsilon', crit: 1 },
]

describe('buildFleetKpis (pure)', () => {
  it('tallies offline/frozen/critical and unions plants-with-issues', async () => {
    const { buildFleetKpis } = await import('../donut-data-loader')
    const k = buildFleetKpis(connFixture, critFixture)
    expect(k.offlineInverters).toBe(1)
    expect(k.frozenInverters).toBe(1)
    expect(k.criticalStrings).toBe(4)
    // P1 (frozen+crit), P2 (offline), P5 (crit) — union = 3
    expect(k.plantsWithIssues).toBe(3)
    // live 2 of reporting 4 (idle excluded) = 50%
    expect(k.livePct).toBe(50)
  })
  it('livePct is null when nothing is reporting', async () => {
    const { buildFleetKpis } = await import('../donut-data-loader')
    const k = buildFleetKpis({ counts: { live: 0, frozen: 0, offline: 0, idle: 5 }, devices: [] }, [])
    expect(k.livePct).toBeNull()
    expect(k.plantsWithIssues).toBe(0)
  })
  it('null connectivity (Yesterday·settled) → health-only strip, conn KPIs null', async () => {
    const { buildFleetKpis } = await import('../donut-data-loader')
    const k = buildFleetKpis(null, critFixture)
    expect(k.offlineInverters).toBeNull()
    expect(k.frozenInverters).toBeNull()
    expect(k.livePct).toBeNull()
    expect(k.criticalStrings).toBe(4)
    // P1 + P5 have crit strings — no conn union on a settled view
    expect(k.plantsWithIssues).toBe(2)
  })
})

describe('buildAttention (pure)', () => {
  it('ranks by crit + frozen*2 + offline*3 and carries worstSince', async () => {
    const { buildAttention } = await import('../donut-data-loader')
    const a = buildAttention(connFixture, critFixture)
    // P1: crit 3 + frozen 2 = 5; P2: offline 3; P5: crit 1
    expect(a.map((p) => p.plantCode)).toEqual(['P1', 'P2', 'P5'])
    expect(a[0]).toMatchObject({ plantName: 'Alpha', critStrings: 3, frozen: 1, offline: 0, score: 5 })
    expect(a[0].worstSince).toBe('2026-06-01T10:00:00.000Z')
    expect(a[1].worstSince).toBe('2026-05-25T14:17:00.000Z')
  })
  it('returns empty when the fleet is clean', async () => {
    const { buildAttention } = await import('../donut-data-loader')
    expect(buildAttention({ counts: { live: 1, frozen: 0, offline: 0, idle: 0 }, devices: [] }, [])).toEqual([])
  })
  it('null connectivity (Yesterday·settled) → ranks by critical strings only', async () => {
    const { buildAttention } = await import('../donut-data-loader')
    const a = buildAttention(null, critFixture)
    expect(a.map((p) => p.plantCode)).toEqual(['P1', 'P5'])
    expect(a[0]).toMatchObject({ critStrings: 3, frozen: 0, offline: 0, score: 3, worstSince: null })
  })
})
