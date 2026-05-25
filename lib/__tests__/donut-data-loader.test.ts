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

  it('returns counts derived from rows (typical happy path)', async () => {
    mockPrevDay([
      { device_id: 'd1', string_number: 1, health_score: new Decimal('95'),   is_used: true,  exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 2, health_score: new Decimal('92'),   is_used: true,  exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 3, health_score: new Decimal('70'),   is_used: true,  exclude_from_peer_comparison: false },
      { device_id: 'd1', string_number: 4, health_score: new Decimal('40'),   is_used: true,  exclude_from_peer_comparison: false },
    ])
    const { loadPlantDonutPrevDay } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutPrevDay('plantX')

    expect(result.totalStrings).toBe(4)
    expect(result.counts).toEqual({ healthy: 2, abnormal: 1, critical: 1, noData: 0 })
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

    // 89.999 is < 90 so should bucket Abnormal (boundary test)
    expect(result.counts.abnormal).toBe(1)
  })
})

function mockLast3h(hourlyRows: any[], unusedCount: number = 0) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce(hourlyRows)
    .mockResolvedValueOnce([{ unused: BigInt(unusedCount) }])
}

// Build an hourly row for the SR-based Last-3h donut. power=null → no data.
// model/max_strings null → device-wide peer pool (max-anchored). 16 panels @ ~600V.
function hRow(
  sn: number, hour: string, power: number | null,
  opts: { is_used?: boolean; exclude?: boolean; panel_count?: number | null } = {},
) {
  return {
    device_id: 'd1', string_number: sn,
    avg_current: power == null ? null : new Decimal((power / 600).toFixed(3)),
    avg_voltage: power == null ? null : new Decimal('600'),
    avg_power: power == null ? null : new Decimal(String(power)),
    hour: new Date(hour),
    is_used: opts.is_used ?? true,
    exclude_from_peer_comparison: opts.exclude ?? false,
    panel_count: opts.panel_count ?? 16,
    model: null,
    max_strings: null,
  }
}

describe('loadPlantDonutLast3h', () => {
  it('queries string_hourly for the last 3 completed hours', async () => {
    mockLast3h([])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    await loadPlantDonutLast3h('plantX')

    // Two calls: hourly rows + unused count
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2)
    const firstCall = mockPrisma.$queryRaw.mock.calls[0]
    const interpolated = firstCall.slice(1)
    expect(interpolated).toContain('plantX')
    // Window starts 3 hours before the current PKT hour boundary.
    // Now = 2026-05-24T05:00:00Z = 2026-05-24T10:00 PKT, current hour bucket 10:00 PKT.
    // 3 hours before = 07:00 PKT = 02:00 UTC; upper bound = current hour = 05:00 UTC.
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-24T02:00:00.000Z')).toBe(true)
    expect(interpolated.some((v: any) => v instanceof Date && v.toISOString() === '2026-05-24T05:00:00.000Z')).toBe(true)
  })

  it('scores strings by SR over hourly per-panel power; equal strings → Healthy', async () => {
    // Two strings, equal per-panel power (1600W / 16 panels = 100 W/panel) → SR 1.0 each.
    mockLast3h([
      hRow(1, '2026-05-24T02:00:00Z', 1600), hRow(1, '2026-05-24T03:00:00Z', 1600), hRow(1, '2026-05-24T04:00:00Z', 1600),
      hRow(2, '2026-05-24T02:00:00Z', 1600), hRow(2, '2026-05-24T03:00:00Z', 1600), hRow(2, '2026-05-24T04:00:00Z', 1600),
    ])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutLast3h('plantX')

    expect(result.totalStrings).toBe(2)
    expect(result.counts.healthy).toBe(2)
    expect(result.timeBasis.hoursCovered).toBe(3)
  })

  it('one string far below its MPPT peers (per-panel) → Critical', async () => {
    // s1,s2 = 100 W/panel; s3 = 40 W/panel → SR 0.4 vs best → Critical.
    mockLast3h([
      hRow(1, '2026-05-24T02:00:00Z', 1600), hRow(1, '2026-05-24T03:00:00Z', 1600), hRow(1, '2026-05-24T04:00:00Z', 1600),
      hRow(2, '2026-05-24T02:00:00Z', 1600), hRow(2, '2026-05-24T03:00:00Z', 1600), hRow(2, '2026-05-24T04:00:00Z', 1600),
      hRow(3, '2026-05-24T02:00:00Z', 640),  hRow(3, '2026-05-24T03:00:00Z', 640),  hRow(3, '2026-05-24T04:00:00Z', 640),
    ])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutLast3h('plantX')

    expect(result.counts.critical).toBeGreaterThanOrEqual(1)
    expect(result.counts.healthy).toBe(2)
  })

  it('falls back to since-sunrise label when fewer than 3 hours available', async () => {
    // Only 1 hour of data
    mockLast3h([
      { device_id: 'd1', string_number: 1, avg_current: new Decimal('5.0'), hour: new Date('2026-05-24T04:00:00Z'), is_used: true, exclude_from_peer_comparison: false },
    ])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutLast3h('plantX')

    expect(result.timeBasis.label).toMatch(/Since sunrise/i)
    expect(result.timeBasis.hoursCovered).toBe(1)
    expect(result.warnings.some(w => w.code === 'LIMITED_WINDOW')).toBe(true)
  })

  it('returns empty + warning when zero hourly rows in window', async () => {
    mockLast3h([])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutLast3h('plantX')

    expect(result.totalStrings).toBe(0)
    expect(result.warnings.some(w => w.code === 'NO_DATA_WINDOW')).toBe(true)
  })

  it('treats no-data rows as no-data instead of dropping them (C2 regression guard)', async () => {
    // 3 strings reporting; string #3 has no power/current for all hours.
    // Should appear as Abnormal/no-data, not vanish.
    mockLast3h([
      hRow(1, '2026-05-24T02:00:00Z', 1600), hRow(1, '2026-05-24T03:00:00Z', 1600), hRow(1, '2026-05-24T04:00:00Z', 1600),
      hRow(2, '2026-05-24T02:00:00Z', 1600), hRow(2, '2026-05-24T03:00:00Z', 1600), hRow(2, '2026-05-24T04:00:00Z', 1600),
      hRow(3, '2026-05-24T02:00:00Z', null), hRow(3, '2026-05-24T03:00:00Z', null), hRow(3, '2026-05-24T04:00:00Z', null),
    ])
    const { loadPlantDonutLast3h } = await import('@/lib/donut-data-loader')

    const result = await loadPlantDonutLast3h('plantX')

    expect(result.totalStrings).toBe(3)
    expect(result.counts.noData).toBe(1)
    expect(result.counts.abnormal).toBe(1)
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
