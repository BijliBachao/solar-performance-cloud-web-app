import crypto from 'crypto'

const RATE_LIMIT_DELAY_MS = 520

export interface SolisStation {
  id: string
  stationName: string
  capacity: number
  capacityStr: string
  state: number // 1=online, 2=offline, 3=alarm
  power: number
  dayEnergy: number
  allEnergy: number
}

export interface SolisInverter {
  id: string
  sn: string
  stationId: string
  state: number
  pac: number
  eToday: number
  dcInputType: number // number of strings = dcInputType + 1
}

export interface SolisInverterDetail {
  id: string
  sn: string
  pac: number
  eToday: number
  eTotal: number
  dcInputType: number
  state: number
  [key: string]: any // uPv1..uPv32, iPv1..iPv32, pow1..pow32
}

export class SolisClient {
  private baseUrl: string
  private apiId: string
  private apiSecret: string
  private lastRequestTime = 0

  constructor(
    baseUrl?: string,
    apiId?: string,
    apiSecret?: string,
  ) {
    this.baseUrl = baseUrl || process.env.SOLIS_API_URL || 'https://www.soliscloud.com:13333'
    this.apiId = apiId || process.env.SOLIS_API_ID || ''
    this.apiSecret = apiSecret || process.env.SOLIS_API_SECRET || ''

    if (!this.apiId || !this.apiSecret) {
      throw new Error('[SolisClient] SOLIS_API_ID and SOLIS_API_SECRET must be set')
    }
  }

  private signRequest(body: string, path: string): Record<string, string> {
    const date = new Date().toUTCString()
    const md5 = crypto.createHash('md5').update(body).digest('base64')

    // CRITICAL: signature uses 'application/json' (NOT with charset)
    const signContentType = 'application/json'
    const stringToSign = `POST\n${md5}\n${signContentType}\n${date}\n${path}`
    const hmac = crypto.createHmac('sha1', this.apiSecret).update(stringToSign).digest('base64')

    return {
      'Content-Type': 'application/json;charset=UTF-8',
      'Content-MD5': md5,
      'Date': date,
      'Authorization': `API ${this.apiId}:${hmac}`,
    }
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed))
    }
    this.lastRequestTime = Date.now()
  }

  private async request<T>(path: string, body: Record<string, any>): Promise<T> {
    await this.rateLimit()

    const bodyStr = JSON.stringify(body)
    const headers = this.signRequest(bodyStr, path)

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: bodyStr,
    })

    if (!res.ok) {
      throw new Error(`[SolisClient] HTTP ${res.status} on ${path}`)
    }

    const json = await res.json()
    if (json.code !== '0') {
      throw new Error(`[SolisClient] API error on ${path}: code=${json.code} msg=${json.msg}`)
    }

    return json.data
  }

  async getStationList(): Promise<SolisStation[]> {
    const data = await this.request<any>('/v1/api/userStationList', {
      pageNo: 1,
      pageSize: 100,
    })
    const records = data?.page?.records || []
    return records.map((s: any) => ({
      id: String(s.id),
      stationName: s.stationName,
      capacity: s.capacity || 0,
      capacityStr: s.capacityStr || '',
      state: s.state,
      power: s.power || 0,
      dayEnergy: s.dayEnergy || 0,
      allEnergy: s.allEnergy || 0,
    }))
  }

  async getInverterList(stationId: string): Promise<SolisInverter[]> {
    const data = await this.request<any>('/v1/api/inverterList', {
      pageNo: 1,
      pageSize: 100,
      stationId,
    })
    const records = data?.page?.records || []
    return records.map((inv: any) => ({
      id: String(inv.id),
      sn: inv.sn,
      stationId: String(inv.stationId || stationId),
      state: inv.state,
      pac: inv.pac || 0,
      eToday: inv.eToday || 0,
      dcInputType: inv.dcInputType ?? 0,
    }))
  }

  async getInverterDetail(id: string): Promise<SolisInverterDetail> {
    const data = await this.request<any>('/v1/api/inverterDetail', {
      id,
      sn: '',
    })
    return {
      id: String(data.id),
      sn: data.sn,
      pac: data.pac || 0,
      eToday: data.eToday || 0,
      eTotal: data.eTotal || 0,
      dcInputType: data.dcInputType ?? 0,
      state: data.state,
      ...data, // includes uPv1..uPv32, iPv1..iPv32, pow1..pow32
    }
  }

  async getPlantDetail(id: string): Promise<any> {
    return this.request('/v1/api/stationDetail', { id })
  }

  async getAlarmList(stationId: string): Promise<any[]> {
    const data = await this.request<any>('/v1/api/alarmList', {
      pageNo: '1',
      pageSize: 100,
      stationId,
    })
    return data?.records || []
  }
}
