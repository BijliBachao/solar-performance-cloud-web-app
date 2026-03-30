import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { plant_id, organization_id } = await request.json()

    if (!plant_id || !organization_id) {
      return NextResponse.json(
        { error: 'plant_id and organization_id are required' },
        { status: 400 }
      )
    }

    // Verify plant and organization exist
    const [plant, org] = await Promise.all([
      prisma.plants.findUnique({ where: { id: plant_id }, select: { id: true } }),
      prisma.organizations.findUnique({ where: { id: organization_id }, select: { id: true } }),
    ])
    if (!plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const assignment = await prisma.plant_assignments.create({
      data: {
        plant_id,
        organization_id,
        assigned_by: userContext.userId,
      },
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error: any) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Plant is already assigned to this organization' },
        { status: 409 }
      )
    }
    console.error('[Admin Plant Assign POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const { plant_id, organization_id } = await request.json()

    if (!plant_id || !organization_id) {
      return NextResponse.json(
        { error: 'plant_id and organization_id are required' },
        { status: 400 }
      )
    }

    const result = await prisma.plant_assignments.deleteMany({
      where: { plant_id, organization_id },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Plant Assign DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
