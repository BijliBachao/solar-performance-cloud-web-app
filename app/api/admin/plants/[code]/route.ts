import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PlantUpdateSchema } from '@/lib/api-validation'

interface Params {
  params: Promise<{ code: string }>
}

// PATCH — update admin-editable plant fields. Plants are auto-created by the
// pollers (syncPlants upsert), so there is no create form — this only edits.
// Today the single editable field is plant_type (single_location vs
// multi_location). V1 scoring is identical for single_location; multi_location
// is a forward-compat marker for V1.1 branch/multi-location rollups.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { code: plantId } = await params

    const body = await request.json()
    const parsed = PlantUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const plant = await prisma.plants.findUnique({
      where: { id: plantId },
      select: { id: true },
    })
    if (!plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 })

    // Only include fields that were actually sent.
    const data: Record<string, unknown> = {}
    if (parsed.data.plant_type !== undefined) data.plant_type = parsed.data.plant_type

    const updated = await prisma.plants.update({
      where: { id: plantId },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Plant PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
