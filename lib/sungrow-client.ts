import crypto from 'crypto'
import { safeArray } from '@/lib/poller-utils'

const RATE_LIMIT_DELAY_MS = 1000

// Sungrow iSolarCloud hybrid RSA+AES encryption scheme:
// 1. Generate random 16-char AES key
// 2. RSA-encrypt that key with PKCS1v15 → base64url → x-random-secret-key header
// 3. AES-128-ECB encrypt JSON body with PKCS7 padding → uppercase hex
// 4. Response body is also AES-encrypted hex → decrypt with same AES key
// 5. x-access-key = SECRET_KEY (not app key!)
// 6. All request bodies must include api_key_param { nonce, timestamp }

// Base64url-encoded DER (X.509) RSA public key from Sungrow developer portal
const RSA_PUB_B64URL = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwaGl07TMb6rsQsnbR-1iyRcP69PauryEw8rG5mxju0De0X307517CVB1P3G1nOyPvhttflxibQrAO3M1yzgHrryFnJcHS9x8Yd94q1aJh3XjdvYHih5gAB4SkBsatTRiDyE4hOvreRa6ccnhigmS-IN7MCeznWV3vofHdjDYN1QIDAQAB'

export interface SungrowPlant {
  ps_id: string
  ps_name: string
  ps_type: number
  total_capacity_kw: number
  ps_status: number // 1=normal, 2=fault
  latitude: number | null
  longitude: number | null
  ps_location: string | null
}

export interface SungrowDevice {
  ps_key: string
  device_code: number
  device_type: number
  device_name: string
  device_sn: string
  device_model: string
  ps_id: string
}

export interface SungrowPointInfo {
  point_id: number
  point_name: string
}

export class SungrowClient {
  private gatewayUrl: string
  private appKey: string
  private secretKey: string
  private username: string
  private password: string
  private token: string | null = null
  private tokenExpiry = 0
  private lastRequestTime = 0
  private rateLimitPromise: Promise<void> = Promise.resolve()
  private rsaPem: string

  constructor(opts?: {
    gatewayUrl?: string
    appKey?: string
    secretKey?: string
    username?: string
    password?: string
  }) {
    this.gatewayUrl = opts?.gatewayUrl || process.env.SUNGROW_API_URL || 'https://gateway.isolarcloud.com.hk'
    this.appKey = opts?.appKey || process.env.SUNGROW_APP_KEY || ''
    this.secretKey = opts?.secretKey || process.env.SUNGROW_SECRET_KEY || ''
    this.username = opts?.username || process.env.SUNGROW_USERNAME || ''
    this.password = opts?.password || process.env.SUNGROW_PASSWORD || ''

    if (!this.appKey || !this.secretKey) {
      throw new Error('[SungrowClient] SUNGROW_APP_KEY and SUNGROW_SECRET_KEY must be set')
    }
    if (!this.username || !this.password) {
      throw new Error('[SungrowClient] SUNGROW_USERNAME and SUNGROW_PASSWORD must be set')
    }

    // Convert base64url DER to PEM format
    const b64std = RSA_PUB_B64URL.replace(/-/g, '+').replace(/_/g, '/')
    const derBytes = Buffer.from(b64std, 'base64')
    this.rsaPem = `-----BEGIN PUBLIC KEY-----\n${derBytes.toString('base64')}\n-----END PUBLIC KEY-----`
  }

