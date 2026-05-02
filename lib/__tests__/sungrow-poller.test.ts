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
  alerts: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), create: vi.fn() },
  vendor_alarms: {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
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
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
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

  it('skips poll entirely when SUNGROW_APP_KEY is unset (per sungrow-poller.ts gate)', async () => {
    delete process.env.SUNGROW_APP_KEY

    const { pollSungrow } = await import('@/lib/sungrow-poller')
    await expect(pollSungrow()).resolves.toBeUndefined()
    expect(clientInstance.getPowerStationList).not.toHaveBeenCalled()
  })
})
