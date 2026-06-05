/**
 * Alert utility functions for formatting, grouping, and display
 */

export interface AlertData {
  id: number
  device_id: string
  device_name?: string
  plant_id: string
  string_number: number
  severity: string
  message: string
  expected_value?: number | null
  actual_value?: number | null
  gap_percent?: number | null
  created_at: string
  resolved_at?: string | null
  resolved_by?: string | null
  resolved_by_name?: string | null
}

export type SeverityLevel = 'CRITICAL' | 'WARNING' | 'INFO'

export interface SeverityConfig {
  color: string
  bgColor: string
  borderColor: string
  icon: 'XCircle' | 'AlertTriangle' | 'Info'
  label: string
}

/**
 * Calculate human-readable duration between two dates
 */
export function calculateDuration(start: Date, end?: Date | null): string {
  const endDate = end ? new Date(end) : new Date()
  const startDate = new Date(start)
  const diffMs = endDate.getTime() - startDate.getTime()

  if (diffMs < 0) return '0m'

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/**
 * Get severity configuration for styling
 */
export function getSeverityConfig(severity: string): SeverityConfig {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: 'XCircle',
        label: 'Critical'
      }
    case 'WARNING':
      return {
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: 'AlertTriangle',
        label: 'Warning'
      }
    case 'INFO':
    default:
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: 'Info',
        label: 'Info'
      }
  }
}

// The fleet lives in Pakistan (PKT = UTC+5, no DST). Day grouping and the
// Today/Yesterday headers must share ONE calendar: keying groups by UTC day
// while labeling with browser-local days put any alert from 00:00–05:00 PKT
// under the wrong header (alert-system audit 2026-06-05).
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

/** PKT calendar day (YYYY-MM-DD) for a timestamp. */
function pktDayKey(d: Date): string {
  return new Date(d.getTime() + PKT_OFFSET_MS).toISOString().split('T')[0]
}

/**
 * Group alerts by PKT date (YYYY-MM-DD)
 */
export function groupAlertsByDate(alerts: AlertData[]): Map<string, AlertData[]> {
  const grouped = new Map<string, AlertData[]>()

  for (const alert of alerts) {
    const dateKey = pktDayKey(new Date(alert.created_at))
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(alert)
  }

  // Sort groups by date descending (most recent first)
  const sortedEntries = Array.from(grouped.entries()).sort(
    (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
  )

  return new Map(sortedEntries)
}

/**
 * Format a PKT day key (from groupAlertsByDate) for display headers —
 * compared against today/yesterday in PKT, not browser-local time.
 */
export function formatDateHeader(dateStr: string): string {
  const now = new Date()
  const todayKey = pktDayKey(now)
  const yesterdayKey = pktDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  if (dateStr === todayKey) return 'Today'
  if (dateStr === yesterdayKey) return 'Yesterday'

  // dateStr is date-only → parsed as UTC midnight; format in UTC so the
  // label can never shift a day in browsers behind UTC.
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getUTCFullYear() !== parseInt(todayKey.slice(0, 4)) ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
}

/**
 * Format time for alert display
 */
export function formatAlertTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Sort alerts by severity (CRITICAL first) then by date (newest first)
 */
export function sortAlertsBySeverity(alerts: AlertData[]): AlertData[] {
  const severityOrder: Record<string, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2
  }

  return [...alerts].sort((a, b) => {
    const severityDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    if (severityDiff !== 0) return severityDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
