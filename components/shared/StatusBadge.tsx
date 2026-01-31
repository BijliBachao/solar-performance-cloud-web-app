import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'DISCONNECTED' | 'OFFLINE'
}

const statusConfig = {
  OK: { bg: 'bg-green-100', text: 'text-green-700', label: 'OK' },
  WARNING: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Warning' },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', label: 'Critical' },
  DISCONNECTED: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Disconnected' },
  OFFLINE: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Offline' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
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
