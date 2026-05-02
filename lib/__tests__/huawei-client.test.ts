import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock prisma + Decimal *before* importing the client (poller-utils transitively
// pulls in @prisma/client which would otherwise try to load native bindings).
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

// Login response fixture — the client calls this once before any data call.
const loginOkBody = {
  data: null,
  success: true,
  failCode: 0,
  params: {},
  message: 'login ok',
}

function loginResponse(): Response {
  return new Response(JSON.stringify(loginOkBody), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'XSRF-TOKEN=fake-xsrf-token-abc; Path=/; Secure; HttpOnly',
    },
  })
}

function jsonResponse(body: any): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('HuaweiClient.getPlantList — defensive parsing per Developer Guide §4.1.1', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.HUAWEI_USERNAME = 'u'
    process.env.HUAWEI_PASSWORD = 'p'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when SmartPVMS returns data:{list:null} (per Developer Guide §3 — login response shows data can be null even on success: failCode 0)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => loginResponse())
      .mockImplementationOnce(async () =>
        jsonResponse({
          success: true,
          failCode: 0,
          message: 'ok',
          data: { total: 0, pageCount: 0, pageNo: 1, pageSize: 100, list: null },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const HuaweiClient = (await import('@/lib/huawei-client')).default
    const client = new HuaweiClient('https://example', 'u', 'p')
    const plants = await client.getPlantList()
    expect(plants).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns [] when success response omits the data field (per Developer Guide §3.2.2 — success body shows "data: null" alongside failCode: 0)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => loginResponse())
      .mockImplementationOnce(async () =>
        jsonResponse({ success: true, failCode: 0, message: 'ok' })
      )
    vi.stubGlobal('fetch', fetchMock)

    const HuaweiClient = (await import('@/lib/huawei-client')).default
    const client = new HuaweiClient('https://example', 'u', 'p')
    const plants = await client.getPlantList()
    expect(plants).toEqual([])
  })

  it('returns [] when data itself is null (per Developer Guide §4.1.1 — partial-outage shape)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => loginResponse())
      .mockImplementationOnce(async () =>
        jsonResponse({ success: true, failCode: 0, data: null })
      )
    vi.stubGlobal('fetch', fetchMock)

    const HuaweiClient = (await import('@/lib/huawei-client')).default
    const client = new HuaweiClient('https://example', 'u', 'p')
    const plants = await client.getPlantList()
    expect(plants).toEqual([])
  })

  it('skips null entries inside list (per Developer Guide §4.1.1 — null array elements observed during pagination races)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => loginResponse())
      .mockImplementationOnce(async () =>
        jsonResponse({
          success: true,
          failCode: 0,
          data: {
            list: [
              null,
              {
                plantCode: 'NE=1',
                plantName: 'P1',
                capacity: 10,
                plantAddress: 'addr',
                latitude: 1,
                longitude: 2,
              },
              null,
            ],
          },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const HuaweiClient = (await import('@/lib/huawei-client')).default
    const client = new HuaweiClient('https://example', 'u', 'p')
    const plants = await client.getPlantList()
    expect(plants).toHaveLength(1)
    expect(plants[0].plantCode).toBe('NE=1')
  })

  it('parses a documented happy-path response (per Developer Guide §4.1.1 example)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => loginResponse())
      .mockImplementationOnce(async () =>
        jsonResponse({
          success: true,
          failCode: 0,
          data: {
            total: 1,
            pageCount: 1,
            pageNo: 1,
            pageSize: 100,
            list: [
              {
                plantCode: 'NE=12345678',
                plantName: 'Solar Plant Alpha',
                plantAddress: '123 Solar Street',
                longitude: 13.405,
                latitude: 52.52,
                capacity: 146.5,
              },
            ],
          },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const HuaweiClient = (await import('@/lib/huawei-client')).default
    const client = new HuaweiClient('https://example', 'u', 'p')
    const plants = await client.getPlantList()
    expect(plants).toHaveLength(1)
    expect(plants[0]).toMatchObject({
      plantCode: 'NE=12345678',
      capacity: 146.5,
    })
  })
})
