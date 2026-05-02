import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// poller-utils transitively imports prisma — stub it before the client
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

function jsonResponse(body: any): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('SolisClient.getStationList — defensive parsing per SOLISCLOUD_API_REFERENCE §4.1', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SOLIS_API_ID = 'fake-id'
    process.env.SOLIS_API_SECRET = 'fake-secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when API sends data:{page:null} (per SolisCloud §2 — paginated shape, partial-outage observed in production logs)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, code: '0', msg: 'success', data: { page: null } })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const stations = await client.getStationList()
    expect(stations).toEqual([])
  })

  it('returns [] when API sends data:{page:{records:null}} (per SolisCloud §2 — records key exists but null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        code: '0',
        msg: 'success',
        data: { page: { records: null, total: 0, current: 1, pages: 0 } },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const stations = await client.getStationList()
    expect(stations).toEqual([])
  })

  it('returns [] when data itself is null (per SolisCloud §11 — error-shape parity even with code:"0")', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, code: '0', msg: 'success', data: null })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const stations = await client.getStationList()
    expect(stations).toEqual([])
  })

  it('skips null entries inside records (per SolisCloud §4.1 — defensive against pagination races)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        code: '0',
        msg: 'success',
        data: {
          page: {
            total: 2,
            current: 1,
            pages: 1,
            records: [
              null,
              { id: '111', stationName: 'Plant A', capacity: 10, state: 1 },
            ],
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const stations = await client.getStationList()
    expect(stations).toHaveLength(1)
    expect(stations[0].id).toBe('111')
  })

  it('getInverterList returns [] when data:{page:null} (per SolisCloud §3.1 — same paginated shape, same partial-outage class as §4.1)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, code: '0', msg: 'success', data: { page: null } })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const inverters = await client.getInverterList('1234567890')
    expect(inverters).toEqual([])
  })

  it('getInverterList skips null entries inside records (per SolisCloud §3.1 — pagination race)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        code: '0',
        msg: 'success',
        data: {
          page: {
            total: 2,
            current: 1,
            pages: 1,
            records: [
              null,
              { id: '999', sn: 'INV001', stationId: '1234567890', state: 1, pac: 5.5, eToday: 12, dcInputType: 3 },
            ],
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const inverters = await client.getInverterList('1234567890')
    expect(inverters).toHaveLength(1)
    expect(inverters[0].sn).toBe('INV001')
  })

  it('parses documented happy-path response (per SolisCloud §4.1)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        code: '0',
        msg: 'success',
        data: {
          page: {
            total: 1,
            current: 1,
            pages: 1,
            records: [
              {
                id: 1298491919448631809,
                stationName: 'Lahore Plant',
                capacity: 50,
                capacityStr: 'kWp',
                state: 1,
                power: 12.3,
                dayEnergy: 100,
                allEnergy: 50000,
              },
            ],
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { SolisClient } = await import('@/lib/solis-client')
    const client = new SolisClient('https://solis.example', 'fake-id', 'fake-secret')
    const stations = await client.getStationList()
    expect(stations).toHaveLength(1)
    expect(stations[0]).toMatchObject({
      stationName: 'Lahore Plant',
      capacity: 50,
      state: 1,
    })
  })
})
