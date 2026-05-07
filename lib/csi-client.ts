import { safeArray, fetchWithTimeout } from '@/lib/poller-utils'

// Canadian Solar (CSI) Smart Energy API client.
// SolarMAN-derived Bearer-token API. Auth via /open-api/user/authority,
// re-auth on 503 (token-expired sentinel per docs §3.4). Rate limit
// undocumented — defensive 1 req/sec until CSI confirms otherwise.
//
// CRITICAL gotchas from docs (`Working/all_API/csi/CSI-API-KNOWLEDGE.md` §8):
//   • code:200 = success (verified 2026-05-07 against sep-api.csisolar.com — docs said 0, reality differs).
//   • 503 means token expired, NOT service unavailable. Re-auth on 503.
//   • realData[].data is a scalar (number or string), NOT an object — verified 2026-05-07.
//   • realData entries can be missing on partial outages — treat as no-data,
//     not as "string broken".
//   • Accept-Language: en-US — without it, msg/labels come back zh-CN.
//   • Field-code taxonomy verified 2026-05-07: dv{N} (voltage V), dc{N} (current A),
//     dp{N} (power W) — all lowercase, no zero-padding. 490 rows per inverter.

const RATE_LIMIT_DELAY_MS = 1000
const TOKEN_EXPIRY_MS = 30 * 60 * 1000 // 30 min defensive default; verify on first run
const PLANT_LIST_PAGE_SIZE = 20
const REALTIME_BATCH = 20  // hard cap from docs §4.2.4 / §4.3.1

export interface CsiPlant {
  plantId: string
  plantName: string
  capacityKw: number
  status: number
  longitude: number | null
  latitude: number | null
  address: string | null
  lastReportTime: string | null
}

export interface CsiDevice {
  deviceId: string
  deviceSn: string
  deviceType: number   // 1=Data Logger, 2=Inverter
  deviceType2: number  // sub-type, undocumented enum
  ratePower: number    // W (rated)
  status: number
  productKey: string
  plantId: string
  collectorSn: string  // parent data logger SN
}

export interface CsiPlantRealtime {
  plantId: string
  timestamp: string
  dayElectric: number  // kWh
  power: number        // W
}

export interface CsiRealDataRow {
  fieldCode: string
  fieldName: string
  fieldUnitName: string
  data: number | string | null  // scalar, verified 2026-05-07
}

export interface CsiDeviceData {
  deviceSn: string
  alias: string
  deviceType: number
  deviceType2: number
  deviceId: string
  lastReportTime: string | null
  realData: CsiRealDataRow[]
}

export interface CsiAlarm {
  alertId: string
  plantId: string
  deviceSn: string
  alertCode: string
  alertCodeName: string
  alertLevel: number
  alertLevelLabel: string
  status: number
  statusLabel: string
  startTime: string
  endTime: string | null
  raw: Record<string, unknown>
}

export class CsiClient {
  private baseUrl: string
  private appId: string
  private appSecret: string
  private accessToken: string | null = null
  private uid: string | null = null
  private tokenExpiry = 0
  private lastRequestTime = 0
  private rateLimitPromise: Promise<void> = Promise.resolve()

