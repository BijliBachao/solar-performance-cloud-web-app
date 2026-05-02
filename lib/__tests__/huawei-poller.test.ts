import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// pollHuawei() coordinates DB + huaweiClient. We mock both to verify the
// safeArray/safeObject guards from commit 280a9ff prevent crashes when the
// vendor returns degraded shapes (per SmartPVMS Developer Guide §4.1.1).

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
    updateMany: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn().mockImplementation(async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg)
    if (typeof arg === 'function') return arg(mockPrisma)
    return []
  }),
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const huaweiClientMock = {
  getPlantList: vi.fn(),
  getDeviceList: vi.fn(),
  getDeviceRealtimeData: vi.fn(),
  getPlantRealKpi: vi.fn(),
  getActiveAlarms: vi.fn(),
}

vi.mock('@/lib/huawei-client', () => ({
  huaweiClient: huaweiClientMock,
  default: class {},
}))

describe('pollHuawei — degraded-path resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('completes without throwing when getPlantList returns [] (the safeArray guard turned a TypeError into an empty list — SmartPVMS Developer Guide §4.1.1)', async () => {
    huaweiClientMock.getPlantList.mockResolvedValue([])
    huaweiClientMock.getDeviceList.mockResolvedValue([])
    huaweiClientMock.getPlantRealKpi.mockResolvedValue([])
    huaweiClientMock.getDeviceRealtimeData.mockResolvedValue([])
    huaweiClientMock.getActiveAlarms.mockResolvedValue([])

    const { pollHuawei } = await import('@/lib/huawei-poller')
    await expect(pollHuawei()).resolves.toBeUndefined()
  })

  it('happy path: processes a single plant + inverter without errors (Developer Guide §4.1.4 dataItemMap shape)', async () => {
    huaweiClientMock.getPlantList.mockResolvedValue([
      {
        plantCode: 'NE=1',
        plantName: 'P1',
        capacity: 10,
        plantAddress: 'addr',
        latitude: 1,
        longitude: 2,
      },
    ])
    huaweiClientMock.getDeviceList.mockResolvedValue([
      { id: 100, devName: 'INV-1', devTypeId: 1, stationCode: 'NE=1' },
    ])
    huaweiClientMock.getPlantRealKpi.mockResolvedValue([
      { stationCode: 'NE=1', healthState: 3, dayPower: 100, totalPower: 1000 },
    ])
    huaweiClientMock.getDeviceRealtimeData.mockResolvedValue([
      {
        devId: '100',
        dataItemMap: { pv1_u: 650.5, pv1_i: 6.7, pv2_u: 648.2, pv2_i: 6.65, day_cap: 52.35 },
      },
    ])
    huaweiClientMock.getActiveAlarms.mockResolvedValue([])

    mockPrisma.plants.findMany.mockResolvedValue([{ id: 'NE=1' }])
    mockPrisma.devices.findMany.mockResolvedValue([
      { id: '100', plant_id: 'NE=1', device_type_id: 1, max_strings: null },
    ])

    const { pollHuawei } = await import('@/lib/huawei-poller')
    await expect(pollHuawei()).resolves.toBeUndefined()

    expect(mockPrisma.string_measurements.createMany).toHaveBeenCalled()
  })

  it('survives degraded realtime data (data:[null]) — per-element guard skips and continues, per Developer Guide §4.1.4', async () => {
    huaweiClientMock.getPlantList.mockResolvedValue([])
    huaweiClientMock.getDeviceList.mockResolvedValue([])
    huaweiClientMock.getPlantRealKpi.mockResolvedValue([])
    huaweiClientMock.getActiveAlarms.mockResolvedValue([])
    huaweiClientMock.getDeviceRealtimeData.mockResolvedValue([null])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: '100', plant_id: 'NE=1', device_type_id: 1, max_strings: 4 },
    ])

    const { pollHuawei } = await import('@/lib/huawei-poller')
    await expect(pollHuawei()).resolves.toBeUndefined()
  })
})
