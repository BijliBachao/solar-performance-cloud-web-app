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
import { classifyAlertSeverityWithHysteresis } from '../string-health'

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

describe('generateAlerts — sun-armed + hysteresis (2026-06-05)', () => {
  it('disarmed (sun < 10°): NOTHING happens — no reads, creates, or resolves', async () => {
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 0)], configs, false)
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()
  })

  it('FULL-RECOVERY bug fix: last faulty string recovers → its alert resolves (used to linger forever)', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([
      { id: 21, string_number: 5, severity: 'CRITICAL', gap_percent: null },
    ])
    // every string healthy → currentSeverities empty → old code early-returned
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 10)], configs)
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.alerts.updateMany.mock.calls[0][0].where.id.in).toEqual([21])
  })

  it('dead-string recovery deadband: 0.15A stays dead (no churn); 0.25A resolves', async () => {
    // Peers kept LOW (below MIN_AVG_FOR_COMPARISON) to isolate the dead-string
    // path — with 10A peers a 0.25A string would CORRECTLY stay alerted via
    // peer comparison (~97% below), which is separate, intended behavior.
    const openDead = [{ id: 31, string_number: 5, severity: 'CRITICAL', gap_percent: null }]
    mockPrisma.alerts.findMany.mockResolvedValue(openDead)
    await generateAlerts('dev1', 'plant1',
      [m(1, 0.3), m(2, 0.3), m(3, 0.3), m(4, 0.3), m(5, 0.15)], configs)
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled() // still dead — alert kept, no flap
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mockPrisma.string_configs.findMany.mockResolvedValue([])
    mockPrisma.alerts.findMany.mockResolvedValue(openDead)
    await generateAlerts('dev1', 'plant1',
      [m(1, 0.3), m(2, 0.3), m(3, 0.3), m(4, 0.3), m(5, 0.25)], configs)
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1) // genuinely recovered (cleared 2× threshold)
  })
})

describe('classifyAlertSeverityWithHysteresis (pure)', () => {
  it('sticky zone: existing CRITICAL at gap 48 stays CRITICAL (50−3 boundary)', () => {
    expect(classifyAlertSeverityWithHysteresis(48, 'CRITICAL')).toBe('CRITICAL')
    expect(classifyAlertSeverityWithHysteresis(46, 'CRITICAL')).toBe('WARNING') // < 47 → de-escalates
  })
  it('escalation needs boundary + margin: WARNING at gap 52 stays, 54 escalates', () => {
    expect(classifyAlertSeverityWithHysteresis(52, 'WARNING')).toBe('WARNING')
    expect(classifyAlertSeverityWithHysteresis(54, 'WARNING')).toBe('CRITICAL')
  })
  it('no existing alert → plain thresholds (enter)', () => {
    expect(classifyAlertSeverityWithHysteresis(51, null)).toBe('CRITICAL')
    expect(classifyAlertSeverityWithHysteresis(26, null)).toBe('WARNING')
    expect(classifyAlertSeverityWithHysteresis(9, null)).toBeNull()
  })
  it('full recovery from INFO needs gap < 10−3', () => {
    expect(classifyAlertSeverityWithHysteresis(8, 'INFO')).toBe('INFO')   // sticky
    expect(classifyAlertSeverityWithHysteresis(6, 'INFO')).toBeNull()    // clear
  })
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
