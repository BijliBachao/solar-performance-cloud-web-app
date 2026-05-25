import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export interface UserContext {
  userId: string
  clerkUserId: string
  email: string
  role: string
  organizationId: string | null
  organizationName?: string | null
  status: string
  permissions: string[]
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 403,
    public code: string = 'UNAUTHORIZED'
  ) {
    super(message)
    this.name = 'ApiAuthError'
  }
}

export async function getUserFromRequest(): Promise<UserContext> {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId)
    throw new ApiAuthError('Not authenticated', 401, 'NOT_AUTHENTICATED')

  const clerkUser = await currentUser()
  if (!clerkUser)
    throw new ApiAuthError(
      'User not found in Clerk',
      401,
      'CLERK_USER_NOT_FOUND'
    )

  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress

  const dbUser = await prisma.users.findFirst({
    where: {
      OR: [{ clerk_user_id: clerkUserId }, { email: primaryEmail }],
    },
    include: { organizations: true },
  })

  if (!dbUser)
    throw new ApiAuthError(
      'User not found in database',
      404,
      'DB_USER_NOT_FOUND'
    )

  return {
    userId: dbUser.id,
    clerkUserId: dbUser.clerk_user_id,
    email: dbUser.email,
    role: dbUser.role,
    organizationId: dbUser.organization_id,
    organizationName: dbUser.organizations?.name,
    status: dbUser.status,
    permissions: getPermissionsForRole(dbUser.role),
  }
}

export function requireRole(ctx: UserContext, roles: string[]): void {
  if (!roles.includes(ctx.role))
    throw new ApiAuthError(
      `Required roles: ${roles.join(', ')}`,
      403,
      'INSUFFICIENT_ROLE'
    )
}

export function requireOrganization(ctx: UserContext): void {
  if (ctx.status === 'PENDING_ASSIGNMENT' || !ctx.organizationId)
    throw new ApiAuthError(
      'Must be assigned to an organization',
      403,
      'NO_ORGANIZATION'
    )
}

export function getOrganizationFilter(
  ctx: UserContext
): { organization_id?: string } {
  if (ctx.role === 'SUPER_ADMIN') return {}
  if (!ctx.organizationId)
    throw new ApiAuthError(
      'Not assigned to organization',
      403,
      'NO_ORGANIZATION'
    )
  return { organization_id: ctx.organizationId }
}

export function validateResourceAccess(
  ctx: UserContext,
  resourceOrgId: string | null
): void {
  if (ctx.role === 'SUPER_ADMIN') return
  if (resourceOrgId !== ctx.organizationId)
    throw new ApiAuthError(
      'Resource not in your organization',
      403,
      'CROSS_ORG_ACCESS_DENIED'
    )
}

/**
 * Build a Prisma `plant_id` filter fragment scoped to what `ctx` may see.
 *
 * SUPER_ADMIN: an optional single-plant filter, otherwise unrestricted (`{}`).
 * Everyone else: ALWAYS constrained to `assignedPlantIds`. An empty list yields
 * `{ plant_id: { in: [] } }`, which matches NOTHING — so a non-admin with no
 * assignments can never fall open to other tenants' rows. (`plantId`, when
 * given for a non-admin, must already have been validated against
 * `assignedPlantIds` by the caller, which 404s otherwise.)
 *
 * Spread the result into a Prisma `where`. This is the single source of truth
 * for plant-scoping on list/aggregate endpoints — do not hand-roll the
 * `plantIds.length > 0 ? {...} : {}` pattern, which falls open when empty.
 */
export function plantScopeWhere(
  ctx: { role: string },
  assignedPlantIds: string[],
  plantId?: string | null
): { plant_id?: string | { in: string[] } } {
  if (ctx.role === 'SUPER_ADMIN') {
    return plantId ? { plant_id: plantId } : {}
  }
  return { plant_id: plantId ? plantId : { in: assignedPlantIds } }
}

export function createErrorResponse(error: ApiAuthError) {
  return new Response(
    JSON.stringify({
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
    }),
    {
      status: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
    }
  )
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
