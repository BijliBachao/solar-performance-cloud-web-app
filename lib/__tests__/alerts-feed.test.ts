import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Shared Alerts-feed builder: merges our computed `alerts` (kind=system) with
// the inverters' own `vendor_alarms` (kind=vendor) into ONE time-sorted,
// paginated, normalized feed. Used by BOTH portals (admin: allowedPlantIds=null;
// customer: allowedPlantIds scoped to the org). Filters: kind / provider /
// severity / resolved / q. Org fields populated only when includeOrg=true.

const mockPrisma = {
  alerts: { findMany: vi.fn() },
  vendor_alarms: { findMany: vi.fn() },
  devices: { findMany: vi.fn() },
  plants: { findMany: vi.fn() },
  plant_assignments: { findMany: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const NOW = new Date('2026-06-12T12:00:00Z')
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

// ── Fixture rows (raw Prisma shape) ───────────────────────────────────
const SYSTEM_ROWS = [
  // Message written as "<headline> — <evidence>" (em-dash) → title/detail split.
  { id: 1, device_id: 'd1', plant_id: 'p1', string_number: 3, severity: 'CRITICAL',
    message: 'String 3 open circuit suspected — 570V but near-zero current (0.1A)',
    gap_percent: 92.5, created_at: minsAgo(10), resolved_at: null },
  // No em-dash → whole message is the title, detail empty.
  { id: 2, device_id: 'd2', plant_id: 'p2', string_number: 1, severity: 'WARNING',
    message: 'Underperforming', gap_percent: 22.1, created_at: minsAgo(50), resolved_at: null },
]
const VENDOR_ROWS = [
  { id: 'v-aaa', device_id: 'd1', plant_id: 'p1', provider: 'solis', alarm_code: 'F23',
    severity: 'CRITICAL', message: 'DC arc fault detected', advice: 'Inspect wiring',
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
const ASSIGNMENTS = [
  { plant_id: 'p1', organization_id: 'org-1', organizations: { name: 'Acme Energy' } },
  { plant_id: 'p2', organization_id: 'org-2', organizations: { name: 'Beta Power' } },
]

async function build(opts: any) {
  const { buildAlertsFeed } = await import('@/lib/alerts-feed')
  return buildAlertsFeed(opts)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mockPrisma.alerts.findMany.mockResolvedValue(SYSTEM_ROWS)
  mockPrisma.vendor_alarms.findMany.mockResolvedValue(VENDOR_ROWS)
  mockPrisma.devices.findMany.mockResolvedValue(DEVICES)
  mockPrisma.plants.findMany.mockResolvedValue(PLANTS)
  mockPrisma.plant_assignments.findMany.mockResolvedValue(ASSIGNMENTS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('buildAlertsFeed — merge / normalize / sort', () => {
  it('merges both sources, sorted by started_at DESC, with the normalized shape', async () => {
    const res = await build({ allowedPlantIds: null })
    expect(res.total).toBe(4)
    expect(res.page).toBe(1)
    expect(res.pageSize).toBe(50)
    expect(res.items).toHaveLength(4)

    // Order by started_at DESC: vendor(5m) > system(10m) > vendor(30m) > system(50m)
    expect(res.items.map((i) => i.id)).toEqual([
      'vendor:v-bbb', 'system:1', 'vendor:v-aaa', 'system:2',
    ])

    for (const it of res.items) {
      expect(Object.keys(it).sort()).toEqual([
        'alarm_code', 'count', 'detail', 'device_id', 'device_name', 'device_names',
        'id', 'kind', 'organization_id', 'organization_name', 'plant_id', 'plant_name',
        'provider', 'resolved_at', 'severity', 'started_at', 'string_number', 'title',
      ])
    }
  })

  it('normalizes a system row: title = headline before " — ", detail = the rest', async () => {
    const res = await build({ allowedPlantIds: null })
    const sys = res.items.find((i) => i.id === 'system:1')!
    expect(sys.kind).toBe('system')
    expect(sys.provider).toBe('solis')
    expect(sys.plant_name).toBe('Gulberg Rooftop')
    expect(sys.device_name).toBe('INV-A')
    expect(sys.string_number).toBe(3)
    expect(sys.severity).toBe('CRITICAL')
    // Plain-language headline (never a code); evidence moves to detail.
    expect(sys.title).toBe('String 3 open circuit suspected')
    expect(sys.detail).toBe('570V but near-zero current (0.1A)')
    expect(sys.alarm_code).toBeNull()
    expect(sys.count).toBe(1)
    expect(sys.device_names).toEqual(['INV-A'])
    expect(sys.resolved_at).toBeNull()
  })

  it('system row with no " — " keeps the whole message as title, detail empty', async () => {
    const res = await build({ allowedPlantIds: null })
    const sys = res.items.find((i) => i.id === 'system:2')!
    expect(sys.title).toBe('Underperforming')
    expect(sys.detail).toBe('')
  })

  it('normalizes a vendor row: title = human message, detail = advice, alarm_code chip', async () => {
    const res = await build({ allowedPlantIds: null })
    const v = res.items.find((i) => i.id === 'vendor:v-aaa')!
    expect(v.kind).toBe('vendor')
    expect(v.provider).toBe('solis')
    expect(v.string_number).toBeNull()
    // The human message is the headline; the raw code lives in alarm_code only.
    expect(v.title).toBe('DC arc fault detected')
    expect(v.detail).toBe('Inspect wiring')
    expect(v.alarm_code).toBe('F23')
    expect(v.count).toBe(1)
    expect(v.device_names).toEqual(['INV-A'])
  })

  it('vendor row with no alarm_code → alarm_code null; no advice → detail empty', async () => {
    const res = await build({ allowedPlantIds: null })
    const v = res.items.find((i) => i.id === 'vendor:v-bbb')!
    expect(v.title).toBe('Grid voltage high')
    expect(v.detail).toBe('')
    expect(v.alarm_code).toBeNull()
  })

  it('returns true severity counts over the full ungrouped set', async () => {
    const res = await build({ allowedPlantIds: null })
    // 2 critical (system:1, vendor:v-aaa), 1 warning (system:2), 1 info (vendor:v-bbb).
    expect(res.counts).toEqual({ critical: 2, warning: 1, info: 1 })
  })
})

describe('buildAlertsFeed — grouping (collapse duplicates)', () => {
  // 7 identical Sungrow faults on ONE plant, distinct devices → fold into ONE
  // ×7 row; counts still report 7 critical (true ungrouped totals).
  const sgRows = Array.from({ length: 7 }, (_, i) => ({
    id: `sg-${i + 1}`, device_id: `qd${i + 1}`, plant_id: 'pq', provider: 'sungrow',
    alarm_code: '4', severity: 'CRITICAL', message: 'Device fault detected (status 4)',
    advice: 'Check inverter', started_at: minsAgo(i + 1), resolved_at: null,
  }))
  const sgDevices = Array.from({ length: 7 }, (_, i) => ({
    id: `qd${i + 1}`, device_name: `Qadir Inverter${i + 1}`, provider: 'sungrow',
  }))

  it('collapses rows sharing (kind, provider, plant, severity, title) into one ×N row', async () => {
    mockPrisma.alerts.findMany.mockResolvedValue([])
    mockPrisma.vendor_alarms.findMany.mockResolvedValue(sgRows)
    mockPrisma.devices.findMany.mockResolvedValue(sgDevices)
    mockPrisma.plants.findMany.mockResolvedValue([{ id: 'pq', plant_name: 'Qadir Site' }])

    const res = await build({ allowedPlantIds: null })
    expect(res.total).toBe(1) // grouped row count
    expect(res.items).toHaveLength(1)
    const row = res.items[0]
    expect(row.count).toBe(7)
    expect(row.title).toBe('Device fault detected (status 4)')
    expect(row.alarm_code).toBe('4')
    // Representative = most-recent (minsAgo(1) = qd1); device_names sorted distinct.
    expect(row.id).toBe('vendor:sg-1')
    expect(row.device_names).toEqual([
      'Qadir Inverter1', 'Qadir Inverter2', 'Qadir Inverter3', 'Qadir Inverter4',
      'Qadir Inverter5', 'Qadir Inverter6', 'Qadir Inverter7',
    ])
    // True severity totals are over the UNGROUPED set → 7 critical.
    expect(res.counts).toEqual({ critical: 7, warning: 0, info: 0 })
  })

  it('does NOT collapse distinct system alerts on different strings (different titles)', async () => {
    const sysRows = [
      { id: 10, device_id: 'd1', plant_id: 'p1', string_number: 3, severity: 'CRITICAL',
        message: 'String 3 open circuit suspected — evidence', gap_percent: 0,
        created_at: minsAgo(5), resolved_at: null },
      { id: 11, device_id: 'd1', plant_id: 'p1', string_number: 6, severity: 'CRITICAL',
        message: 'String 6 open circuit suspected — evidence', gap_percent: 0,
        created_at: minsAgo(6), resolved_at: null },
    ]
    mockPrisma.alerts.findMany.mockResolvedValue(sysRows)
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([])
    const res = await build({ allowedPlantIds: null })
    expect(res.total).toBe(2)
    expect(res.items.map((i) => i.count)).toEqual([1, 1])
  })
})

describe('buildAlertsFeed — kind / provider / severity / resolved / q filters', () => {
  it('kind=system queries only alerts, never vendor_alarms', async () => {
    const res = await build({ allowedPlantIds: null, kind: 'system' })
    expect(mockPrisma.alerts.findMany).toHaveBeenCalled()
    expect(mockPrisma.vendor_alarms.findMany).not.toHaveBeenCalled()
    expect(res.total).toBe(2)
    expect(res.items.every((i) => i.kind === 'system')).toBe(true)
  })

  it('kind=vendor queries only vendor_alarms, never alerts', async () => {
    const res = await build({ allowedPlantIds: null, kind: 'vendor' })
    expect(mockPrisma.vendor_alarms.findMany).toHaveBeenCalled()
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled()
    expect(res.total).toBe(2)
    expect(res.items.every((i) => i.kind === 'vendor')).toBe(true)
  })

  it('provider passes through to vendor_alarms where and constrains system rows by device provider', async () => {
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([VENDOR_ROWS[1]])
    const res = await build({ allowedPlantIds: null, provider: 'growatt' })
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.provider).toBe('growatt')
    expect(res.items.map((i) => i.id).sort()).toEqual(['system:2', 'vendor:v-bbb'])
    expect(res.items.every((i) => i.provider === 'growatt')).toBe(true)
  })

  it('handles an arbitrary (future) provider string without any hardcoding', async () => {
    // Sungrow not yet onboarded — the builder must treat provider opaquely.
    const sgVendor = { id: 'v-sg', device_id: 'd9', plant_id: 'p9', provider: 'sungrow',
      alarm_code: 'SG-1', severity: 'WARNING', message: 'Fan fault', advice: null,
      started_at: minsAgo(2), resolved_at: null }
    mockPrisma.alerts.findMany.mockResolvedValue([])
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([sgVendor])
    mockPrisma.devices.findMany.mockResolvedValue([{ id: 'd9', device_name: 'SG-INV', provider: 'sungrow' }])
    mockPrisma.plants.findMany.mockResolvedValue([{ id: 'p9', plant_name: 'Site 9' }])
    const res = await build({ allowedPlantIds: null, provider: 'sungrow' })
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.provider).toBe('sungrow')
    expect(res.items.map((i) => i.provider)).toEqual(['sungrow'])
  })

  it('severity is passed to both source queries', async () => {
    await build({ allowedPlantIds: null, severity: 'CRITICAL' })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.severity).toBe('CRITICAL')
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.severity).toBe('CRITICAL')
  })

  it('resolved defaults to open-only (resolved_at: null on both)', async () => {
    await build({ allowedPlantIds: null })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toBeNull()
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.resolved_at).toBeNull()
  })

  it('resolved=true filters resolved rows; resolved=all applies no filter', async () => {
    await build({ allowedPlantIds: null, resolved: 'true' })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toEqual({ not: null })
    vi.clearAllMocks()
    mockPrisma.alerts.findMany.mockResolvedValue(SYSTEM_ROWS)
    mockPrisma.vendor_alarms.findMany.mockResolvedValue(VENDOR_ROWS)
    mockPrisma.devices.findMany.mockResolvedValue(DEVICES)
    mockPrisma.plants.findMany.mockResolvedValue(PLANTS)
    await build({ allowedPlantIds: null, resolved: 'all' })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.resolved_at).toBeUndefined()
  })

  it('q matches case-insensitively on plant_name OR device_name', async () => {
    const res = await build({ allowedPlantIds: null, q: 'dha' })
    expect(res.items.map((i) => i.id).sort()).toEqual(['system:2', 'vendor:v-bbb'])
    const res2 = await build({ allowedPlantIds: null, q: 'INV-A' })
    expect(res2.items.map((i) => i.id).sort()).toEqual(['system:1', 'vendor:v-aaa'])
  })
})

