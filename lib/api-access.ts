import { prisma } from '@/lib/prisma'
import { ApiAuthError } from '@/lib/api-auth'
import type { UserContext } from '@/lib/api-auth'

// ─── Resource Access Helpers ──────────────────────────────────────────
//
// These functions enforce org-level access control for shared routes
// that serve both SUPER_ADMIN and ORG_USER.
//
// Security principles:
// - SUPER_ADMIN bypasses all checks (sees everything)
// - ORG_USER must have plant_assignments for the resource
// - Returns 404 (not 403) to prevent information leakage
// - Same function used everywhere → consistent security boundary

/**
 * Verify user has access to a specific plant.
 * SUPER_ADMIN: always passes.
 * ORG_USER: must have plant_assignments for this plant.
 * Throws 404 ApiAuthError if denied (no info leakage).
 */
export async function requirePlantAccess(
  userContext: UserContext,
  plantId: string
): Promise<void> {
  if (userContext.role === 'SUPER_ADMIN') return

  if (!userContext.organizationId) {
    throw new ApiAuthError('Not found', 404, 'NOT_FOUND')
  }

  const assignment = await prisma.plant_assignments.findFirst({
    where: {
      plant_id: plantId,
      organization_id: userContext.organizationId,
    },
  })

  if (!assignment) {
    throw new ApiAuthError('Not found', 404, 'NOT_FOUND')
  }
}

/**
 * Get allowed plant IDs for the user.
 * SUPER_ADMIN: returns null (meaning "all plants").
 * ORG_USER: returns array of assigned plant IDs.
 */
export async function getAllowedPlantIds(
  userContext: UserContext
): Promise<string[] | null> {
  if (userContext.role === 'SUPER_ADMIN') return null

  if (!userContext.organizationId) return []

  const assignments = await prisma.plant_assignments.findMany({
    where: { organization_id: userContext.organizationId },
    select: { plant_id: true },
  })

  return assignments.map((a) => a.plant_id)
}

/**
 * Verify user has access to a specific alert (via its plant).
 * SUPER_ADMIN: always passes.
 * ORG_USER: must have plant_assignments for the alert's plant.
 * Throws 404 if denied.
 */
export async function requireAlertAccess(
  userContext: UserContext,
  alertPlantId: string
): Promise<void> {
  return requirePlantAccess(userContext, alertPlantId)
}
