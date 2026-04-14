'use client'
import { cn } from '@/lib/utils'
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'
import { AlertTriangle, Info, XCircle, CheckCircle, Clock, Calendar } from 'lucide-react'

interface Alert {
  id: number
  severity: string
  message: string
  plant_id?: string
  device_id?: string
  device_name?: string
  string_number: number
  created_at: string
  gap_percent?: number | null
}

interface AlertPanelProps {
  alerts: Alert[]
  onResolve?: (id: number) => void
}

const severityConfig: Record<string, { icon: any; accent: string; badge: string; label: string }> = {
  CRITICAL: {
    icon: XCircle,
    accent: 'border-l-[#e52020]',
    badge: 'text-[#e52020]',
    label: 'CRITICAL',
  },
  WARNING: {
    icon: AlertTriangle,
    accent: 'border-l-[#ef9100]',
    badge: 'text-[#ef9100]',
    label: 'WARNING',
  },
  INFO: {
    icon: Info,
    accent: 'border-l-[#0046a4]',
    badge: 'text-[#5e9ed6]',
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
  if (days === 0) return `Today ${format(start, 'h:mm a')}`
  if (days === 1) return `Yesterday ${format(start, 'h:mm a')}`
  return format(start, 'MMM d, h:mm a')
}

export function AlertPanel({ alerts, onResolve }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-10">
        <CheckCircle className="h-6 w-6 mx-auto mb-2 text-[#333]" />
        <p className="text-xs font-bold text-[#5e5e5e]">No active alerts</p>
      </div>
    )
  }

  const sorted = [...alerts].sort((a, b) => {
    const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
    const sevDiff = (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="space-y-1">
      {sorted.map((alert) => {
        const config = severityConfig[alert.severity] || severityConfig.INFO
        const Icon = config.icon

        return (
          <div
            key={alert.id}
            className={cn(
              'border-l-[3px] bg-[#252525] rounded-sm px-4 py-3',
              config.accent
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest', config.badge)}>
                    {config.label}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {alert.device_name ? `${alert.device_name} → ` : ''}PV{alert.string_number}
                  </span>
                  {alert.gap_percent != null && (
                    <span className="text-[10px] font-mono text-[#898989]">
                      {Number(alert.gap_percent).toFixed(1)}% below avg
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#5e5e5e]">
                  <span>{formatStartTime(alert.created_at)}</span>
                  <span className="font-bold text-[#898989]">{formatDuration(alert.created_at)}</span>
                </div>
              </div>

              {onResolve && (
                <button
                  onClick={(e) => { e.stopPropagation(); onResolve(alert.id) }}
                  className="flex-shrink-0 text-[10px] font-bold text-[#76b900] border border-[#76b900] rounded-sm px-2 py-1 hover:bg-[#76b900] hover:text-black transition-colors uppercase tracking-wider"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
