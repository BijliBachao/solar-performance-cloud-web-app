import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockPrisma = {
  plants: {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
  devices: {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  string_measurements: { createMany: vi.fn().mockResolvedValue({}) },
  string_configs: { findMany: vi.fn().mockResolvedValue([]) },
  string_hourly: { upsert: vi.fn().mockResolvedValue({}) },
  string_daily: { upsert: vi.fn().mockResolvedValue({}) },
  device_daily: { upsert: vi.fn().mockResolvedValue({}) },
  alerts: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), create: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
  vendor_alarms: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn().mockImplementation(async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg)
    if (typeof arg === 'function') return arg(mockPrisma)
    return []
  }),
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const clientInstance = {
  getPowerStationList: vi.fn(),
  getDeviceList: vi.fn(),
  getDeviceRealTimeData: vi.fn(),
  login: vi.fn(),
  isTokenValid: vi.fn().mockReturnValue(true),
}

vi.mock('@/lib/sungrow-client', () => ({
  SungrowClient: class {
    constructor() {
      return clientInstance as any
    }
  },
}))

describe('pollSungrow — degraded-path resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Pin the clock to PKT noon: the DQ v2 write gate night-checks snapshots
    // claiming production, and these fixtures have no plant coords (fleet
    // default). Without this, the suite fails when run at night (it did).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T07:00:00Z')) // 12:00 PKT
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('completes without throwing when getPowerStationList returns [] (per SUNGROW-API-KNOWLEDGE §3 — pageList:null degraded shape)', async () => {
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getDeviceRealTimeData.mockResolvedValue([])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
  })

  it('survives empty results from getDeviceRealTimeData (per SUNGROW-API-KNOWLEDGE §4.4 — fail_sn_list scenario means device_point_list can be empty)', async () => {
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getDeviceRealTimeData.mockResolvedValue([])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'A2482410490', plant_id: '1794632', max_strings: null },
    ])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
  })

  it('survives degraded results[0] = null (per SUNGROW-API-KNOWLEDGE §3 — first slot null on partial outage; safeObject guards dp[...] access)', async () => {
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getDeviceRealTimeData.mockResolvedValue([null])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'A2482410490', plant_id: '1794632', max_strings: null },
    ])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
  })

  it('happy-path: extracts string measurements from gold-fixture point map (api-test-results.json realtime_Inverter1 shape)', async () => {
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    // Subset of realtime fixture: p70 = string-1 current, p96 = string-1 voltage, p1 = today's energy (Wh)
    clientInstance.getDeviceRealTimeData.mockResolvedValue([
      { p1: '5200', p70: '6.5', p96: '650.5' },
    ])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'A2482410490', plant_id: '1794632', max_strings: 1 },
    ])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
    expect(mockPrisma.string_measurements.createMany).toHaveBeenCalled()
  })

  it('duplicate-skip does NOT resolve alerts (flap regression, Popular Sole INV-2 2026-06-05)', async () => {
    // A live-but-static inverter alternates duplicate/write across cycles.
    // The old code resolved ALL open alerts on every duplicate skip, so real
    // dead-string CRITICALs flapped created→resolved every 5 minutes and the
    // "open since" duration reset forever. Contract: a gate skip stamps
    // last_seen_at and NOTHING else touches alerts — sustained-freeze
    // resolution belongs to sweepAlertsOnDarkDevices() alone.
    const { readingSignature } = await import('@/lib/string-health')
    const sig = readingSignature([
      { string_number: 1, voltage: 650.5, current: 6.5, power: 4228.25 },
    ])
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getDeviceRealTimeData.mockResolvedValue([
      { p1: '5200', p70: '6.5', p96: '650.5' },
    ])
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'A2482410490', plant_id: '1794632', max_strings: 1, last_reading_sig: sig, plants: { latitude: null, longitude: null } },
    ])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()

    expect(mockPrisma.string_measurements.createMany).not.toHaveBeenCalled() // gate held
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()              // alerts untouched
    expect(mockPrisma.devices.update).toHaveBeenCalled()                     // last_seen_at stamped
  })

  it('skips poll entirely when SUNGROW_APP_KEY is unset (per sungrow-poller.ts gate)', async () => {
    delete process.env.SUNGROW_APP_KEY

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
    expect(clientInstance.getPowerStationList).not.toHaveBeenCalled()
  })
})

