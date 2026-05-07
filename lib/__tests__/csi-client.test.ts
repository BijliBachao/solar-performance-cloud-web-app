import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Avoid pulling the real Prisma client into a unit-test process.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

// CSI's transport is plain HTTP+JSON — unlike Sungrow we can spy at either
// the `get` private (business-logic shape) layer or the `fetchWithTimeout`
// (transport) layer. Most tests spy on `get` for speed; auth + 503-retry
// tests mock `fetchWithTimeout` to exercise the real auth flow.

describe('CsiClient — extractRealDataValue (CSI-API-KNOWLEDGE §8 quirk #5)', () => {
  beforeEach(() => {
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })

  it('returns null when row.data is null (treated as no-data, not zero)', async () => {
    const { extractRealDataValue } = await import('@/lib/csi-client')
    const v = extractRealDataValue({ fieldCode: 'DV1', fieldName: 'PV1 Voltage', fieldUnitName: 'V', data: null })
    expect(v).toBeNull()
  })

  it('extracts numeric value from {value: number}', async () => {
    const { extractRealDataValue } = await import('@/lib/csi-client')
    const v = extractRealDataValue({ fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: 532.5 } })
    expect(v).toBe(532.5)
  })

  it('parses numeric strings ({value: "532.5"}) — SolarMAN often returns strings', async () => {
    const { extractRealDataValue } = await import('@/lib/csi-client')
    const v = extractRealDataValue({ fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: '532.5' } })
    expect(v).toBe(532.5)
  })

  it('falls back to {data: ...} key if {value} absent', async () => {
    const { extractRealDataValue } = await import('@/lib/csi-client')
    const v = extractRealDataValue({ fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { data: 99 } })
    expect(v).toBe(99)
  })

  it('returns null on unknown shape (defensive — log and skip rather than NaN)', async () => {
    const { extractRealDataValue } = await import('@/lib/csi-client')
    const v = extractRealDataValue({ fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { foo: 'bar' } })
    expect(v).toBeNull()
  })
})

describe('CsiClient — parseRealData (CSI-API-KNOWLEDGE §5)', () => {
  it('extracts V/I/P from DV1/DC1/DP1 fieldCodes (SolarMAN convention)', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'DV1', fieldName: 'PV1 Voltage', fieldUnitName: 'V', data: { value: '600.0' } },
      { fieldCode: 'DC1', fieldName: 'PV1 Current', fieldUnitName: 'A', data: { value: '10.5' } },
      { fieldCode: 'DP1', fieldName: 'PV1 Power',   fieldUnitName: 'W', data: { value: '6300' } },
    ])
    expect(result.strings).toEqual([
      { string_number: 1, voltage: 600, current: 10.5, power: 6300 },
    ])
    expect(result.unrecognisedCodes).toEqual([])
  })

  it('computes power = V × I when DP missing (not all firmware emits power)', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: 500 } },
      { fieldCode: 'DC1', fieldName: '', fieldUnitName: '', data: { value: 10 } },
    ])
    expect(result.strings[0]).toMatchObject({ voltage: 500, current: 10, power: 5000 })
  })

  it('skips voltage-only strings (no current → no fault detection possible)', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: 600 } },
      // no DC1 row — this is the partial-outage case from docs §8 quirk #11
    ])
    expect(result.strings).toEqual([])
  })

  it('handles many strings in arbitrary order, returns sorted by string_number', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'DV3', fieldName: '', fieldUnitName: '', data: { value: 580 } },
      { fieldCode: 'DC3', fieldName: '', fieldUnitName: '', data: { value: 9.0 } },
      { fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: 600 } },
      { fieldCode: 'DC1', fieldName: '', fieldUnitName: '', data: { value: 10.0 } },
      { fieldCode: 'DV2', fieldName: '', fieldUnitName: '', data: { value: 590 } },
      { fieldCode: 'DC2', fieldName: '', fieldUnitName: '', data: { value: 9.5 } },
    ])
    expect(result.strings.map((s) => s.string_number)).toEqual([1, 2, 3])
  })

  it('captures Etoday / EtTo / Et_today as dailyEnergyKwh', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'EtTo', fieldName: 'Energy Today', fieldUnitName: 'kWh', data: { value: '127.4' } },
    ])
    expect(result.dailyEnergyKwh).toBe(127.4)
  })

  it('reports unrecognised fieldCodes for first-run discovery', async () => {
    const { parseRealData } = await import('@/lib/csi-client')
    const result = parseRealData([
      { fieldCode: 'DV1', fieldName: '', fieldUnitName: '', data: { value: 600 } },
      { fieldCode: 'DC1', fieldName: '', fieldUnitName: '', data: { value: 10 } },
      { fieldCode: 'INV_T', fieldName: 'Inverter Temp', fieldUnitName: 'C', data: { value: 35 } },
      { fieldCode: 'Fac', fieldName: 'Grid Frequency', fieldUnitName: 'Hz', data: { value: 50 } },
    ])
    expect(result.unrecognisedCodes).toEqual(['INV_T', 'Fac'])
  })
})

