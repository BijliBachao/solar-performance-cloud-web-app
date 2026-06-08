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
import { generateAlerts, __resetAlertPersistence } from '../poller-utils'
import { classifyAlertSeverityWithHysteresis, classifySrAlertSeverityWithHysteresis } from '../string-health'

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
  __resetAlertPersistence() // module-level map survives between tests — clear it
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

  it('dead-string recovery deadband: 0.15A stays dead (no churn); recovery to peer level resolves', async () => {
    // Dead-string alerts always carry gap_percent=null, so existingDeadAlert
    // recognises them and the deadband applies even with a viable peer pool
    // (audit 2026-06-08 #2). To RESOLVE, the string must clear BOTH the deadband
    // (>2× threshold) AND peer comparison — so recovery is to peer level (0.3A);
    // a partial recovery (e.g. 0.25A vs 0.3A peers = 83%) would CORRECTLY stay
    // critical via the donut-aligned SR comparison, which is intended.
    const openDead = [{ id: 31, string_number: 5, severity: 'CRITICAL', gap_percent: null }]
    mockPrisma.alerts.findMany.mockResolvedValue(openDead)
    await generateAlerts('dev1', 'plant1',
      [m(1, 0.3), m(2, 0.3), m(3, 0.3), m(4, 0.3), m(5, 0.15)], configs)
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled() // still dead — alert kept, no flap
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()

    vi.clearAllMocks()
    __resetAlertPersistence()
    mockPrisma.string_configs.findMany.mockResolvedValue([])
    mockPrisma.alerts.findMany.mockResolvedValue(openDead)
    await generateAlerts('dev1', 'plant1',
      [m(1, 0.3), m(2, 0.3), m(3, 0.3), m(4, 0.3), m(5, 0.3)], configs)
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1) // recovered: cleared deadband AND healthy vs peers
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

describe('classifySrAlertSeverityWithHysteresis (pure) — donut-aligned severity', () => {
  it('no existing alert → maps to donut buckets (CRITICAL<0.85, WARNING<0.94, else none)', () => {
    expect(classifySrAlertSeverityWithHysteresis(0.80, null)).toBe('CRITICAL')
    expect(classifySrAlertSeverityWithHysteresis(0.84, null)).toBe('CRITICAL') // donut-critical → alert CRITICAL
    expect(classifySrAlertSeverityWithHysteresis(0.90, null)).toBe('WARNING')  // donut-abnormal → alert WARNING
    expect(classifySrAlertSeverityWithHysteresis(0.96, null)).toBeNull()       // healthy → no alert
  })
  it('escalation WARNING→CRITICAL only past the boundary + margin (0.85−0.03)', () => {
    expect(classifySrAlertSeverityWithHysteresis(0.83, 'WARNING')).toBe('WARNING') // sticky in 0.82..0.85
    expect(classifySrAlertSeverityWithHysteresis(0.81, 'WARNING')).toBe('CRITICAL')
  })
  it('de-escalation CRITICAL→ requires rising above 0.85+margin', () => {
    expect(classifySrAlertSeverityWithHysteresis(0.87, 'CRITICAL')).toBe('CRITICAL') // sticky in 0.85..0.88
    expect(classifySrAlertSeverityWithHysteresis(0.90, 'CRITICAL')).toBe('WARNING')  // clears critical, now abnormal
  })
  it('full recovery from WARNING needs sr above 0.94+margin', () => {
    expect(classifySrAlertSeverityWithHysteresis(0.95, 'WARNING')).toBe('WARNING') // sticky in 0.94..0.97
    expect(classifySrAlertSeverityWithHysteresis(0.98, 'WARNING')).toBeNull()      // recovered
  })
})

describe('generateAlerts — peer comparison via shared engine (power, not current)', () => {
  // Custom measurement with explicit voltage (the m() helper fixes 600V).
  const mv = (sn: number, v: number, i: number) => ({
    string_number: sn,
    voltage: new Decimal(v.toFixed(2)),
    current: new Decimal(i.toFixed(3)),
    power: new Decimal((v * i).toFixed(2)),
  })

  it('a low-CURRENT but healthy-POWER string is NOT flagged (the FANZ false-positive class)', async () => {
    // Same MPPT pair (max_strings=2 → fallback 2/MPPT). S1 runs high-volts/
    // low-amps, S2 low-volts/high-amps — both healthy power. Old raw-current
    // compare flagged S1 (8A vs 9A avg); per-panel-power median does not.
    await generateAlerts('dev1', 'plant1',
      [mv(1, 800, 8), mv(2, 600, 10)], configs, true,
      { model: null, max_strings: 2 })
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()
  })

  it('a genuinely low-POWER string in its MPPT group IS still flagged', async () => {
    // S1 6400W vs S2 ~2000W on the same MPPT — S2 is the real underperformer.
    await generateAlerts('dev1', 'plant1',
      [mv(1, 800, 8), mv(2, 600, 3.3)], configs, true,
      { model: null, max_strings: 2 }, 1) // minPersistenceCycles=1 → immediate
    expect(mockPrisma.alerts.createMany).toHaveBeenCalledTimes(1)
    const rows = mockPrisma.alerts.createMany.mock.calls[0][0].data
    expect(rows.map((r: any) => r.string_number)).toContain(2)
  })
})

describe('generateAlerts — persistence gate (dawn-ramp guard)', () => {
  const mv = (sn: number, v: number, i: number) => ({
    string_number: sn,
    voltage: new Decimal(v.toFixed(2)),
    current: new Decimal(i.toFixed(3)),
    power: new Decimal((v * i).toFixed(2)),
  })

  it('a below-peer string does NOT alert on the first cycle, but DOES after it persists', async () => {
    // Default minPersistenceCycles (2). One genuinely-low string on an MPPT pair.
    const meas = [mv(7, 600, 10), mv(8, 600, 3.3)] // S8 ~ a third of S7
    // Cycle 1 — problem seen once → no new alert yet
    await generateAlerts('dev-persist', 'plant1', meas, configs, true, { model: null, max_strings: 2 })
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()
    // Cycle 2 — same problem persists → now it fires
    await generateAlerts('dev-persist', 'plant1', meas, configs, true, { model: null, max_strings: 2 })
    expect(mockPrisma.alerts.createMany).toHaveBeenCalledTimes(1)
    const rows = mockPrisma.alerts.createMany.mock.calls[0][0].data
    expect(rows.map((r: any) => r.string_number)).toContain(8)
  })

  it('a transient one-cycle dip never alerts (string recovers next cycle)', async () => {
    await generateAlerts('dev-transient', 'plant1',
      [mv(7, 600, 10), mv(8, 600, 3.3)], configs, true, { model: null, max_strings: 2 }) // dip
    await generateAlerts('dev-transient', 'plant1',
      [mv(7, 600, 10), mv(8, 600, 10)], configs, true, { model: null, max_strings: 2 })  // recovered
    expect(mockPrisma.alerts.createMany).not.toHaveBeenCalled()
  })
})

describe('generateAlerts — batched writes', () => {
  it('creates MULTIPLE new alerts with ONE createMany (never per-row create)', async () => {
    // 4 healthy peers at 10A + two dead strings → 2 CRITICAL alerts expected
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 0), m(6, 0)], configs, true, undefined, 1)

    expect(mockPrisma.alerts.create).not.toHaveBeenCalled()
    expect(mockPrisma.alerts.createMany).toHaveBeenCalledTimes(1)
    const rows = mockPrisma.alerts.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(rows.map((r: any) => r.string_number).sort()).toEqual([5, 6])
    for (const r of rows) {
      expect(r.severity).toBe('CRITICAL')
      expect(r.device_id).toBe('dev1')
      // Fixture strings carry 600V at 0A — full array voltage with no
      // current is an open-circuit signature, not a generic dead string.
      expect(r.message).toMatch(/open circuit suspected/)
    }
  })

  it('message taxonomy: reverse current / open circuit / near-zero are distinguished', async () => {
    const reverse = { string_number: 5, current: new Decimal('-1.400'), voltage: new Decimal('15'), power: new Decimal('-21') }
    const collapsed = { string_number: 6, current: new Decimal('0.000'), voltage: new Decimal('2'), power: new Decimal('0') }
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), reverse as any, collapsed as any], configs, true, undefined, 1)
    const rows = mockPrisma.alerts.createMany.mock.calls[0][0].data
    const byString = Object.fromEntries(rows.map((r: any) => [r.string_number, r.message]))
    expect(byString[5]).toMatch(/reverse current \(-1\.400A\)/)
    expect(byString[6]).toMatch(/near-zero current/)   // 2V → no open-circuit claim
    expect(byString[6]).not.toMatch(/open circuit/)
  })

  it('system resolutions are attributed: recovery stamps resolved_by', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([
      { id: 21, string_number: 5, severity: 'CRITICAL', gap_percent: null },
    ])
    await generateAlerts('dev1', 'plant1',
      [m(1, 10), m(2, 10), m(3, 10), m(4, 10), m(5, 10)], configs)
    const arg = mockPrisma.alerts.updateMany.mock.calls[0][0]
    expect(arg.data.resolved_by).toBe('system:recovered')
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
