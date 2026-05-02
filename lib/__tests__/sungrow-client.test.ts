import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

// Sungrow's outer transport is hybrid RSA+AES — testing it via fetch would
// require encrypting fixtures with the same algorithm. The defensive parsing
// we want to validate lives in getPowerStationList/getDeviceList AFTER the
// AES envelope is decrypted, so we stub `request` directly. This is the same
// data shape that `request()` returns (the value of `result_data`).

describe('SungrowClient.getPowerStationList — defensive parsing per SUNGROW-API-KNOWLEDGE §4.2', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when result_data:{pageList:null} (per SUNGROW-API-KNOWLEDGE §3 — partial outages return null pageList)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({ pageList: null, rowCount: 0 })

    const plants = await client.getPowerStationList()
    expect(plants).toEqual([])
  })

  it('returns [] when result_data is null (per SUNGROW-API-KNOWLEDGE §3 — E901 token-expired path can short-circuit to null)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue(null)

    const plants = await client.getPowerStationList()
    expect(plants).toEqual([])
  })

  it('skips null entries inside pageList (defensive against malformed page rows)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      pageList: [
        null,
        {
          ps_id: 1794632,
          ps_name: 'Qadir Solar System',
          ps_type: 3,
          ps_status: 1,
          total_capcity: { unit: 'kWp', value: '785' },
        },
      ],
      rowCount: 2,
    })

    const plants = await client.getPowerStationList()
    expect(plants).toHaveLength(1)
    expect(plants[0]).toMatchObject({
      ps_id: '1794632',
      ps_name: 'Qadir Solar System',
      total_capacity_kw: 785,
    })
  })

  it('parses the gold-fixture shape (api-test-results.json plants → ps_id 1794632) per SUNGROW-API-KNOWLEDGE §4.2 (note "total_capcity" typo)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    // Subset of api-test-results.json plants response — preserves field typo
    vi.spyOn(client as any, 'request').mockResolvedValue({
      pageList: [
        {
          ps_id: 1794632,
          ps_name: 'Qadir Solar System',
          ps_type: 3,
          ps_status: 1,
          latitude: 31.262719142069,
          longitude: 74.16487287290418,
          ps_location: '7587+4RM, Raiwind, Lahore, 55150, Pakistan',
          total_capcity: { unit: 'kWp', value: '785' },
        },
      ],
      rowCount: 1,
    })

    const plants = await client.getPowerStationList()
    expect(plants).toHaveLength(1)
    expect(plants[0]).toMatchObject({
      ps_id: '1794632',
      ps_name: 'Qadir Solar System',
      total_capacity_kw: 785,
      ps_status: 1,
      ps_location: '7587+4RM, Raiwind, Lahore, 55150, Pakistan',
    })
  })
})

describe('SungrowClient.getDeviceList — defensive parsing per SUNGROW-API-KNOWLEDGE §4.3', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when pageList is null (per SUNGROW-API-KNOWLEDGE §3 — partial outage)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({ pageList: null })

    const devices = await client.getDeviceList('1794632')
    expect(devices).toEqual([])
  })

  it('filters non-inverter rows even when null entries are present (per SUNGROW-API-KNOWLEDGE §3 — null can sit alongside valid rows)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      pageList: [
        null,
        { device_sn: 'A2332065090', device_type: 1, device_name: 'Inv1', ps_id: 1794632, ps_key: 'k1', device_code: 2 },
      ],
      rowCount: 2,
    })

    const devices = await client.getDeviceList('1794632')
    expect(devices).toHaveLength(1)
    expect(devices[0].device_sn).toBe('A2332065090')
  })

  it('filters non-inverter device_type values (per SUNGROW-API-KNOWLEDGE §4.3 — type 1 = inverter, type 9 = logger)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    // Fixture mirrors api-test-results.json devices_1794632 — 7 inverters + 1 logger
    vi.spyOn(client as any, 'request').mockResolvedValue({
      pageList: [
        { device_sn: 'A2332065090', device_type: 1, device_name: 'Inverter7', ps_id: 1794632, ps_key: '1794632_1_2_1', device_code: 2, device_model_code: 'SG125CX-P2' },
        { device_sn: 'B2310710538', device_type: 9, device_name: 'Communication Device1', ps_id: 1794632, ps_key: '1794632_9_247_1' },
        null,
      ],
      rowCount: 3,
    })

    const devices = await client.getDeviceList('1794632')
    expect(devices).toHaveLength(1)
    expect(devices[0].device_sn).toBe('A2332065090')
    expect(devices[0].device_type).toBe(1)
  })
})

describe('SungrowClient.getDeviceRealTimeData — defensive parsing per SUNGROW-API-KNOWLEDGE §4.4', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when device_point_list is null (per SUNGROW-API-KNOWLEDGE §3 — partial-outage envelope)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({ device_point_list: null })

    const data = await client.getDeviceRealTimeData(['A2332065090'], [70, 96])
    expect(data).toEqual([])
  })

  it('returns [] when first device_point_list slot is null (per SUNGROW-API-KNOWLEDGE §3 — defense in depth alongside poller-side guard)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      device_point_list: [null],
    })

    const data = await client.getDeviceRealTimeData(['A2332065090'], [70, 96])
    expect(data).toEqual([])
  })

  it('returns [] when first slot has device_point:null (per SUNGROW-API-KNOWLEDGE §4.4 — point payload missing)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      device_point_list: [{ device_point: null }],
    })

    const data = await client.getDeviceRealTimeData(['A2332065090'], [70, 96])
    expect(data).toEqual([])
  })

  it('returns merged point map on happy path (per SUNGROW-API-KNOWLEDGE §4.4 — point IDs prefixed "p")', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      device_point_list: [
        { device_point: { p70: '4.5', p96: '720', p1: '5200' } },
      ],
    })

    const data = await client.getDeviceRealTimeData(['A2332065090'], [70, 96, 1])
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ p70: '4.5', p96: '720', p1: '5200' })
  })
})

describe('SungrowClient.getOpenPointInfo — defensive parsing per SUNGROW-API-KNOWLEDGE §4.5', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUNGROW_APP_KEY = 'fake'
    process.env.SUNGROW_SECRET_KEY = 'fake'
    process.env.SUNGROW_USERNAME = 'fake'
    process.env.SUNGROW_PASSWORD = 'fake'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when pageList is null (per SUNGROW-API-KNOWLEDGE §3 — same partial-outage shape as device list)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({ pageList: null })

    const points = await client.getOpenPointInfo(1)
    expect(points).toEqual([])
  })

  it('returns [] when result_data is null (per SUNGROW-API-KNOWLEDGE §3 — outer-data null path)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue(null)

    const points = await client.getOpenPointInfo(1)
    expect(points).toEqual([])
  })

  it('skips null entries inside pageList (per SUNGROW-API-KNOWLEDGE §4.5 — point catalog can have gaps)', async () => {
    const { SungrowClient } = await import('@/lib/sungrow-client')
    const client = new SungrowClient()
    vi.spyOn(client as any, 'request').mockResolvedValue({
      pageList: [
        null,
        { point_id: 70, point_name: 'String1 Current' },
        { point_id: 96, point_name: 'String1 Voltage' },
      ],
    })

    const points = await client.getOpenPointInfo(1)
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({ point_id: 70, point_name: 'String1 Current' })
  })
})
