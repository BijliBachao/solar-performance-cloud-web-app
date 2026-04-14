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
  showPlantName?: boolean
}

const severityConfig: Record<string, { icon: any; border: string; badge: string; label: string }> = {
  CRITICAL: {
    icon: XCircle,
    border: 'border-l-[#e52020]',
    badge: 'bg-red-50 text-[#e52020] border-red-200',
    label: 'CRITICAL',
  },
  WARNING: {
    icon: AlertTriangle,
    border: 'border-l-[#ef9100]',
    badge: 'bg-amber-50 text-[#ef9100] border-amber-200',
    label: 'WARNING',
  },
  INFO: {
    icon: Info,
    border: 'border-l-[#0046a4]',
    badge: 'bg-blue-50 text-[#0046a4] border-blue-200',
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

export function AlertPanel({ alerts, onResolve, showPlantName = true }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-10 w-10 mx-auto mb-2 text-[#e5e5e5]" />
        <p className="text-sm font-bold text-[#525252]">No active alerts</p>
        <p className="text-xs text-[#898989] mt-1">All systems operating normally.</p>
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
    <div className="space-y-1.5">
      {sorted.map((alert) => {
        const config = severityConfig[alert.severity] || severityConfig.INFO
        const Icon = config.icon

        return (
          <div
            key={alert.id}
            className={cn(
              'border-l-[3px] bg-white border border-[#e5e5e5] border-l-[3px] rounded-sm p-3',
              config.border
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#898989]" />
                <div className="min-w-0">
                  {/* Severity + Device + String */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border', config.badge)}>
                      {config.label}
                    </span>
                    {alert.device_name && (
                      <span className="text-xs font-semibold text-[#0a0a0a]">
                        {alert.device_name} → PV{alert.string_number}
                      </span>
                    )}
                    {!alert.device_name && (
                      <span className="text-xs font-semibold text-[#0a0a0a]">
                        PV{alert.string_number}
                      </span>
                    )}
                    {alert.gap_percent != null && (
                      <span className="text-[11px] font-mono text-[#898989]">
                        {Number(alert.gap_percent).toFixed(1)}% below avg
                      </span>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#898989]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatStartTime(alert.created_at)}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-[#525252]">
                      <Clock className="w-3 h-3" />
                      Active for {formatDuration(alert.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {onResolve && (
                <button
                  onClick={() => onResolve(alert.id)}
                  className="flex-shrink-0 text-xs font-semibold text-[#76b900] border border-[#76b900] rounded-sm px-2.5 py-1 hover:bg-[#76b900] hover:text-white transition-colors"
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
