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
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn().mockImplementation(async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg)
    if (typeof arg === 'function') return arg(mockPrisma)
    return []
  }),
}

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

const clientInstance = {
  getPlantList: vi.fn(),
  getDeviceList: vi.fn(),
  getLastData: vi.fn(),
  getDevicesByPlant: vi.fn(),
}

vi.mock('@/lib/growatt-client', () => ({
  GrowattClient: class {
    constructor() {
      return clientInstance as any
    }
  },
}))

describe('pollGrowatt — degraded-path resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Pin the clock to PKT noon: the DQ v2 write gate night-checks snapshots
    // claiming production, and these fixtures have no plant coords (fleet
    // default). Without this, the suite fails when run at night (it did).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T07:00:00Z')) // 12:00 PKT
    process.env.GROWATT_API_TOKEN = 'fake'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('completes without throwing when client returns [] for all calls (per VALIDATED-FINDINGS §6 — defensive parsing turns null shapes into empty arrays)', async () => {
    clientInstance.getPlantList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getLastData.mockResolvedValue([])

    const { pollGrowatt } = await import('@/lib/growatt-poller')
    await expect(pollGrowatt()).resolves.toBeUndefined()
  })

  it('survives degraded getLastData with [null] entries (per VALIDATED-FINDINGS §3 — null entries observed in batch responses; poller skips them)', async () => {
    clientInstance.getPlantList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getLastData.mockResolvedValue([null, null])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'KXJ7CDC02G', plant_id: '2251305', device_type_id: 200, max_strings: null },
    ])

    const { pollGrowatt } = await import('@/lib/growatt-poller')
    await expect(pollGrowatt()).resolves.toBeUndefined()
  })

  it('happy-path: extracts MPPT-level strings from MAX device (per VALIDATED-FINDINGS §5 — vpv/ipv/ppv fields)', async () => {
    clientInstance.getPlantList.mockResolvedValue([])
    clientInstance.getDeviceList.mockResolvedValue([])
    clientInstance.getLastData.mockResolvedValue([
      {
        serialNum: 'KXJ7CDC02G',
        vpv1: 527.5,
        ipv1: 1.2,
        ppv1: 633,
        vpv2: 126.6,
        ipv2: 0.8,
        ppv2: 100,
        eacToday: 5.2,
      },
    ])

    mockPrisma.devices.findMany.mockResolvedValue([
      { id: 'KXJ7CDC02G', plant_id: '2251305', device_type_id: 200, max_strings: 4 },
    ])

    const { pollGrowatt } = await import('@/lib/growatt-poller')
    await expect(pollGrowatt()).resolves.toBeUndefined()

    expect(mockPrisma.string_measurements.createMany).toHaveBeenCalled()
  })

  it('skips poll entirely when GROWATT_API_TOKEN unset (per growatt-poller.ts gate)', async () => {
    delete process.env.GROWATT_API_TOKEN

    const { pollGrowatt } = await import('@/lib/growatt-poller')
    await expect(pollGrowatt()).resolves.toBeUndefined()
    expect(clientInstance.getPlantList).not.toHaveBeenCalled()
  })
})

describe('resolveGrowattPlantHealth — recency override (fixes false night/sunrise disconnects)', () => {
  it('Online (1) / Bat-Online (3) → Healthy regardless of recency', async () => {
    const { resolveGrowattPlantHealth } = await import('@/lib/growatt-poller')
    const { PLANT_HEALTH_HEALTHY } = await import('@/lib/string-health')
    expect(resolveGrowattPlantHealth(1, false)).toBe(PLANT_HEALTH_HEALTHY)
    expect(resolveGrowattPlantHealth(3, false)).toBe(PLANT_HEALTH_HEALTHY)
  })

  it('Fault (2) → Faulty even if reporting recently (real fault never masked)', async () => {
    const { resolveGrowattPlantHealth } = await import('@/lib/growatt-poller')
    const { PLANT_HEALTH_FAULTY } = await import('@/lib/string-health')
    expect(resolveGrowattPlantHealth(2, true)).toBe(PLANT_HEALTH_FAULTY)
    expect(resolveGrowattPlantHealth(2, false)).toBe(PLANT_HEALTH_FAULTY)
  })

  it('Waiting (0) / Offline (4) but reported recently → Healthy (the 9-of-11 live case)', async () => {
    const { resolveGrowattPlantHealth } = await import('@/lib/growatt-poller')
    const { PLANT_HEALTH_HEALTHY } = await import('@/lib/string-health')
    expect(resolveGrowattPlantHealth(0, true)).toBe(PLANT_HEALTH_HEALTHY)
    expect(resolveGrowattPlantHealth(4, true)).toBe(PLANT_HEALTH_HEALTHY)
  })

  it('Waiting (0) / Offline (4) with NO recent data → Disconnected (genuine silence)', async () => {
    const { resolveGrowattPlantHealth } = await import('@/lib/growatt-poller')
    const { PLANT_HEALTH_DISCONNECTED } = await import('@/lib/string-health')
    expect(resolveGrowattPlantHealth(0, false)).toBe(PLANT_HEALTH_DISCONNECTED)
    expect(resolveGrowattPlantHealth(4, false)).toBe(PLANT_HEALTH_DISCONNECTED)
  })

  it('unknown status with recent data → Healthy; without → Disconnected', async () => {
    const { resolveGrowattPlantHealth } = await import('@/lib/growatt-poller')
    const { PLANT_HEALTH_HEALTHY, PLANT_HEALTH_DISCONNECTED } = await import('@/lib/string-health')
    expect(resolveGrowattPlantHealth(99, true)).toBe(PLANT_HEALTH_HEALTHY)
    expect(resolveGrowattPlantHealth(99, false)).toBe(PLANT_HEALTH_DISCONNECTED)
  })
})
