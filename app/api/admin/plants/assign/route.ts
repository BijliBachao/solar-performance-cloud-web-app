import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PlantAssignSchema } from '@/lib/api-validation'
import { validationError, notFoundError, conflictError, serverError } from '@/lib/api-errors'

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const raw = await request.json()
    const parsed = PlantAssignSchema.safeParse(raw)
    if (!parsed.success) return validationError(parsed.error)

    const { plant_id, organization_id } = parsed.data

    // Verify both plant and organization exist
    const [plant, org] = await Promise.all([
      prisma.plants.findUnique({ where: { id: plant_id }, select: { id: true } }),
      prisma.organizations.findUnique({ where: { id: organization_id }, select: { id: true } }),
    ])
    if (!plant) return notFoundError('Plant')
    if (!org) return notFoundError('Organization')

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
      return conflictError('Plant is already assigned to this organization')
    }
    return serverError('Admin Plant Assign POST', error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const raw = await request.json()
    const parsed = PlantAssignSchema.safeParse(raw)
    if (!parsed.success) return validationError(parsed.error)

    const { plant_id, organization_id } = parsed.data

    const result = await prisma.plant_assignments.deleteMany({
      where: { plant_id, organization_id },
    })

    if (result.count === 0) return notFoundError('Assignment')

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Plant Assign DELETE', error)
  }
}