  private generateAesKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let key = ''
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return key
  }

  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex') // 32-char hex string
  }

  // RSA-encrypt with PKCS1v15, return base64url string
  private rsaEncrypt(data: string): string {
    const dataBytes = Buffer.from(data, 'utf-8')
    // 1024-bit RSA key: max chunk = 128 - 11 = 117 bytes
    const maxChunk = 117
    const chunks: Buffer[] = []
    for (let i = 0; i < dataBytes.length; i += maxChunk) {
      const chunk = dataBytes.subarray(i, i + maxChunk)
      const encrypted = crypto.publicEncrypt(
        { key: this.rsaPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        chunk
      )
      chunks.push(encrypted)
    }
    return Buffer.concat(chunks).toString('base64url')
  }

  private aesEncrypt(plaintext: string, aesKey: string): string {
    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(aesKey, 'utf-8'), null)
    cipher.setAutoPadding(true)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
    return encrypted.toString('hex').toUpperCase()
  }

  private aesDecrypt(hexData: string, aesKey: string): string {
    const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(aesKey, 'utf-8'), null)
    decipher.setAutoPadding(true)
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(hexData, 'hex')),
      decipher.final(),
    ])
    return decrypted.toString('utf-8')
  }

  private async rateLimit(): Promise<void> {
    this.rateLimitPromise = this.rateLimitPromise.then(async () => {
      const elapsed = Date.now() - this.lastRequestTime
      if (elapsed < RATE_LIMIT_DELAY_MS) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed))
      }
      this.lastRequestTime = Date.now()
    })
    return this.rateLimitPromise
  }

  private async request<T>(path: string, body: Record<string, any>, skipAuth = false): Promise<T> {
    await this.rateLimit()

    if (!skipAuth && !this.token) {
      await this.login()
    }

    const aesKey = this.generateAesKey()
    const rsaEncryptedKey = this.rsaEncrypt(aesKey)

    const fullBody: Record<string, any> = {
      api_key_param: {
        nonce: this.generateNonce(),
        timestamp: String(Date.now()),
      },
      appkey: this.appKey,
      ...body,
    }
    if (!skipAuth && this.token) {
      fullBody.token = this.token
    }

    const bodyStr = JSON.stringify(fullBody)
    const encryptedBody = this.aesEncrypt(bodyStr, aesKey)

    const url = `${this.gatewayUrl}${path}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'x-access-key': this.secretKey,          // SECRET key, not app key
        'x-random-secret-key': rsaEncryptedKey,   // base64url RSA-encrypted AES key
        'sys_code': '901',
      },
      body: encryptedBody,
    })

    if (!res.ok) {
      throw new Error(`[SungrowClient] HTTP ${res.status} on ${path}`)
    }

    const responseText = await res.text()

    let json: any
    try {
      const decrypted = this.aesDecrypt(responseText, aesKey)
      json = JSON.parse(decrypted)
    } catch {
      try {
        json = JSON.parse(responseText)
      } catch {
        throw new Error(`[SungrowClient] Failed to parse response from ${path}: ${responseText.substring(0, 200)}`)
      }
    }

    if (json.result_code !== '1' && json.result_code !== 1) {
      const code = json.result_code
      const msg = json.result_msg || json.result_data?.msg || ''

      if (!skipAuth && (code === 'E901' || code === '300' || msg.includes('token'))) {
        console.log('[SungrowClient] Token expired, re-logging in...')
        this.token = null
        await this.login()
        return this.request<T>(path, body, true)
      }

      throw new Error(`[SungrowClient] API error on ${path}: code=${code} msg=${msg}`)
    }

    return json.result_data as T
  }

  async login(): Promise<void> {
    console.log('[SungrowClient] Logging in...')

    const aesKey = this.generateAesKey()
    const rsaEncryptedKey = this.rsaEncrypt(aesKey)

    const loginBody = JSON.stringify({
      api_key_param: {
        nonce: this.generateNonce(),
        timestamp: String(Date.now()),
      },
      appkey: this.appKey,
      login_type: '1',
      user_account: this.username,
      user_password: this.password,
    })

    const encryptedBody = this.aesEncrypt(loginBody, aesKey)

    const res = await fetch(`${this.gatewayUrl}/openapi/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'x-access-key': this.secretKey,
        'x-random-secret-key': rsaEncryptedKey,
        'sys_code': '901',
      },
      body: encryptedBody,
    })

    const responseText = await res.text()
    let json: any
    try {
      const decrypted = this.aesDecrypt(responseText, aesKey)
      json = JSON.parse(decrypted)
    } catch {
      try {
        json = JSON.parse(responseText)
      } catch {
        throw new Error(`[SungrowClient] Failed to parse login response: ${responseText.substring(0, 200)}`)
      }
    }

    if (json.result_code !== '1' && json.result_code !== 1) {
      throw new Error(`[SungrowClient] Login failed: code=${json.result_code} msg=${json.result_msg}`)
    }

    this.token = json.result_data?.token
    if (!this.token) {
      throw new Error('[SungrowClient] Login succeeded but no token returned')
    }

    this.tokenExpiry = Date.now() + 90 * 60 * 1000
    console.log('[SungrowClient] Login successful')
  }

  async getPowerStationList(): Promise<SungrowPlant[]> {
    const data = await this.request<any>('/openapi/getPowerStationList', {
      curPage: 1,
      size: 100,
    })

    const records = safeArray<any>(data?.pageList)
    return records
      .filter((p) => p)
      .map((p: any) => ({
        ps_id: String(p.ps_id),
        ps_name: p.ps_name || '',
        ps_type: p.ps_type || 0,
        total_capacity_kw: p.total_capcity ? Number(p.total_capcity.value) || 0 : 0,
        ps_status: p.ps_status ?? 1,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        ps_location: p.ps_location || null,
      }))
  }

  async getDeviceList(psId: string): Promise<SungrowDevice[]> {
    const data = await this.request<any>('/openapi/getDeviceList', {
      ps_id: psId,
      curPage: 1,
      size: 100,
    })

    const records = safeArray<any>(data?.pageList)
    return records
      .filter((d: any) => d && d.device_type === 1) // type 1 = inverter
      .map((d: any) => ({
        ps_key: d.ps_key || '',
        device_code: d.device_code || 0,
        device_type: d.device_type || 0,
        device_name: d.device_name || '',
        device_sn: d.device_sn || '',
        device_model: d.device_model_code || '',
        ps_id: String(d.ps_id || psId),
      }))
  }

  // Fetch real-time data for devices by serial number
  // CRITICAL: sn_list must be array, point_id_list must be array of strings
  async getDeviceRealTimeData(
    deviceSns: string[],
    pointIds: number[]
  ): Promise<Record<string, any>[]> {
    const results: Record<string, any>[] = []

    // Process each device individually (API returns device_point_list array)
    for (const sn of deviceSns) {
      // Split point IDs into chunks of 100 (API limit)
      const allPointData: Record<string, any> = {}

      for (let j = 0; j < pointIds.length; j += 100) {
        const chunk = pointIds.slice(j, j + 100)
        const data = await this.request<any>('/openapi/getDeviceRealTimeData', {
          sn_list: [sn],
          device_type: '1',
          point_id_list: chunk.map(String),
        })

        const dpList = data?.device_point_list || []
        if (dpList.length > 0 && dpList[0].device_point) {
          Object.assign(allPointData, dpList[0].device_point)
        }
      }

      if (Object.keys(allPointData).length > 0) {
        results.push(allPointData)
      }
    }

    return results
  }

  async getOpenPointInfo(
    deviceType: number,
    type: string = '2'
  ): Promise<SungrowPointInfo[]> {
    const data = await this.request<any>('/openapi/getOpenPointInfo', {
      device_type: String(deviceType),
      type,
      curPage: 1,
      size: 200,
    })

    const records = data?.pageList || []
    return records.map((p: any) => ({
      point_id: Number(p.point_id),
      point_name: p.point_name || '',
    }))
  }

  isTokenValid(): boolean {
    return !!this.token && Date.now() < this.tokenExpiry
  }
}