  constructor(opts?: { baseUrl?: string; appId?: string; appSecret?: string }) {
    this.baseUrl = opts?.baseUrl || process.env.CSI_API_URL || 'https://sep-api.csisolar.com'
    this.appId = opts?.appId || process.env.CSI_APP_ID || ''
    this.appSecret = opts?.appSecret || process.env.CSI_APP_SECRET || ''

    if (!this.appId || !this.appSecret) {
      throw new Error('[CsiClient] CSI_APP_ID and CSI_APP_SECRET must be set')
    }
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

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
      }
    }
    return url.toString()
  }

  // GET wrapper handling: rate-limit, auth refresh, code:0 success check,
  // 503 → re-auth-and-retry-once, en-US localisation.
  private async get<T>(path: string, query?: Record<string, string | number | undefined>, isRetry = false): Promise<T> {
    await this.rateLimit()
    if (!this.accessToken) await this.authenticate()

    const res = await fetchWithTimeout(this.buildUrl(path, query), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Accept-Language': 'en-US',
      },
    })

    // 503 = token expired per docs §3.4. Re-auth once, then retry.
    if (res.status === 503 && !isRetry) {
      console.log('[CsiClient] 503 — token expired, re-authenticating')
      this.accessToken = null
      await this.authenticate()
      return this.get<T>(path, query, true)
    }

    if (!res.ok) {
      throw new Error(`[CsiClient] HTTP ${res.status} on ${path}`)
    }

    const text = await res.text()
    let json: any
    try { json = JSON.parse(text) }
    catch { throw new Error(`[CsiClient] Failed to parse ${path}: ${text.substring(0, 200)}`) }

    if (json.code !== 200) {
      throw new Error(`[CsiClient] API error on ${path}: code=${json.code} msg=${json.msg || ''}`)
    }

    return json.data as T
  }

  async authenticate(): Promise<void> {
    console.log('[CsiClient] Authenticating...')
    await this.rateLimit()

    const res = await fetchWithTimeout(`${this.baseUrl}/open-api/user/authority`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
      },
      body: JSON.stringify({ appId: this.appId, appSecret: this.appSecret }),
    })

    if (!res.ok) {
      throw new Error(`[CsiClient] Auth HTTP ${res.status}`)
    }

    const text = await res.text()
    let json: any
    try { json = JSON.parse(text) }
    catch { throw new Error(`[CsiClient] Auth response unparseable: ${text.substring(0, 200)}`) }

    if (json.code !== 200) {
      throw new Error(`[CsiClient] Auth failed: code=${json.code} msg=${json.msg || ''}`)
    }

    this.accessToken = json.data?.accessToken || null
    this.uid = json.data?.uid || null
    if (!this.accessToken) {
      throw new Error('[CsiClient] Auth succeeded but no accessToken returned')
    }
    this.tokenExpiry = Date.now() + TOKEN_EXPIRY_MS
    console.log(`[CsiClient] Authenticated (uid=${this.uid})`)
  }

  // Paginated plant list. Loops until currentPage >= totalPages.
  async getPlantList(): Promise<CsiPlant[]> {
    const all: CsiPlant[] = []
    let page = 1

    while (true) {
      const data = await this.get<{
        totalPages?: number
        currentPage?: number
        records?: any[]
      }>('/open-api/plant/pageV2', { page: String(page), size: String(PLANT_LIST_PAGE_SIZE) })

      const records = safeArray<any>(data?.records)
      for (const p of records) {
        if (!p?.plantId) continue
        all.push({
          plantId: String(p.plantId),
          plantName: p.plantName || '',
          capacityKw: Number(p.capacity) || 0,
          status: Number(p.status) || 0,
          // pageV2 returns numbers, single-plant returns strings — coerce.
          longitude: p.longitude !== undefined && p.longitude !== '' ? Number(p.longitude) : null,
          latitude: p.latitude !== undefined && p.latitude !== '' ? Number(p.latitude) : null,
          address: p.address || null,
          lastReportTime: p.lastReportTime || null,
        })
      }

      const totalPages = Number(data?.totalPages) || 1
      const currentPage = Number(data?.currentPage) || page
      if (currentPage >= totalPages || records.length === 0) break
      page++
      // Hard guard against runaway loops on malformed responses.
      if (page > 100) {
        console.warn('[CsiClient] getPlantList: stopping after 100 pages (suspected bad pagination response)')
        break
      }
    }

    return all
  }

  // Plant → device list. Uses /device/page (flat list, verified 2026-05-07).
  // /plant/devices always returns [] — wrong endpoint per docs.
  async getPlantDevices(plantId: string): Promise<CsiDevice[]> {
    const data = await this.get<any[]>('/open-api/device/page', { plantId })
    const devices: CsiDevice[] = []

    for (const d of safeArray<any>(data)) {
      if (!d?.deviceSn) continue
      devices.push({
        deviceId: String(d.deviceId || ''),
        deviceSn: d.deviceSn,
        deviceType: Number(d.deviceType) || 0,
        deviceType2: Number(d.deviceType2) || 0,
        ratePower: Number(d.ratePower) || 0,
        status: Number(d.status) || 0,
        productKey: d.productKey || '',
        plantId: String(d.plantId || plantId),
        collectorSn: d.upDeviceSn || '',
      })
    }

    // Inverters only (deviceType === 2 per docs §6.1).
    return devices.filter((d) => d.deviceType === 2)
  }

  // Plant-level realtime power. Batches in chunks of REALTIME_BATCH (20).
  async getPlantsRealtime(plantIds: string[]): Promise<CsiPlantRealtime[]> {
    const out: CsiPlantRealtime[] = []
    for (let i = 0; i < plantIds.length; i += REALTIME_BATCH) {
      const chunk = plantIds.slice(i, i + REALTIME_BATCH)
      const data = await this.get<any[]>('/open-api/plant/realtime', { plantId: chunk.join(',') })
      for (const r of safeArray<any>(data)) {
        if (!r?.plantId) continue
        out.push({
          plantId: String(r.plantId),
          timestamp: r.timestamp || '',
          dayElectric: Number(r.dayElectric) || 0,
          power: Number(r.power) || 0,
        })
      }
    }
    return out
  }

  // Device realtime data. Batches in chunks of REALTIME_BATCH (20).
  // Returns `realData[]` rows untransformed — the poller parses fieldCodes.
  async getDeviceData(deviceSns: string[]): Promise<CsiDeviceData[]> {
    const out: CsiDeviceData[] = []
    for (let i = 0; i < deviceSns.length; i += REALTIME_BATCH) {
      const chunk = deviceSns.slice(i, i + REALTIME_BATCH)
      const data = await this.get<any[]>('/open-api/device/data', { deviceSnStr: chunk.join(',') })
      for (const d of safeArray<any>(data)) {
        if (!d?.deviceSn) continue
        out.push({
          deviceSn: d.deviceSn,
          alias: d.alias || '',
          deviceType: Number(d.deviceType) || 0,
          deviceType2: Number(d.deviceType2) || 0,
          deviceId: String(d.deviceId || ''),
          lastReportTime: d.lastReportTime || null,
          realData: safeArray<any>(d.realData)
            .filter((r) => r?.fieldCode)
            .map((r) => ({
              fieldCode: String(r.fieldCode),
              fieldName: r.fieldName || '',
              fieldUnitName: r.fieldUnitName || '',
              data: (r.data !== undefined && r.data !== null) ? r.data : null,
            })),
        })
      }
    }
    return out
  }

  // Active alerts, paginated. Used for vendor_alarms refresh.
  async getActiveAlerts(plantId?: string): Promise<CsiAlarm[]> {
    const all: CsiAlarm[] = []
    let page = 1

    while (true) {
      const data = await this.get<{
        totalPages?: number
        currentPage?: number
        records?: any[]
      }>('/open-api/alert/pageV2', {
        plantId,
        page: String(page),
        size: '100',
      })

      const records = safeArray<any>(data?.records)
      for (const a of records) {
        if (!a?.alertId) continue
        all.push({
          alertId: String(a.alertId),
          plantId: String(a.plantId || ''),
          deviceSn: a.deviceSn || '',
          alertCode: String(a.alertCode || ''),
          alertCodeName: a.alertCodeName || '',
          alertLevel: Number(a.alertLevel) || 0,
          alertLevelLabel: a.alertLevelLabel || '',
          status: Number(a.status) || 0,
          statusLabel: a.statusLabel || '',
          startTime: a.startTime || '',
          endTime: a.endTime || null,
          raw: a,
        })
      }

      const totalPages = Number(data?.totalPages) || 1
      const currentPage = Number(data?.currentPage) || page
      if (currentPage >= totalPages || records.length === 0) break
      page++
      if (page > 100) break
    }

    return all
  }

  isTokenValid(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry
  }
}

