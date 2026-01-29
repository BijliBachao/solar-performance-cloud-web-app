import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const body = await request.json()
    const { organization_id, role, status } = body

    const updateData: any = {}
    if (organization_id !== undefined) {
      updateData.organization_id = organization_id
      if (organization_id) {
        updateData.status = 'ACTIVE'
      }
    }
    if (role !== undefined) updateData.role = role
    if (status !== undefined) updateData.status = status

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
    console.error('[Admin User PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    await prisma.users.update({
      where: { id: params.id },
      data: { status: 'INACTIVE' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin User DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
