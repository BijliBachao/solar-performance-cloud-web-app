'use client'

import { cn } from '@/lib/utils'
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'
import { AlertTriangle, Info, XCircle, CheckCircle, Check } from 'lucide-react'
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

// 'peer-excluded' entries are unreachable in practice — peer-excluded strings
// never produce alert rows. Included for type-completeness only.
const ICONS_BY_KEY: Record<StatusKey, any> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  healthy: CheckCircle,
  offline: Info,
  'open-circuit': XCircle,
  'peer-excluded': Info,
}

const LEFT_BORDER_BY_KEY: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-rose-600',
  'peer-excluded': 'border-l-indigo-600',
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

/**
 * Dense list of active alerts. Each row is ~52px: icon · severity pill ·
 * device → string · gap · inline time + duration, plus compact icon-only
 * resolve button. Alert message sits as a second line when present.
 */
export function AlertPanel({ alerts, onResolve }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 bg-emerald-50/40 rounded-sm border border-emerald-100">
        <CheckCircle className="h-5 w-5 mx-auto mb-1.5 text-emerald-500" strokeWidth={2} />
        <p className="text-xs font-bold text-emerald-700">No active alerts</p>
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
        const key = statusKeyFromSeverity(alert.severity)
        const style = STATUS_STYLES[key]
        const Icon = ICONS_BY_KEY[key]
        const leftBorder = LEFT_BORDER_BY_KEY[key]

        return (
          <div
            key={alert.id}
            className={cn(
              'bg-white rounded-sm border border-slate-200 border-l-[3px] px-3 py-2',
              leftBorder,
              'hover:bg-slate-50 transition-colors',
            )}
          >
            {/* Row 1 — everything on one line */}
            <div className="flex items-center gap-2 min-w-0">
              <Icon className={cn('w-3.5 h-3.5 shrink-0', style.fg)} strokeWidth={2} />
              <span
                className={cn(
                  'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0',
                  style.bg,
                  style.fg,
                )}
              >
                {alert.severity}
              </span>
              <span className="text-[12px] font-bold text-slate-900 shrink-0">
                {alert.device_name ? `${alert.device_name} → ` : ''}PV{alert.string_number}
              </span>
              {alert.gap_percent != null && (
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  {Number(alert.gap_percent).toFixed(1)}% below avg
                </span>
              )}
              <span className="text-[10px] text-slate-400 ml-auto shrink-0 font-mono">
                {formatStartTime(alert.created_at)}
              </span>
              <span className="text-[10px] font-bold font-mono text-slate-600 shrink-0">
                {formatDuration(alert.created_at)}
              </span>
              {onResolve && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onResolve(alert.id)
                  }}
                  title="Resolve alert"
                  className="shrink-0 flex items-center justify-center w-5 h-5 rounded-sm border border-solar-gold/40 text-solar-gold-700 hover:bg-solar-gold hover:text-white hover:border-solar-gold transition-colors"
                >
                  <Check className="w-3 h-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
            {/* Row 2 — optional alert message */}
            {alert.message && (
              <p className="text-[11px] text-slate-500 mt-0.5 ml-[1.5rem] truncate">
                {alert.message}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
