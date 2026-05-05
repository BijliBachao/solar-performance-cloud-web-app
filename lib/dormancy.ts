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
