export interface GrowattPlant {
  plant_id: number
  name: string
  peak_power: number
  city: string
  status: number
}

export interface GrowattDevice {
  deviceSn: string
  deviceType: string
  plantId?: number
  dataloggerSn?: string
  lost?: boolean
}

export class GrowattClient {
  private baseUrl: string
  private token: string
  private maxRetries = 3

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || process.env.GROWATT_API_URL || 'https://openapi.growatt.com'
    this.token = token || process.env.GROWATT_API_TOKEN || ''
  }

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error: any) {
        lastError = error
        const isRateLimit = error.message?.includes('Rate limited')
        if (isRateLimit) {
          const waitMs = 30000
          console.warn(`[GrowattClient] Rate limited on ${context}, waiting ${waitMs}ms...`)
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }
        if (attempt < this.maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1) // 1s, 2s, 4s
          console.warn(`[GrowattClient] ${context} failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }
    throw lastError!
  }

  private async v1Get<T>(path: string): Promise<T> {
    return this.withRetry(async () => {
      const url = `${this.baseUrl}${path}`
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'token': this.token },
      })

      if (!res.ok) {
        throw new Error(`[GrowattClient] HTTP ${res.status} on GET ${path}`)
      }

      const json = await res.json()

      if (json.error_code === 10012) {
        throw new Error(`[GrowattClient] Rate limited (V1 10012) on ${path}`)
      }

      if (json.error_code && json.error_code !== 0) {
        throw new Error(`[GrowattClient] V1 error on ${path}: code=${json.error_code} msg=${json.error_msg}`)
      }

      return json
    }, `GET ${path}`)
  }

  private async v4Post<T>(path: string, params: Record<string, string>): Promise<T> {
    return this.withRetry(async () => {
      const url = `${this.baseUrl}${path}`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'token': this.token,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
      })

      if (!res.ok) {
        throw new Error(`[GrowattClient] HTTP ${res.status} on POST ${path}`)
      }

      const json = await res.json()

      if (json.code === 102) {
        throw new Error(`[GrowattClient] Rate limited (V4 102) on ${path}`)
      }

      if (json.code === 12) {
        throw new Error(`[GrowattClient] Permission denied (V4 12) on ${path}`)
      }

      if (json.code !== undefined && json.code !== 0) {
        throw new Error(`[GrowattClient] V4 error on ${path}: code=${json.code} msg=${json.message}`)
      }

      return json
    }, `POST ${path}`)
  }

  async getPlantList(): Promise<GrowattPlant[]> {
    const allPlants: GrowattPlant[] = []

    // First page to get total count and pages
    const page1: any = await this.v1Get('/v1/plant/list?page=1')
    const plants1 = page1.data?.plants || []
    const totalPages = page1.data?.pages || 1

    for (const p of plants1) {
      allPlants.push({
        plant_id: p.plant_id,
        name: p.name,
        peak_power: p.peak_power || 0,
        city: p.city || '',
        status: p.status,
      })
    }

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      const pageData: any = await this.v1Get(`/v1/plant/list?page=${page}`)
      const plants = pageData.data?.plants || []
      for (const p of plants) {
        allPlants.push({
          plant_id: p.plant_id,
          name: p.name,
          peak_power: p.peak_power || 0,
          city: p.city || '',
          status: p.status,
        })
      }
    }

    return allPlants
  }

  async getDeviceList(): Promise<GrowattDevice[]> {
    const json: any = await this.v4Post('/v4/new-api/queryDeviceList', {})

    const devices: GrowattDevice[] = []
    const data = json.data || {}

    // V4 API returns data grouped by device type: { max: [...], "sph-s": [...], min: [...] }
    // Flatten all device type arrays into one list
    const allDevices: any[] = Array.isArray(data)
      ? data
      : Object.values(data).flat()

    for (const d of allDevices) {
      if (!d || !d.deviceSn) continue
      devices.push({
        deviceSn: d.deviceSn,
        deviceType: d.deviceType,
        plantId: d.plantId,
        dataloggerSn: d.dataloggerSn,
        lost: d.lost,
      })
    }

    return devices
  }

  async getLastData(deviceSns: string[], deviceType: string): Promise<any[]> {
    if (deviceSns.length === 0) return []

    const json: any = await this.v4Post('/v4/new-api/queryLastData', {
      deviceType,
      deviceSn: deviceSns.join(','),
    })

    // Response structure: data.max[] or data['sph-s'][]
    const data = json.data || {}
    return data[deviceType] || []
  }

  async getDevicesByPlant(plantId: string): Promise<any[]> {
    const json: any = await this.v1Get(`/v1/device/list?plant_id=${plantId}`)
    return json.data?.devices || []
  }
}