// Helper: extract a numeric value from a CSI realData row's `data` field.
// Verified 2026-05-07: data is a scalar (number or string), not an object.
export function extractRealDataValue(row: CsiRealDataRow): number | null {
  if (row.data === null || row.data === undefined) return null
  if (typeof row.data === 'number' && Number.isFinite(row.data)) return row.data
  if (typeof row.data === 'string' && row.data !== '') {
    const n = Number(row.data)
    if (Number.isFinite(n)) return n
  }
  return null
}

// ━━━ Field-code parsing for /open-api/device/data realData[] rows ━━━
// Verified 2026-05-07 against live sep-api.csisolar.com (490 rows per inverter):
//   dv{N} = DC string voltage (V)
//   dc{N} = DC string current (A)
//   dp{N} = DC string power (W)
//   elec_day = today's energy (kWh)
// All lowercase, no zero-padding.

export const CSI_STRING_VOLTAGE_RE = /^dv(\d+)$/
export const CSI_STRING_CURRENT_RE = /^dc(\d+)$/
export const CSI_STRING_POWER_RE   = /^dp(\d+)$/
export const CSI_DAILY_ENERGY_FIELD_CODES = ['elec_day'] as const

export interface ParsedCsiStringMeasurement {
  string_number: number
  voltage: number
  current: number
  power: number
}

