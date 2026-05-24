import { NextResponse } from 'next/server'
import {
  getUserFromRequest,
  requireRole,
  createErrorResponse,
  ApiAuthError,
} from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { serverError } from '@/lib/api-errors'
import {
  recoveryBucket,
  daysSinceActive,
  RECOVERY_PRIORITY,
  type RecoveryBucket,
} from '@/lib/dormancy'

/**
 * GET /api/admin/recovery
 *
 * Client re-engagement worklist. Lists organizations (= clients) by their
 * activity recency, sorted most-urgent-first, so the team knows who to
 * contact before they churn.
 *
 * SUPER_ADMIN only. Super-admins have organization_id = NULL so they never
 * appear here — this is purely about client (org-user) engagement, fully
 * independent of super-admin demo activity.
 */

interface RecoveryUser {
  email: string
  name: string | null
  lastActiveAt: string | null
  daysSince: number | null
  loginCount: number
  bucket: RecoveryBucket
}

interface RecoveryClient {
  orgId: string
  orgName: string
  status: string
  email: string | null
  phone: string | null
  userCount: number
  totalLogins: number
  lastActiveAt: string | null
  daysSince: number | null
  bucket: RecoveryBucket
  users: RecoveryUser[]
}

export async function GET() {
  try {
    const userContext = await getUserFromRequest()
    requireRole(userContext, ['SUPER_ADMIN'])

    // Every org + its (org) users' activity. Only org-scoped users count —
    // super-admins (organization_id = null) are excluded by the relation.
    const orgs = await prisma.organizations.findMany({
      include: {
        users: {
          select: {
            email: true,
            first_name: true,
            last_name: true,
            last_active_at: true,
            login_count: true,
          },
        },
      },
    })

    const clients: RecoveryClient[] = orgs.map((o) => {
      const users: RecoveryUser[] = o.users.map((u) => {
        const lastActive = u.last_active_at ? u.last_active_at.toISOString() : null
        return {
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
          lastActiveAt: lastActive,
          daysSince: daysSinceActive(lastActive),
          loginCount: u.login_count,
          bucket: recoveryBucket(u.login_count, lastActive),
        }
      })

      // Org-level rollup: most-recent activity across all its users + total logins
      const totalLogins = users.reduce((s, u) => s + u.loginCount, 0)
      const lastActiveMs = users
        .map((u) => (u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0))
        .reduce((max, t) => Math.max(max, t), 0)
      const orgLastActive = lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null

      // Sort users within the org most-recent-first
      users.sort((a, b) => {
        const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
        const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
        return tb - ta
      })

      return {
        orgId: o.id,
        orgName: o.name,
        status: o.status,
        email: o.email,
        phone: o.phone,
        userCount: users.length,
        totalLogins,
        lastActiveAt: orgLastActive,
        daysSince: daysSinceActive(orgLastActive),
        bucket: recoveryBucket(totalLogins, orgLastActive),
        users,
      }
    })

    // Worklist order: most urgent first (lost → at_risk → never → cooling → active),
    // and within a bucket, the longest-dormant first.
    clients.sort((a, b) => {
      const pa = RECOVERY_PRIORITY[a.bucket]
      const pb = RECOVERY_PRIORITY[b.bucket]
      if (pa !== pb) return pa - pb
      return (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity)
    })

    const summary: Record<RecoveryBucket, number> = {
      lost: 0, at_risk: 0, never: 0, cooling: 0, active: 0,
    }
    for (const c of clients) summary[c.bucket]++

    // The actionable subset — clients that need a follow-up
    const needsAttention = clients.filter(
      (c) => c.bucket === 'lost' || c.bucket === 'at_risk' || c.bucket === 'never',
    ).length

    return NextResponse.json({
      clients,
      summary,
      needsAttention,
      thresholds: {
        activeDays: 14,
        coolingDays: 45,
        atRiskDays: 90,
      },
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    return serverError('Admin Recovery GET', error)
  }
}
