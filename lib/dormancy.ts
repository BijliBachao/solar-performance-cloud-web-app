// Single source of truth for "is this user/org active?" thresholds.
// Both /admin/users and /admin/organizations import from here so the
// definitions stay in sync. Tweak these constants to retune the
// dormancy bands product-wide.

const DAY_MS = 86_400_000

export const DORMANCY_ACTIVE_DAYS = 7   // < 7 days  → active
export const DORMANCY_IDLE_DAYS   = 14  // < 14 days → idle, else dormant

export type DormancyBucket = 'active' | 'idle' | 'dormant' | 'never'

export function dormancyBucket(
  loginCount: number,
  lastActiveAt: string | null,
): DormancyBucket {
  if (loginCount === 0 || !lastActiveAt) return 'never'
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / DAY_MS
  if (days < DORMANCY_ACTIVE_DAYS) return 'active'
  if (days < DORMANCY_IDLE_DAYS)   return 'idle'
  return 'dormant'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recovery buckets — for the client re-engagement worklist (/admin/recovery)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Distinct from dormancyBucket above: solar clients check weekly/monthly,
// not daily, so the recovery thresholds are intentionally LENIENT. These
// drive the "who do we call to win back" list, not the general activity badge.

/** ≤ this many days since last activity → Active (leave alone) */
export const RECOVERY_ACTIVE_DAYS = 14
/** ≤ this → Cooling (watch) */
export const RECOVERY_COOLING_DAYS = 45
/** ≤ this → At risk (reach out). Beyond this → Lost (re-engage urgently) */
export const RECOVERY_AT_RISK_DAYS = 90

export type RecoveryBucket = 'active' | 'cooling' | 'at_risk' | 'lost' | 'never'

/** Order for sorting a worklist — most urgent first. */
export const RECOVERY_PRIORITY: Record<RecoveryBucket, number> = {
  lost: 0,
  at_risk: 1,
  never: 2,
  cooling: 3,
  active: 4,
}

export function recoveryBucket(
  loginCount: number,
  lastActiveAt: string | null,
): RecoveryBucket {
  if (loginCount === 0 || !lastActiveAt) return 'never'
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / DAY_MS
  if (days <= RECOVERY_ACTIVE_DAYS) return 'active'
  if (days <= RECOVERY_COOLING_DAYS) return 'cooling'
  if (days <= RECOVERY_AT_RISK_DAYS) return 'at_risk'
  return 'lost'
}

/** Whole-days since last activity (null → null). For display. */
export function daysSinceActive(lastActiveAt: string | null): number | null {
  if (!lastActiveAt) return null
  const ms = Date.now() - new Date(lastActiveAt).getTime()
  if (ms < 0 || isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}

export function formatRelative(d: string | null): string {
  if (!d) return 'never'
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 0 || isNaN(ms)) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  return `${mo}mo ago`
}