describe('buildAlertsFeed — pagination + cap', () => {
  it('paginates the merged feed (total reflects full merge)', async () => {
    const res = await build({ allowedPlantIds: null, page: 2, pageSize: 2 })
    expect(res.total).toBe(4)
    expect(res.page).toBe(2)
    expect(res.pageSize).toBe(2)
    expect(res.items.map((i) => i.id)).toEqual(['vendor:v-aaa', 'system:2'])
  })

  it('caps pageSize at 100', async () => {
    const res = await build({ allowedPlantIds: null, pageSize: 9999 })
    expect(res.pageSize).toBe(100)
  })

  it('capped=false normally, true when a source hits SOURCE_CAP (500)', async () => {
    const normal = await build({ allowedPlantIds: null })
    expect(normal.capped).toBe(false)

    const big = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, device_id: 'd1', plant_id: 'p1', string_number: 1, severity: 'INFO',
      message: 'x', gap_percent: 0, created_at: minsAgo(i + 1), resolved_at: null,
    }))
    mockPrisma.alerts.findMany.mockResolvedValue(big)
    const capped = await build({ allowedPlantIds: null })
    expect(capped.capped).toBe(true)
  })
})

describe('buildAlertsFeed — allowedPlantIds scoping (the security boundary)', () => {
  it('null = unrestricted: no plant_id filter on either source', async () => {
    await build({ allowedPlantIds: null })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.plant_id).toBeUndefined()
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.plant_id).toBeUndefined()
  })

  it('an array scopes BOTH sources to plant_id IN (...)', async () => {
    await build({ allowedPlantIds: ['p1'] })
    expect(mockPrisma.alerts.findMany.mock.calls[0][0].where.plant_id).toEqual({ in: ['p1'] })
    expect(mockPrisma.vendor_alarms.findMany.mock.calls[0][0].where.plant_id).toEqual({ in: ['p1'] })
  })

  it('[] = no plants: returns empty fast and never queries any source', async () => {
    const res = await build({ allowedPlantIds: [] })
    expect(res.items).toEqual([])
    expect(res.total).toBe(0)
    expect(mockPrisma.alerts.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.vendor_alarms.findMany).not.toHaveBeenCalled()
  })
})

