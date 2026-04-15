import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  NORMAL: { bg: 'bg-green-100', text: 'text-green-700', label: 'Normal' },
  OK: { bg: 'bg-green-100', text: 'text-green-700', label: 'Normal' },
  WARNING: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Warning' },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', label: 'Critical' },
  OPEN_CIRCUIT: { bg: 'bg-red-200', text: 'text-red-900', label: 'Open Circuit' },
  DISCONNECTED: { bg: 'bg-gray-200', text: 'text-gray-800', label: 'Disconnected' },
  OFFLINE: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Offline' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.DISCONNECTED
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        config.bg,
        config.text
      )}
    >
      {config.label}
    </span>
  )
}