describe('CsiClient.getPlantList — pagination + longitude/latitude coercion (§4.2.1, §8 quirk #4)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('coerces numeric longitude/latitude correctly', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue({
      totalPages: 1, currentPage: 1, pageSize: 20,
      records: [
        { plantId: 12345, plantName: 'Test Plant', capacity: 500.5, status: 1, longitude: 74.16, latitude: 31.26, lastReportTime: '2026-05-05 12:00:00' },
      ],
    })

    const plants = await client.getPlantList()
    expect(plants).toEqual([
      {
        plantId: '12345',
        plantName: 'Test Plant',
        capacityKw: 500.5,
        status: 1,
        longitude: 74.16,
        latitude: 31.26,
        address: null,
        lastReportTime: '2026-05-05 12:00:00',
      },
    ])
  })

  it('walks pagination until currentPage >= totalPages', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    const get = vi.spyOn(client as any, 'get')
    get.mockResolvedValueOnce({
      totalPages: 3, currentPage: 1, pageSize: 20,
      records: [{ plantId: 1, plantName: 'A', capacity: 100, status: 1 }],
    })
    get.mockResolvedValueOnce({
      totalPages: 3, currentPage: 2, pageSize: 20,
      records: [{ plantId: 2, plantName: 'B', capacity: 200, status: 1 }],
    })
    get.mockResolvedValueOnce({
      totalPages: 3, currentPage: 3, pageSize: 20,
      records: [{ plantId: 3, plantName: 'C', capacity: 300, status: 1 }],
    })

    const plants = await client.getPlantList()
    expect(plants).toHaveLength(3)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('stops on empty records (defensive against APIs that lie about totalPages)', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    const get = vi.spyOn(client as any, 'get')
    get.mockResolvedValueOnce({ totalPages: 5, currentPage: 1, pageSize: 20, records: [{ plantId: 1, plantName: 'A', capacity: 100, status: 1 }] })
    get.mockResolvedValueOnce({ totalPages: 5, currentPage: 2, pageSize: 20, records: [] })

    const plants = await client.getPlantList()
    expect(plants).toHaveLength(1)
    expect(get).toHaveBeenCalledTimes(2) // stopped after empty page
  })

  it('returns [] when records is missing or null', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue({ totalPages: 1, currentPage: 1, pageSize: 20, records: null })
    expect(await client.getPlantList()).toEqual([])
  })

  it('handles missing longitude/latitude as null', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue({
      totalPages: 1, currentPage: 1, pageSize: 20,
      records: [{ plantId: 1, plantName: 'X', capacity: 50, status: 1 /* no lat/lon */ }],
    })
    const plants = await client.getPlantList()
    expect(plants[0].longitude).toBeNull()
    expect(plants[0].latitude).toBeNull()
  })
})

describe('CsiClient.getPlantDevices — collector tree flatten + deviceType filter (§4.2.3, §6.1)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('flattens childDevice arrays + filters to inverters (deviceType === 2)', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue([
      {
        collectorId: 1, collectorSn: 'LG001', collectorStatus: 1,
        childDevice: [
          { deviceId: 100, deviceType: 2, deviceType2: 1, deviceSn: 'INV001', ratePower: 50000, status: 1, productKey: 'PK1' },
          { deviceId: 101, deviceType: 1, deviceType2: 0, deviceSn: 'LG001-internal', ratePower: 0, status: 1, productKey: '' },
          { deviceId: 102, deviceType: 2, deviceType2: 1, deviceSn: 'INV002', ratePower: 50000, status: 1, productKey: 'PK1' },
        ],
      },
      {
        collectorId: 2, collectorSn: 'LG002', collectorStatus: 1,
        childDevice: [
          { deviceId: 103, deviceType: 2, deviceType2: 2, deviceSn: 'INV003', ratePower: 100000, status: 1, productKey: 'PK2' },
        ],
      },
    ])

    const devices = await client.getPlantDevices('plant-1')
    expect(devices.map((d) => d.deviceSn)).toEqual(['INV001', 'INV002', 'INV003'])
    expect(devices.every((d) => d.deviceType === 2)).toBe(true)
    expect(devices[0].collectorSn).toBe('LG001')
    expect(devices[2].collectorSn).toBe('LG002')
    expect(devices[0].plantId).toBe('plant-1')
  })

  it('returns [] when response is null or empty', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue(null)
    expect(await client.getPlantDevices('plant-1')).toEqual([])
  })

  it('skips entries without deviceSn (defensive against partial rows)', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue([
      { collectorSn: 'LG', childDevice: [
        { deviceId: 1, deviceType: 2 /* no deviceSn */ },
        { deviceId: 2, deviceType: 2, deviceSn: 'INV-real' },
      ]},
    ])
    const devices = await client.getPlantDevices('p')
    expect(devices.map((d) => d.deviceSn)).toEqual(['INV-real'])
  })
})

