import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { StringConfigUpsertSchema } from '@/lib/api-validation'

interface Params {
  params: Promise<{ deviceId: string; stringNumber: string }>
}

// PUT — upsert config for one (device_id, string_number).
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { deviceId, stringNumber } = await params
    const sn = Number(stringNumber)
    if (!Number.isInteger(sn) || sn < 1) {
      return NextResponse.json({ error: 'Invalid string_number' }, { status: 400 })
    }

    // Confirm device exists (cheap check + better 404)
    const device = await prisma.devices.findUnique({
      where: { id: deviceId },
      select: { id: true },
    })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const body = await request.json()
    const parsed = StringConfigUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { panel_count, panel_make, panel_rating_w, notes } = parsed.data

    const saved = await prisma.string_configs.upsert({
      where: { device_id_string_number: { device_id: deviceId, string_number: sn } },
      create: {
        device_id: deviceId,
        string_number: sn,
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

    const nameplate_w = saved.panel_count && saved.panel_rating_w
      ? saved.panel_count * saved.panel_rating_w
      : null

    return NextResponse.json({
      device_id: saved.device_id,
      string_number: saved.string_number,
      panel_count: saved.panel_count,
      panel_make: saved.panel_make,
      panel_rating_w: saved.panel_rating_w,
      notes: saved.notes,
      updated_at: saved.updated_at,
      updated_by: saved.updated_by,
      nameplate_w,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin String-Config PUT]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove config for one string (revert to "Not configured").
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { deviceId, stringNumber } = await params
    const sn = Number(stringNumber)
    if (!Number.isInteger(sn) || sn < 1) {
      return NextResponse.json({ error: 'Invalid string_number' }, { status: 400 })
    }

    await prisma.string_configs.deleteMany({
      where: { device_id: deviceId, string_number: sn },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin String-Config DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