describe('fetchSungrowAlarms — completeness guard + reopen', () => {
  // resetModules per test so the module-level alarm-sync hour gate (lastAlarmSync)
  // starts at 0 and the alarm path actually runs.
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T07:00:00Z')) // 12:00 PKT
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
    // getPowerStationList [] keeps the device-sync path from iterating plants.
    // (getDeviceList is still called by both syncSungrowDevices — over the DB
    // plants below — and fetchSungrowAlarms; the assertions target vendor_alarms
    // ops, which only fetchSungrowAlarms performs.)
    clientInstance.getPowerStationList.mockResolvedValue([])
    clientInstance.getDeviceRealTimeData.mockResolvedValue([])
    mockPrisma.plants.findMany.mockResolvedValue([{ id: 'ps1' }])
    mockPrisma.devices.findMany.mockResolvedValue([{ id: 'sn1', plant_id: 'ps1' }])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does NOT resolve open alarms when a plant device list is empty (completeness guard)', async () => {
    clientInstance.getDeviceList.mockResolvedValue([]) // empty → complete=false
    // An open Sungrow alarm exists — it must NOT be swept on an untrusted fetch.
    mockPrisma.vendor_alarms.findMany.mockResolvedValue([
      { id: 'va1', vendor_alarm_id: 'ps1_sn1_devfault' },
    ])

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await pollSungrow()

    expect(mockPrisma.vendor_alarms.updateMany).not.toHaveBeenCalled()
  })

  it('creates a new alarm with a fresh started_at on first occurrence', async () => {
    clientInstance.getDeviceList.mockResolvedValue([
      { ps_key: '', device_code: 0, device_type: 1, device_name: 'INV', device_sn: 'sn1',
        device_model: '', ps_id: 'ps1', dev_fault_status: 4, dev_status: 0 },
    ])
    mockPrisma.vendor_alarms.findUnique.mockResolvedValue(null) // no prior row

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await pollSungrow()

    expect(mockPrisma.vendor_alarms.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vendor_alarm_id: 'ps1_sn1_devfault', started_at: expect.any(Date) }),
      }),
    )
  })

  it('reopens a recurring fault: clears resolved_at AND stamps a fresh started_at', async () => {
    clientInstance.getDeviceList.mockResolvedValue([
      { ps_key: '', device_code: 0, device_type: 1, device_name: 'INV', device_sn: 'sn1',
        device_model: '', ps_id: 'ps1', dev_fault_status: 4, dev_status: 0 },
    ])
    // A previously-RESOLVED row exists for this device → recurrence must reopen it
    // and re-stamp started_at so it surfaces at the top of the (started_at-DESC) feed.
    mockPrisma.vendor_alarms.findUnique.mockResolvedValue({
      id: 'va1', resolved_at: new Date('2026-06-01T00:00:00Z'),
    })

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await pollSungrow()

    expect(mockPrisma.vendor_alarms.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'va1' },
        data: expect.objectContaining({ resolved_at: null, started_at: expect.any(Date) }),
      }),
    )
  })

  it('does NOT re-stamp started_at while a fault stays continuously open', async () => {
    clientInstance.getDeviceList.mockResolvedValue([
      { ps_key: '', device_code: 0, device_type: 1, device_name: 'INV', device_sn: 'sn1',
        device_model: '', ps_id: 'ps1', dev_fault_status: 4, dev_status: 0 },
    ])
    // An already-OPEN row exists → refresh snapshot only, never touch started_at.
    mockPrisma.vendor_alarms.findUnique.mockResolvedValue({ id: 'va1', resolved_at: null })

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await pollSungrow()

    const updateArg = mockPrisma.vendor_alarms.update.mock.calls[0]?.[0]
    expect(updateArg?.data?.started_at).toBeUndefined()
    expect(updateArg?.data?.resolved_at).toBeUndefined()
  })
})
