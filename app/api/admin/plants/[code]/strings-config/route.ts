import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'
import { StringConfigBulkSchema } from '@/lib/api-validation'

interface Params {
  params: Promise<{ code: string }>
}

// GET — list every string under the plant (active / inactive / unused) with its config (LEFT JOIN).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { code: plantId } = await params

    const plant = await prisma.plants.findUnique({
      where: { id: plantId },
      select: { id: true, plant_name: true, capacity_kw: true },
    })
    if (!plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 })

    const devices = await prisma.devices.findMany({
      where: { plant_id: plantId, device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } },
      select: { id: true, device_name: true, max_strings: true, provider: true, model: true },
      orderBy: { device_name: 'asc' },
    })
    if (devices.length === 0) {
      return NextResponse.json({ plant, devices: [] })
    }

    const deviceIds = devices.map(d => d.id)

    // Strings that have ever produced data
    const lifetime = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: { device_id: { in: deviceIds } },
    })
    const lifetimeSet = new Set(lifetime.map(r => `${r.device_id}:${r.string_number}`))

    // All saved configs for these devices
    const configs = await prisma.string_configs.findMany({
      where: { device_id: { in: deviceIds } },
    })
    const configMap = new Map(configs.map(c => [`${c.device_id}:${c.string_number}`, c]))

    // Build per-device string list (1..max_strings)
    const enriched = devices.map(d => {
      const strings: any[] = []
      const max = d.max_strings ?? 0
      // include any lifetime string_number that exceeds max_strings (defensive)
      const observedNumbers = new Set<number>()
      for (let s = 1; s <= max; s++) observedNumbers.add(s)
      for (const key of lifetimeSet) {
        const [devId, snStr] = key.split(':')
        if (devId === d.id) observedNumbers.add(Number(snStr))
      }
      const sorted = Array.from(observedNumbers).sort((a, b) => a - b)

      for (const s of sorted) {
        const key = `${d.id}:${s}`
        const cfg = configMap.get(key)
        const status = lifetimeSet.has(key) ? 'active' : 'unused'
        const nameplate_w = cfg?.panel_count && cfg?.panel_rating_w
          ? cfg.panel_count * cfg.panel_rating_w
          : null

        strings.push({
          string_number: s,
          status, // 'active' = has produced data ever; 'unused' = port within max_strings but never produced
          config: cfg
            ? {
                panel_count: cfg.panel_count,
                panel_make: cfg.panel_make,
                panel_rating_w: cfg.panel_rating_w,
                notes: cfg.notes,
                updated_at: cfg.updated_at,
                updated_by: cfg.updated_by,
              }
            : null,
          nameplate_w,
        })
      }

      return {
        device_id: d.id,
        device_name: d.device_name,
        provider: d.provider,
        model: d.model,
        max_strings: d.max_strings,
        strings,
      }
    })

    return NextResponse.json({ plant, devices: enriched })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Strings-Config GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — bulk apply same config to all strings under the plant.
// Body: StringConfigBulkSchema.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { code: plantId } = await params

    const body = await request.json()
    const parsed = StringConfigBulkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { panel_count, panel_make, panel_rating_w, notes, only_unconfigured } = parsed.data

    const devices = await prisma.devices.findMany({
      where: { plant_id: plantId, device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } },
      select: { id: true, max_strings: true },
    })
    if (devices.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No inverters on this plant' })
    }

    const deviceIds = devices.map(d => d.id)

    // Strings that have ever produced data
    const lifetime = await prisma.string_daily.groupBy({
      by: ['device_id', 'string_number'],
      where: { device_id: { in: deviceIds } },
    })
    const observed = new Set<string>()
    for (const r of lifetime) observed.add(`${r.device_id}:${r.string_number}`)
    for (const d of devices) {
      const max = d.max_strings ?? 0
      for (let s = 1; s <= max; s++) observed.add(`${d.id}:${s}`)
    }

    let alreadyConfigured = new Set<string>()
    if (only_unconfigured) {
      const existing = await prisma.string_configs.findMany({
        where: { device_id: { in: deviceIds } },
        select: { device_id: true, string_number: true },
      })
      alreadyConfigured = new Set(existing.map(e => `${e.device_id}:${e.string_number}`))
    }

    const targets: Array<{ device_id: string; string_number: number }> = []
    for (const key of observed) {
      if (only_unconfigured && alreadyConfigured.has(key)) continue
      const [devId, snStr] = key.split(':')
      targets.push({ device_id: devId, string_number: Number(snStr) })
    }

    // Per-row try/catch so one DB error doesn't lose the partial-success count.
    let updated = 0
    const failures: Array<{ device_id: string; string_number: number; error: string }> = []
    for (const t of targets) {
      try {
        await prisma.string_configs.upsert({
          where: { device_id_string_number: { device_id: t.device_id, string_number: t.string_number } },
          create: {
            device_id: t.device_id,
            string_number: t.string_number,
            panel_count,
            panel_make: panel_make ?? null,
            panel_rating_w: panel_rating_w ?? null,
            notes: notes ?? null,
            updated_by: userContext.userId,
          },
          update: {
            panel_count,
            panel_make: panel_make ?? null,
            panel_rating_w: panel_rating_w ?? null,
            notes: notes ?? null,
            updated_by: userContext.userId,
          },
        })
        updated++
      } catch (err: any) {
        failures.push({
          device_id: t.device_id,
          string_number: t.string_number,
          error: err?.message?.slice(0, 200) || 'unknown',
        })
      }
    }

    const message = failures.length === 0
      ? `Applied to ${updated} strings`
      : `Applied to ${updated} strings, ${failures.length} failed`

    return NextResponse.json({
      updated,
      failed: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      message,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Strings-Config BULK]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
