import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

function jsonResponse(body: any): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('GrowattClient.getDeviceList — defensive parsing per VALIDATED-FINDINGS §6', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GROWATT_API_TOKEN = 'fake-token'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when V4 sends data:null (per VALIDATED-FINDINGS §8 — code 102 rate-limit shape sometimes accompanies code:0 with null data)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: 'ok', data: null })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toEqual([])
  })

  it('returns [] when V4 sends data as a primitive string (Object.values("error") would yield character array — flat path must survive, per VALIDATED-FINDINGS §6)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: 'ok', data: 'some-error-string' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toEqual([])
  })

  it('returns [] when V4 sends data as a number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: 'ok', data: 42 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toEqual([])
  })

  it('handles V4 grouped-by-type shape with one group null (per VALIDATED-FINDINGS §6 — flatten path uses Object.values; null groups must coerce to [])', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        message: 'ok',
        data: {
          max: [
            { deviceSn: 'KXJ7CDC02G', deviceType: 'max', plantId: 2251305 },
          ],
          'sph-s': null,
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toHaveLength(1)
    expect(devices[0].deviceSn).toBe('KXJ7CDC02G')
  })

  it('parses canonical V4 shape — 29 max + 1 sph-s, per VALIDATED-FINDINGS §3', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        message: 'ok',
        data: {
          max: [
            { deviceSn: 'KXJ7CDC02G', deviceType: 'max', plantId: 2251305 },
            { deviceSn: 'HGJGD7X004', deviceType: 'max', plantId: 2305272 },
          ],
          'sph-s': [
            { deviceSn: 'FFP2N7B06Q', deviceType: 'sph-s', plantId: 10598320 },
          ],
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toHaveLength(3)
    expect(devices.find(d => d.deviceSn === 'FFP2N7B06Q')?.deviceType).toBe('sph-s')
  })

  it('skips device entries lacking deviceSn (per VALIDATED-FINDINGS §3 — partial entries observed)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        message: 'ok',
        data: {
          max: [
            null,
            { deviceType: 'max' }, // no deviceSn
            { deviceSn: 'OK01', deviceType: 'max' },
          ],
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const devices = await client.getDeviceList()
    expect(devices).toHaveLength(1)
    expect(devices[0].deviceSn).toBe('OK01')
  })
})

describe('GrowattClient.getLastData — defensive parsing per VALIDATED-FINDINGS §7', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GROWATT_API_TOKEN = 'fake-token'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when data is null (per VALIDATED-FINDINGS §8 — observed during rate-limit code 102 windows)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: 'ok', data: null })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const result = await client.getLastData(['SN1'], 'max')
    expect(result).toEqual([])
  })

  it('returns [] when the deviceType key is absent in data (per VALIDATED-FINDINGS §7 — no devices of that type)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: 'ok', data: { 'sph-s': [{ deviceSn: 'X' }] } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const result = await client.getLastData(['SN1'], 'max')
    expect(result).toEqual([])
  })
})

describe('GrowattClient.getPlantList — defensive parsing per VALIDATED-FINDINGS §2', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GROWATT_API_TOKEN = 'fake-token'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when V1 sends data:{plants:null} (default page size is 20 per VALIDATED-FINDINGS §2 — terminates without throwing on null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error_code: 0, error_msg: 'ok', data: { plants: null } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GrowattClient } = await import('@/lib/growatt-client')
    const client = new GrowattClient('https://growatt.example', 'fake-token')
    const plants = await client.getPlantList()
    expect(plants).toEqual([])
  })
})