describe('buildAlertsFeed — includeOrg', () => {
  it('includeOrg=true joins plant_assignments→organizations and populates org fields per row', async () => {
    const res = await build({ allowedPlantIds: null, includeOrg: true })
    expect(mockPrisma.plant_assignments.findMany).toHaveBeenCalled()
    const p1Row = res.items.find((i) => i.plant_id === 'p1')!
    expect(p1Row.organization_id).toBe('org-1')
    expect(p1Row.organization_name).toBe('Acme Energy')
    const p2Row = res.items.find((i) => i.plant_id === 'p2')!
    expect(p2Row.organization_id).toBe('org-2')
    expect(p2Row.organization_name).toBe('Beta Power')
  })

  it('includeOrg=false leaves org fields null and never queries plant_assignments', async () => {
    const res = await build({ allowedPlantIds: null, includeOrg: false })
    expect(mockPrisma.plant_assignments.findMany).not.toHaveBeenCalled()
    expect(res.items.every((i) => i.organization_id === null && i.organization_name === null)).toBe(true)
  })

  it('multiple assignments for one plant → first wins deterministically', async () => {
    mockPrisma.plant_assignments.findMany.mockResolvedValue([
      { plant_id: 'p1', organization_id: 'org-1', organizations: { name: 'Acme Energy' } },
      { plant_id: 'p1', organization_id: 'org-9', organizations: { name: 'Other Org' } },
      { plant_id: 'p2', organization_id: 'org-2', organizations: { name: 'Beta Power' } },
    ])
    const res = await build({ allowedPlantIds: null, includeOrg: true })
    const p1Row = res.items.find((i) => i.plant_id === 'p1')!
    expect(p1Row.organization_id).toBe('org-1')
    expect(p1Row.organization_name).toBe('Acme Energy')
  })
})
