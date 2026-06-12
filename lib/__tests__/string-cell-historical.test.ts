import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    string_daily: { findMany: vi.fn() },
    string_configs: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { loadStringHistorical, HISTORICAL_BASELINE_DAYS } from '@/lib/string-cell-historical'

const mockPrisma = prisma as unknown as {
  string_daily: { findMany: ReturnType<typeof vi.fn> }
  string_configs: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.string_daily.findMany.mockResolvedValue([])
  mockPrisma.string_configs.findUnique.mockResolvedValue(null)
})

describe('loadStringHistorical', () => {
  it('bounds the @db.Date window at UTC-midnight of the PKT date (matching getPKTDateForDB), excluding the requested day', async () => {
    await loadStringHistorical('d1', 3, '2026-06-11', 8)
    const arg = mockPrisma.string_daily.findMany.mock.calls[0][0]
    expect(arg.where.device_id).toBe('d1')
    expect(arg.where.string_number).toBe(3)
    // UTC-midnight of the requested PKT date — the SAME key the poller writes,
    // so the requested day is excluded and only prior days are summed.
    expect(arg.where.date.lt.toISOString()).toBe('2026-06-11T00:00:00.000Z')
    // ...and the window starts exactly N days before that.
    expect(arg.where.date.gte.toISOString()).toBe('2026-05-12T00:00:00.000Z')
    expect(arg.where.date.lt.getTime() - arg.where.date.gte.getTime()).toBe(HISTORICAL_BASELINE_DAYS * 86_400_000)
  })

  it('prefers a manual baseline when configured', async () => {
    mockPrisma.string_daily.findMany.mockResolvedValue([
      { avg_current: new Decimal('4') }, { avg_current: new Decimal('6') },
    ])
    mockPrisma.string_configs.findUnique.mockResolvedValue({ manual_baseline_current: new Decimal('9.5') })

    const result = await loadStringHistorical('d1', 3, '2026-06-11', 8)
    expect(result.source).toBe('manual')
    expect(result.baseline).toBe(9.5)
    // 8 / 9.5 * 100 = 84.2 → 84
    expect(result.pct).toBe(84)
    expect(result.todayRepr).toBe(8)
  })

  it('falls back to the 30-day own median (positives only) when no manual baseline', async () => {
    mockPrisma.string_daily.findMany.mockResolvedValue([
      { avg_current: new Decimal('4') }, { avg_current: new Decimal('6') }, { avg_current: null }, { avg_current: new Decimal('0') },
    ])
    const result = await loadStringHistorical('d1', 3, '2026-06-11', 8)
    expect(result.source).toBe('30d')
    expect(result.baseline).toBe(5) // median of [4,6]
    expect(result.pct).toBe(100) // 8/5 = 160% capped to 100
  })

  it('returns null baseline/pct when no manual baseline and no positive history', async () => {
    const result = await loadStringHistorical('d1', 3, '2026-06-11', 8)
    expect(result.source).toBeNull()
    expect(result.baseline).toBeNull()
    expect(result.pct).toBeNull()
    expect(result.todayRepr).toBe(8)
  })
})
