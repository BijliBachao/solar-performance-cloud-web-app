import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRole, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
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

    const [organizations, total] = await Promise.all([
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
    ])

    return NextResponse.json({
      organizations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Admin Organizations GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    const body = await request.json()
    const { name, email, phone, address } = body

    if (!name || name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: 'Name is required (2-100 characters)' },
        { status: 400 }
      )
    }

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
    console.error('[Admin Organizations POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