export interface ParsedCsiRealData {
  strings: ParsedCsiStringMeasurement[]
  dailyEnergyKwh: number | null
  unrecognisedCodes: string[]
}

export function parseRealData(realData: CsiRealDataRow[]): ParsedCsiRealData {
  const byString = new Map<number, Partial<ParsedCsiStringMeasurement>>()
  let dailyEnergyKwh: number | null = null
  const recognised = new Set<string>()
  const unrecognisedCodes: string[] = []

  for (const row of realData) {
    let match = row.fieldCode.match(CSI_STRING_VOLTAGE_RE)
    if (match) {
      const n = Number(match[1])
      const v = extractRealDataValue(row)
      if (v !== null) {
        const slot = byString.get(n) || { string_number: n }
        slot.voltage = v
        byString.set(n, slot)
      }
      recognised.add(row.fieldCode)
      continue
    }
    match = row.fieldCode.match(CSI_STRING_CURRENT_RE)
    if (match) {
      const n = Number(match[1])
      const v = extractRealDataValue(row)
      if (v !== null) {
        const slot = byString.get(n) || { string_number: n }
        slot.current = v
        byString.set(n, slot)
      }
      recognised.add(row.fieldCode)
      continue
    }
    match = row.fieldCode.match(CSI_STRING_POWER_RE)
    if (match) {
      const n = Number(match[1])
      const v = extractRealDataValue(row)
      if (v !== null) {
        const slot = byString.get(n) || { string_number: n }
        slot.power = v
        byString.set(n, slot)
      }
      recognised.add(row.fieldCode)
      continue
    }
    if ((CSI_DAILY_ENERGY_FIELD_CODES as readonly string[]).includes(row.fieldCode)) {
      const v = extractRealDataValue(row)
      if (v !== null) dailyEnergyKwh = v
      recognised.add(row.fieldCode)
      continue
    }
    if (!recognised.has(row.fieldCode)) {
      unrecognisedCodes.push(row.fieldCode)
    }
  }

  // Only emit measurements where we have at least V + I (power computed if
  // missing; voltage-only rows are useless for fault detection).
  const strings: ParsedCsiStringMeasurement[] = []
  for (const [, slot] of byString) {
    if (typeof slot.voltage !== 'number' || typeof slot.current !== 'number') continue
    strings.push({
      string_number: slot.string_number!,
      voltage: slot.voltage,
      current: slot.current,
      power: typeof slot.power === 'number' ? slot.power : slot.voltage * slot.current,
    })
  }
  strings.sort((a, b) => a.string_number - b.string_number)

  return { strings, dailyEnergyKwh, unrecognisedCodes }
}