describe('CsiClient.getDeviceData — batches in chunks of 20 (§4.3.1)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('makes one call for ≤20 SNs, two for 21-40, etc.', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    const get = vi.spyOn(client as any, 'get').mockResolvedValue([])

    const sns35 = Array.from({ length: 35 }, (_, i) => `SN${i + 1}`)
    await client.getDeviceData(sns35)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('passes deviceSnStr as comma-joined string', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    const get = vi.spyOn(client as any, 'get').mockResolvedValue([])

    await client.getDeviceData(['A', 'B', 'C'])
    expect(get).toHaveBeenCalledWith('/open-api/device/data', { deviceSnStr: 'A,B,C' })
  })

  it('preserves realData rows verbatim (poller does the parsing)', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue([
      { deviceSn: 'INV001', alias: 'Inverter 1', deviceType: 2, deviceId: '100', lastReportTime: '...', realData: [
        { fieldCode: 'DV1', fieldName: 'PV1 V', fieldUnitName: 'V', data: { value: 600 } },
      ]},
    ])

    const data = await client.getDeviceData(['INV001'])
    expect(data[0].realData).toHaveLength(1)
    expect(data[0].realData[0].fieldCode).toBe('DV1')
  })

  it('skips realData rows without fieldCode', async () => {
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    vi.spyOn(client as any, 'get').mockResolvedValue([
      { deviceSn: 'INV001', realData: [
        { fieldCode: 'DV1', data: { value: 600 } },
        { fieldName: 'no code' },
        { fieldCode: '', data: { value: 1 } },
      ]},
    ])

    const data = await client.getDeviceData(['INV001'])
    expect(data[0].realData.map((r) => r.fieldCode)).toEqual(['DV1'])
  })
})

describe('CsiClient.authenticate — code:0 success (§8 quirk #1)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('caches accessToken on code:0 response', async () => {
    vi.doMock('@/lib/poller-utils', async (orig) => {
      const actual = await orig<typeof import('@/lib/poller-utils')>()
      return {
        ...actual,
        fetchWithTimeout: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 0, msg: '', data: { accessToken: 'tok-abc', uid: 'u-1' } }),
        }),
      }
    })
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    await client.authenticate()
    expect(client.isTokenValid()).toBe(true)
  })

  it('throws on code !== 0 (inverted vs Solis/Growatt)', async () => {
    vi.doMock('@/lib/poller-utils', async (orig) => {
      const actual = await orig<typeof import('@/lib/poller-utils')>()
      return {
        ...actual,
        fetchWithTimeout: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 505, msg: 'Account Nonexistent', data: null }),
        }),
      }
    })
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    await expect(client.authenticate()).rejects.toThrow(/code=505/)
  })

  it('throws when code:0 succeeds but accessToken is missing (defensive)', async () => {
    vi.doMock('@/lib/poller-utils', async (orig) => {
      const actual = await orig<typeof import('@/lib/poller-utils')>()
      return {
        ...actual,
        fetchWithTimeout: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 0, msg: '', data: { uid: 'u-1' } }),
        }),
      }
    })
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    await expect(client.authenticate()).rejects.toThrow(/no accessToken/)
  })
})

describe('CsiClient — 503 token-expired re-auth retry (§8 quirk #2)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CSI_APP_ID = 'fake'
    process.env.CSI_APP_SECRET = 'fake'
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('re-authenticates once on HTTP 503 and retries the original call', async () => {
    let callCount = 0
    vi.doMock('@/lib/poller-utils', async (orig) => {
      const actual = await orig<typeof import('@/lib/poller-utils')>()
      return {
        ...actual,
        fetchWithTimeout: vi.fn().mockImplementation(async (url: string, opts: any) => {
          callCount++
          // Sequence:
          //  1. first authenticate() → returns token
          //  2. first /plant/pageV2  → 503 (expired)
          //  3. re-authenticate()    → returns new token
          //  4. retried /plant/pageV2 → 200 OK
          if (url.includes('/user/authority')) {
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ code: 0, msg: '', data: { accessToken: `tok-${callCount}`, uid: 'u' } }),
            }
          }
          if (callCount === 2) {
            return { ok: false, status: 503, text: async () => 'expired' }
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ code: 0, msg: '', data: { totalPages: 1, currentPage: 1, pageSize: 20, records: [] } }),
          }
        }),
      }
    })
    const { CsiClient } = await import('@/lib/csi-client')
    const client = new CsiClient()
    const plants = await client.getPlantList()
    expect(plants).toEqual([])
    // 1=auth, 2=plantList(503), 3=re-auth, 4=plantList retry → 4 calls
    expect(callCount).toBe(4)
  })
})
