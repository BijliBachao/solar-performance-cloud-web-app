import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { OrganizationCreateSchema } from '@/lib/api-validation'
import { validationError, serverError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const search = (searchParams.get('search') || '').slice(0, 100) // Cap search length
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (status && status !== 'ALL') {
      where.status = status
    }

    const [organizations, total, activeCount, inactiveCount, totalUsers, totalPlants] = await Promise.all([
      prisma.organizations.findMany({
        where,
        include: {
          _count: { select: { users: true, plant_assignments: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.organizations.count({ where }),
      prisma.organizations.count({ where: { status: 'ACTIVE' } }),
      prisma.organizations.count({ where: { status: { not: 'ACTIVE' } } }),
      prisma.users.count({ where: { organization_id: { not: null } } }),
      prisma.plant_assignments.count(),
    ])

    return NextResponse.json({
      organizations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      globalStats: { total: activeCount + inactiveCount, active: activeCount, inactive: inactiveCount, totalUsers, totalPlants },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Organizations GET', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const raw = await request.json()
    const parsed = OrganizationCreateSchema.safeParse(raw)
    if (!parsed.success) return validationError(parsed.error)

    const { name, email, phone, address } = parsed.data

    const org = await prisma.organizations.create({
      data: {
        id: `org_${Date.now()}_${randomUUID().slice(0, 8)}`,
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
      },
    })

    return NextResponse.json(org, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Organizations POST', error)
  }
}
