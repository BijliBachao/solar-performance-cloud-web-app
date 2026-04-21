'use client'

import { cn } from '@/lib/utils'
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'
import { AlertTriangle, Info, XCircle, CheckCircle } from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromSeverity,
  type StatusKey,
} from '@/lib/design-tokens'

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

/**
 * Per-severity icon + left-border-accent color class.
 * The left-border color maps to the vivid dot variant of the status so the
 * accent reads as "this item is critical" at a glance without repeating the
 * background wash color.
 */
const ICONS_BY_KEY: Record<StatusKey, any> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  healthy: CheckCircle,
  offline: Info,
  'open-circuit': XCircle,
}

const LEFT_BORDER_BY_KEY: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-violet-600',
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
        <CheckCircle className="h-6 w-6 mx-auto mb-2 text-slate-300" strokeWidth={2} />
        <p className="text-xs font-bold text-slate-500">No active alerts</p>
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
        const key = statusKeyFromSeverity(alert.severity)
        const style = STATUS_STYLES[key]
        const Icon = ICONS_BY_KEY[key]
        const leftBorder = LEFT_BORDER_BY_KEY[key]

        return (
          <div
            key={alert.id}
            className={cn(
              'bg-white rounded-sm border border-slate-200 border-l-[3px] px-4 py-3',
              leftBorder,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', style.fg)} strokeWidth={2} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm',
                        style.bg,
                        style.fg,
                      )}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {alert.device_name ? `${alert.device_name} → ` : ''}PV{alert.string_number}
                    </span>
                    {alert.gap_percent != null && (
                      <span className="text-[10px] font-mono text-slate-500">
                        {Number(alert.gap_percent).toFixed(1)}% below avg
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                    <span>{formatStartTime(alert.created_at)}</span>
                    <span className="font-bold text-slate-600">{formatDuration(alert.created_at)}</span>
                  </div>
                </div>
              </div>

              {onResolve && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onResolve(alert.id)
                  }}
                  className="shrink-0 text-[10px] font-bold text-solar-gold-700 border-2 border-solar-gold rounded-sm px-2 py-1 hover:bg-solar-gold hover:text-white transition-colors uppercase tracking-wider"
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
