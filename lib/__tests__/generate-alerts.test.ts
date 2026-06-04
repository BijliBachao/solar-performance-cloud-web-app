import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

// CQ audit 2026-06-05 finding #1: generateAlerts used to issue one awaited
// update/create per alert (N+1 write storm on the shared RDS during fault
// mornings). These tests pin the batched contract: at most ONE updateMany +
// ONE createMany per device per cycle, with unchanged alert semantics.

// Factory must be self-contained (vi.mock hoists above any const).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    alerts: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    string_configs: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { generateAlerts } from '../poller-utils'

const mockPrisma = prisma as unknown as {
  alerts: {
    findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>
  }
  string_configs: { findMany: ReturnType<typeof vi.fn> }
}

const m = (sn: number, current: number) => ({
  string_number: sn,
  current: new Decimal(current.toFixed(3)),
  voltage: new Decimal('600'),
  power: new Decimal((600 * current).toFixed(2)),
})

const configs = {
  unusedSet: new Set<number>(),
  peerExcludedSet: new Set<number>(),
  panelCountByString: new Map<number, number>(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.alerts.findMany.mockResolvedValue([])
  mockPrisma.string_configs.findMany.mockResolvedValue([])
})

describe('generateAlerts — batched writes', () => {
  it('creates MULTIPLE new alerts with ONE createMany (never per-row create)', async () => {
    // 4 healthy peers at 10A + two dead strings → 2 CRITICAL alerts expected
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 0), m(6, 0)], configs)

    expect(mockPrisma.alerts.create).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.createMany).toHaveBeenCalledTimes(1)
    const rows = mockPrisma.alerts.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(rows.map((r: any) => r.string_number).sort()).toEqual([5, 6])
    for (const r of rows) {
      expect(r.severity).toBe('CRITICAL')
      expect(r.device_id).toBe('dev1')
      expect(r.message).toMatch(/near-zero current/)
    }
  })

  it('resolves MULTIPLE recovered alerts with ONE updateMany (never per-row update)', async () => {
    // Two open CRITICALs whose strings are now healthy → both resolve in one call
    mockPrisma.alerts.findMany.mockResolvedValue([
      { id: 11, string_number: 5, severity: 'CRITICAL' },
      { id: 12, string_number: 6, severity: 'CRITICAL' },
    ])
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 0), m(6, 0)], configs)
    // strings 5/6 are still dead → severities unchanged → nothing resolves
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()

    // now they recover — but a recovered string produces NO severity entry,
    // so resolution happens via severity-mismatch with remaining entries
    vi.clearAllMocks()
    mockPrisma.alerts.findMany.mockResolvedValue([
      { id: 11, string_number: 5, severity: 'CRITICAL' },
      { id: 12, string_number: 6, severity: 'CRITICAL' },
    ])
    // 5 and 6 healthy again; string 4 dead now (keeps currentSeverities non-empty)
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 0), m(5, 10), m(6, 10)], configs)

    expect(mockPrisma.alerts.update).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.alerts.updateMany.mock.calls[0][0]
    expect(arg.where.id.in.sort()).toEqual([11, 12])
    expect(arg.data.resolved_at).toBeInstanceOf(Date)
  })

  it('already-open same-severity alert is not duplicated', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([
      { id: 11, string_number: 5, severity: 'CRITICAL' },
    ])
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 0)], configs)
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()
  })
})
