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
  getStationList: vi.fn(),
  getInverterList: vi.fn(),
  getInverterDetail: vi.fn(),
  getAlarmList: vi.fn(),
  getPlantDetail: vi.fn(),
}

vi.mock('@/lib/solis-client', () => ({
  SolisClient: class {
    constructor() {
      return clientInstance as any
    }
  },
}))

describe('pollSolis — degraded-path resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOLIS_API_ID = 'fake'
    process.env.SOLIS_API_SECRET = 'fake'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('completes without throwing when getStationList returns [] (per SolisCloud §4.1 — page:null collapses to empty array via safeArray)', async () => {
    clientInstance.getStationList.mockResolvedValue([])
    clientInstance.getInverterList.mockResolvedValue([])
    clientInstance.getInverterDetail.mockResolvedValue({})
    clientInstance.getAlarmList.mockResolvedValue([])

    const { pollSolis } = await import('@/lib/solis-poller')
    await expect(pollSolis()).resolves.toBeUndefined()
  })

  it('happy-path: processes a station + inverter without errors (per SolisCloud §3.2 — uPv1/iPv1/pow1 fields)', async () => {
    clientInstance.getStationList.mockResolvedValue([
      { id: '1298491919448631809', stationName: 'Lahore Plant', capacity: 50, capacityStr: 'kWp', state: 1, power: 12.3, dayEnergy: 100, allEnergy: 50000 },
    ])
    clientInstance.getInverterList.mockResolvedValue([])
    clientInstance.getInverterDetail.mockResolvedValue({
      id: '999',
      sn: 'SN999',
      pac: 5000,
      eToday: 12.5,
      eTotal: 99999,
      dcInputType: 1,
      state: 1,
      uPv1: 245.3,
      iPv1: 4.2,
      pow1: 1030,
    })
    clientInstance.getAlarmList.mockResolvedValue([])

    mockPrisma.plants.findMany.mockResolvedValue([{ id: '1298491919448631809' }])
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: '999', plant_id: '1298491919448631809', max_strings: 2 },
    ])

    const { pollSolis } = await import('@/lib/solis-poller')
    await expect(pollSolis()).resolves.toBeUndefined()
  })

  it('skips poll entirely when SOLIS_API_ID is unset (per solis-poller.ts gate)', async () => {
    delete process.env.SOLIS_API_ID

    const { pollSolis } = await import('@/lib/solis-poller')
    await expect(pollSolis()).resolves.toBeUndefined()
    expect(clientInstance.getStationList).not.toHaveBeenCalled()
  })
})
