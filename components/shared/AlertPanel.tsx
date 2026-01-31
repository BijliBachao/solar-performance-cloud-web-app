'use client'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'
import { AlertTriangle, Info, XCircle, CheckCircle, Clock, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Alert {
  id: number
  severity: string
  message: string
  device_name?: string
  string_number: number
  created_at: string
  gap_percent?: number | null
}

interface AlertPanelProps {
  alerts: Alert[]
  onResolve?: (id: number) => void
}

const severityConfig: Record<
  string,
  { icon: any; color: string; border: string; bg: string; badge: string; label: string }
> = {
  CRITICAL: {
    icon: XCircle,
    color: 'text-red-600',
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    label: 'CRITICAL',
  },
  WARNING: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50',
    badge: 'bg-amber-100 text-amber-700',
    label: 'WARNING',
  },
  INFO: {
    icon: Info,
    color: 'text-blue-600',
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    label: 'INFO',
  },
}

function formatDuration(createdAt: string): string {
  const now = new Date()
  const start = new Date(createdAt)
  const mins = differenceInMinutes(now, start)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  const hrs = differenceInHours(now, start)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  const days = differenceInDays(now, start)
  return `${days}d ${hrs % 24}h`
}

function formatStartTime(createdAt: string): string {
  const start = new Date(createdAt)
  const now = new Date()
  const days = differenceInDays(now, start)

  if (days === 0) return `Today at ${format(start, 'h:mm a')}`
  if (days === 1) return `Yesterday at ${format(start, 'h:mm a')}`
  return format(start, 'MMM d, h:mm a')
}

export function AlertPanel({ alerts, onResolve }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-400" />
        <p className="text-sm">No active alerts</p>
      </div>
    )
  }

  // Sort by severity (CRITICAL first) then by most recent
  const sorted = [...alerts].sort((a, b) => {
    const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
    const sevDiff = (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="space-y-2">
      {sorted.map((alert) => {
        const config = severityConfig[alert.severity] || severityConfig.INFO
        const Icon = config.icon
        const duration = formatDuration(alert.created_at)
        const startTime = formatStartTime(alert.created_at)

        return (
          <div
            key={alert.id}
            className={cn(
              'border-l-4 rounded-r-lg p-3',
              config.border,
              config.bg
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.color)} />
                <div className="min-w-0">
                  {/* Top line: severity + string + gap */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', config.badge)}>
                      {config.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      PV{alert.string_number}
                    </span>
                    {alert.gap_percent != null && (
                      <span className="text-xs text-gray-500">
                        {Number(alert.gap_percent).toFixed(1)}% below avg
                      </span>
                    )}
                  </div>

                  {/* Timeline info */}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {startTime}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-gray-700">
                      <Clock className="w-3 h-3" />
                      Active for {duration}
                    </span>
                  </div>
                </div>
              </div>

              {onResolve && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResolve(alert.id)}
                  className="text-xs flex-shrink-0 h-7"
                >
                  Resolve
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
