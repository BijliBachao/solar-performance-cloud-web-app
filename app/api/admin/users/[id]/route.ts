import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { UserUpdateSchema } from '@/lib/api-validation'
import { validationError, notFoundError, serverError } from '@/lib/api-errors'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const raw = await request.json()
    const parsed = UserUpdateSchema.safeParse(raw)
    if (!parsed.success) return validationError(parsed.error)

    const { role, status, organization_id } = parsed.data
    const updateData: any = {}

    // Validate organization exists if being assigned
    if (organization_id !== undefined) {
      if (organization_id !== null) {
        const org = await prisma.organizations.findUnique({
          where: { id: organization_id },
          select: { id: true },
        })
        if (!org) return notFoundError('Organization')
      }
      updateData.organization_id = organization_id
      if (organization_id) {
        updateData.status = 'ACTIVE'
      }
    }
    if (role !== undefined) updateData.role = role
    if (status !== undefined) updateData.status = status

    // Verify target user exists
    const existingUser = await prisma.users.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!existingUser) return notFoundError('User')

    const user = await prisma.users.update({
      where: { id: params.id },
      data: updateData,
      include: {
        organizations: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin User PATCH', error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const existingUser = await prisma.users.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!existingUser) return notFoundError('User')

    await prisma.users.update({
      where: { id: params.id },
      data: { status: 'INACTIVE' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin User DELETE', error)
  }
}
