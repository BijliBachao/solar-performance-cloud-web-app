export class SmartPVMSError extends Error {
  code: number
  response?: any

  constructor(message: string, code: number, response?: any) {
    super(message)
    this.name = 'SmartPVMSError'
    this.code = code
    this.response = response
  }
}

export class AuthenticationError extends SmartPVMSError {
  constructor(message: string, code: number = 401) {
    super(message, code)
    this.name = 'AuthenticationError'
  }
}

export class RateLimitError extends SmartPVMSError {
  constructor(message: string, code: number = 429) {
    super(message, code)
    this.name = 'RateLimitError'
  }
}

interface TokenInfo {
  xsrfToken: string
  createdAt: number
  validityMs: number
}

interface CacheEntry {
  data: any
  expiresAt: number
}

export interface Plant {
  plantCode: string
  plantName: string
  capacity: number
  plantAddress: string
  latitude: number
  longitude: number
  healthState?: number
}

export interface Device {
  id: number
  devName: string
  devTypeId: number
  stationCode: string
  softwareVersion?: string
}

export interface DeviceData {
  devId: string
  dataItemMap: Record<string, number | null>
}

export interface Alarm {
  alarmId: number
  alarmName: string
  devName: string
  stationCode: string
  severity: number
  causeId: number
  raiseTime: number
}

class HuaweiClient {
  private baseUrl: string
  private username: string
  private password: string
  private token: TokenInfo | null = null
  private cache: Map<string, CacheEntry> = new Map()
  private maxRetries = 3

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl
    this.username = username
    this.password = password
  }

  async login(): Promise<void> {
    const url = `${this.baseUrl}/thirdData/login`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: this.username,
        systemCode: this.password,
      }),
    })

    const data = await res.json()
    if (!data.success && data.failCode !== 0) {
      throw new AuthenticationError(
        `Login failed: ${data.message || 'Unknown error'}`,
        data.failCode
      )
    }

    const cookies = res.headers.get('set-cookie') || ''
    const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/)
    if (!xsrfMatch) {
      throw new AuthenticationError('XSRF-TOKEN not found in response cookies')
    }

    this.token = {
      xsrfToken: xsrfMatch[1],
      createdAt: Date.now(),
      validityMs: 30 * 60 * 1000 - 60000, // 30 min minus 60s buffer
    }

    console.log('[HuaweiClient] Login successful')
  }

  async logout(): Promise<void> {
    if (!this.token) return
    try {
      await fetch(`${this.baseUrl}/thirdData/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'XSRF-TOKEN': this.token.xsrfToken,
        },
      })
    } catch {
      // Ignore logout errors
    }
    this.token = null
    console.log('[HuaweiClient] Logged out')
  }

  private isTokenValid(): boolean {
    if (!this.token) return false
    return Date.now() - this.token.createdAt < this.token.validityMs
  }

  private async ensureAuth(): Promise<void> {
    if (!this.isTokenValid()) {
      if (this.token) {
        await this.logout()
      }
      await this.login()
    }
  }

  private getCached(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  private setCache(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  }

  private async request(
    endpoint: string,
    data?: any,
    cacheKey?: string,
    cacheTtlMs?: number
  ): Promise<any> {
    if (cacheKey) {
      const cached = this.getCached(cacheKey)
      if (cached) return cached
    }

    await this.ensureAuth()

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}${endpoint}`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'XSRF-TOKEN': this.token!.xsrfToken,
          },
          body: data ? JSON.stringify(data) : undefined,
        })

        const json = await res.json()

        if (json.failCode === 305 || json.failCode === 401) {
          console.warn('[HuaweiClient] Token expired, re-authenticating...')
          this.token = null
          await this.ensureAuth()
          continue
        }

        if (json.failCode === 407 || json.failCode === 429) {
          const waitMs = Math.min(5000 * attempt, 30000)
          console.warn(
            `[HuaweiClient] Rate limited, waiting ${waitMs}ms...`
          )
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        if (!json.success && json.failCode !== 0) {
          throw new SmartPVMSError(
            `API error: ${json.message || 'Unknown'}`,
            json.failCode,
            json
          )
        }

        const result = json.data
        if (cacheKey && cacheTtlMs) {
          this.setCache(cacheKey, result, cacheTtlMs)
        }
        return result
      } catch (error) {
        lastError = error as Error
        if (
          error instanceof AuthenticationError ||
          error instanceof SmartPVMSError
        ) {
          throw error
        }
        if (attempt < this.maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1)
          console.warn(
            `[HuaweiClient] Request failed (attempt ${attempt}), retrying in ${delay}ms...`
          )
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }
    throw lastError!
  }

  async getPlantList(): Promise<Plant[]> {
    const data = await this.request(
      '/thirdData/stations',
      { pageNo: 1, pageSize: 100 },
      'plantList',
      60 * 60 * 1000 // 1 hour cache
    )
    return (data?.list || []).map((p: any) => ({
      plantCode: p.plantCode,
      plantName: p.plantName,
      capacity: p.capacity,
      plantAddress: p.plantAddress,
      latitude: p.latitude,
      longitude: p.longitude,
      healthState: p.healthState,
    }))
  }

  async getDeviceList(stationCodes: string[]): Promise<Device[]> {
    const cacheKey = `devices_${stationCodes.sort().join(',')}`
    const data = await this.request(
      '/thirdData/getDevList',
      { stationCodes: stationCodes.join(',') },
      cacheKey,
      60 * 60 * 1000 // 1 hour cache
    )
    return (data || []).map((d: any) => ({
      id: d.id,
      devName: d.devName,
      devTypeId: d.devTypeId,
      stationCode: d.stationCode,
      softwareVersion: d.softwareVersion,
    }))
  }

  async getDeviceRealtimeData(
    devIds: string[],
    devTypeId: number
  ): Promise<DeviceData[]> {
    const cacheKey = `realtime_${devTypeId}_${devIds.sort().join(',')}`
    const data = await this.request(
      '/thirdData/getDevRealKpi',
      { devIds: devIds.join(','), devTypeId },
      cacheKey,
      5 * 60 * 1000 // 5 min cache
    )
    return (data || []).map((d: any) => ({
      devId: String(d.devId),
      dataItemMap: d.dataItemMap || {},
    }))
  }

  async getActiveAlarms(stationCodes: string[]): Promise<Alarm[]> {
    const data = await this.request('/thirdData/getAlarmList', {
      stationCodes: stationCodes.join(','),
      pageNo: 1,
      pageSize: 100,
      language: 'en_US',
    })
    return (data?.list || []).map((a: any) => ({
      alarmId: a.alarmId,
      alarmName: a.alarmName,
      devName: a.devName,
      stationCode: a.stationCode,
      severity: a.severity,
      causeId: a.causeId,
      raiseTime: a.raiseTime,
    }))
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const huaweiClient = new HuaweiClient(
  process.env.HUAWEI_API_URL || 'https://intl.fusionsolar.huawei.com',
  process.env.HUAWEI_USERNAME || '',
  process.env.HUAWEI_PASSWORD || ''
)

export default HuaweiClient
