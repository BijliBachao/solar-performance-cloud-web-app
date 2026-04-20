import { cn } from '@/lib/utils'
import { STATUS_STYLES, type StatusKey } from '@/lib/design-tokens'

const statusToKey: Record<string, StatusKey> = {
  NORMAL: 'healthy',
  OK: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  OPEN_CIRCUIT: 'open-circuit',
  DISCONNECTED: 'offline',
  OFFLINE: 'offline',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = statusToKey[status] ?? 'offline'
  const s = STATUS_STYLES[key]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        s.bg,
        s.fg,
        s.border,
      )}
    >
      {s.label}
    </span>
  )
}
