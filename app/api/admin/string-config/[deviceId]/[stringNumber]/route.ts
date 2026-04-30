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
    const { panel_count, panel_make, panel_rating_w, notes, is_used } = parsed.data

    // Build update payload — only include fields that were sent.
    // This lets the admin toggle is_used without overwriting panel info, and
    // vice versa. Missing fields are preserved on existing rows.
    const updateData: Record<string, unknown> = { updated_by: userContext.userId }
    if (panel_count !== undefined) updateData.panel_count = panel_count
    if (panel_make !== undefined) updateData.panel_make = panel_make ?? null
    if (panel_rating_w !== undefined) updateData.panel_rating_w = panel_rating_w ?? null
    if (notes !== undefined) updateData.notes = notes ?? null
    if (is_used !== undefined) updateData.is_used = is_used

    const saved = await prisma.string_configs.upsert({
      where: { device_id_string_number: { device_id: deviceId, string_number: sn } },
      create: {
        device_id: deviceId,
        string_number: sn,
        panel_count: panel_count ?? null,
        panel_make: panel_make ?? null,
        panel_rating_w: panel_rating_w ?? null,
        notes: notes ?? null,
        is_used: is_used ?? true,  // default to used on create — preserves current behavior
        updated_by: userContext.userId,
      },
      update: updateData,
    })

    // When admin marks a string unused, auto-resolve its open alerts so the
    // org user stops seeing red on a port they just declared empty.
    if (is_used === false) {
      await prisma.alerts.updateMany({
        where: {
          device_id: deviceId,
          string_number: sn,
          resolved_at: null,
        },
        data: {
          resolved_at: new Date(),
          resolved_by: userContext.userId,
        },
      })
    }

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
      is_used: saved.is_used,
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
