import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const clerkUser = await currentUser()
    if (!clerkUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const primaryEmail = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress

    let dbUser = await prisma.users.findFirst({
      where: {
        OR: [
          { clerk_user_id: clerkUserId },
          ...(primaryEmail ? [{ email: primaryEmail }] : []),
        ],
      },
      include: { organizations: true },
    })

    // Fallback: create user if webhook was missed
    if (!dbUser && primaryEmail) {
      dbUser = await prisma.users.create({
        data: {
          id: `user_${Date.now()}_${randomUUID().slice(0, 8)}`,
          clerk_user_id: clerkUserId,
          email: primaryEmail,
          first_name: clerkUser.firstName || null,
          last_name: clerkUser.lastName || null,
          role: 'ORG_USER',
          status: 'PENDING_ASSIGNMENT',
        },
        include: { organizations: true },
      })
      console.log(`[Auth] Fallback user creation: ${primaryEmail}`)
    }

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User record not found' },
        { status: 404 }
      )
    }

    // Update last login
    await prisma.users.update({
      where: { id: dbUser.id },
      data: { last_login_at: new Date() },
    })

    const permissions = getPermissionsForRole(dbUser.role)

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
      profile: {
        role: dbUser.role,
        organizationId: dbUser.organization_id,
        organizationName: dbUser.organizations?.name || null,
        status: dbUser.status,
        permissions,
      },
    })
  } catch (error) {
    console.error('[Auth] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case 'SUPER_ADMIN':
      return [
        'organization:create',
        'organization:manage',
        'plant:assign',
        'user:manage:all',
        'data:view:all',
        'alerts:manage:all',
      ]
    case 'ORG_USER':
    default:
      return ['plant:view:org', 'data:view:org', 'alerts:view:org']
  }
}
