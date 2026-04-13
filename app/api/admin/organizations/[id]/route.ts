import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { OrganizationUpdateSchema } from '@/lib/api-validation'
import { validationError, notFoundError, badRequestError, serverError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const org = await prisma.organizations.findUnique({
      where: { id: params.id },
      include: {
        users: {
          select: {
            id: true, email: true, first_name: true, last_name: true,
            role: true, status: true, created_at: true,
          },
        },
        plant_assignments: {
          include: {
            plants: {
              select: {
                id: true, plant_name: true, capacity_kw: true, health_state: true,
              },
            },
          },
        },
      },
    })

    if (!org) return notFoundError('Organization')

    return NextResponse.json(org)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Org Detail GET', error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const raw = await request.json()
    const parsed = OrganizationUpdateSchema.safeParse(raw)
    if (!parsed.success) return validationError(parsed.error)

    // Verify org exists
    const existing = await prisma.organizations.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!existing) return notFoundError('Organization')

    const { name, email, phone, address, status } = parsed.data
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (address !== undefined) updateData.address = address
    if (status !== undefined) updateData.status = status

    const org = await prisma.organizations.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json(org)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Org PATCH', error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const org = await prisma.organizations.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { users: true, plant_assignments: true } },
      },
    })

    if (!org) return notFoundError('Organization')

    if (org._count.users > 0) {
      return badRequestError(`Cannot delete: ${org._count.users} user${org._count.users !== 1 ? 's' : ''} still assigned. Remove all users first.`)
    }

    if (org._count.plant_assignments > 0) {
      return badRequestError(`Cannot delete: ${org._count.plant_assignments} plant${org._count.plant_assignments !== 1 ? 's' : ''} still assigned. Unassign all plants first.`)
    }

    await prisma.organizations.update({
      where: { id: params.id },
      data: { status: 'INACTIVE' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Org DELETE', error)
  }
}
