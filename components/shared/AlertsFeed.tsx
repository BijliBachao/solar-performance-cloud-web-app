'use client'

/**
 * AlertsFeed — a presentational, reusable notification feed.
 *
 * Renders ONE merged stream of system alerts (our computed string health) and
 * vendor alarms (the inverter's own faults). Each row:
 *   [round source icon] · [title (bold) + one-line detail] · [relative time]
 * plus a source tag chip (System / Vendor) and a severity colour accent.
 *
 * Pure presentation — no fetching. The owning page fetches + filters and passes
 * `items` in. Both admin and customer surfaces can reuse this.
 */

import { cn } from '@/lib/utils'
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns'
import { Cpu, Activity, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { STATUS_STYLES, statusKeyFromSeverity, type StatusKey } from '@/lib/design-tokens'

// One unified row, normalized by /api/admin/alerts-feed.
export interface FeedItem {
  id: string
  kind: 'system' | 'vendor'
  provider: string
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  severity: string
  title: string
  detail: string
  started_at: string
  resolved_at: string | null
}

interface AlertsFeedProps {
  items: FeedItem[]
  loading?: boolean
  onRowClick?: (item: FeedItem) => void
}

// Severity → icon (reuses the same icon vocabulary as AlertPanel).
const SEVERITY_ICON: Record<StatusKey, typeof Info> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  healthy: CheckCircle,
  offline: Info,
  'open-circuit': XCircle,
  'peer-excluded': Info,
  frozen: Info,
  idle: Info,
}

// Left-accent border per severity — the severity colour accent on each row.
const SEVERITY_BORDER: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-slate-400',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-rose-600',
  'peer-excluded': 'border-l-indigo-600',
  frozen: 'border-l-orange-600',
  idle: 'border-l-slate-400',
}

// Source tag chip styling: System (blue) vs Vendor (amber/orange).
const KIND_CHIP: Record<FeedItem['kind'], { label: string; cls: string; icon: typeof Cpu }> = {
  system: { label: 'System', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Activity },
  vendor: { label: 'Vendor', cls: 'bg-orange-50 text-orange-700 border-orange-200', icon: Cpu },
}

function relativeTime(iso: string): string {
  const now = new Date()
  const start = new Date(iso)
  const mins = differenceInMinutes(now, start)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = differenceInHours(now, start)
  if (hrs < 24) return `${hrs}h ago`
  const days = differenceInDays(now, start)
  return `${days}d ago`
}

function FeedRow({ item, onRowClick }: { item: FeedItem; onRowClick?: (i: FeedItem) => void }) {
  const key = statusKeyFromSeverity(item.severity)
  const style = STATUS_STYLES[key]
  const SeverityIcon = SEVERITY_ICON[key]
  const chip = KIND_CHIP[item.kind]
  const KindIcon = chip.icon
  const resolved = item.resolved_at !== null

  return (
    <button
      type="button"
      onClick={() => onRowClick?.(item)}
      className={cn(
        'w-full text-left flex items-center gap-3 bg-white border border-slate-200 border-l-[3px] rounded-sm px-3 py-2.5 transition-colors',
        SEVERITY_BORDER[key],
        'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-solar-gold/40',
        resolved && 'opacity-55',
      )}
    >
      {/* Round source icon, tinted by severity */}
      <span
        className={cn(
          'shrink-0 flex items-center justify-center w-8 h-8 rounded-full',
          style.bg,
          style.fg,
        )}
        aria-hidden="true"
      >
        <KindIcon className="w-4 h-4" strokeWidth={2} />
      </span>

      {/* Title + one-line detail */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <SeverityIcon className={cn('w-3.5 h-3.5 shrink-0', style.fg)} strokeWidth={2} />
          <span className="text-[13px] font-bold text-slate-900 truncate">{item.title}</span>
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1 border rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
              chip.cls,
            )}
          >
            {chip.label}
          </span>
          {resolved && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Resolved
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 truncate mt-0.5">
          <span className="font-semibold text-slate-600">{item.plant_name}</span>
          {item.device_name ? ` · ${item.device_name}` : ''}
          {item.detail ? ` — ${item.detail}` : ''}
        </p>
      </div>

      {/* Relative timestamp */}
      <span
        className="shrink-0 text-[10px] font-mono tabular-nums text-slate-400"
        title={new Date(item.started_at).toLocaleString()}
      >
        {relativeTime(item.started_at)}
      </span>
    </button>
  )
}

function SkeletonFeed() {
  return (
    <div className="space-y-1.5 animate-pulse" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[52px] bg-slate-100 rounded-sm" />
      ))}
    </div>
  )
}

export function AlertsFeed({ items, loading, onRowClick }: AlertsFeedProps) {
  if (loading && items.length === 0) {
    return <SkeletonFeed />
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 bg-emerald-50/40 rounded-sm border border-emerald-100">
        <CheckCircle className="h-6 w-6 mx-auto mb-2 text-emerald-500" strokeWidth={2} />
        <p className="text-sm font-bold text-emerald-700">No notifications</p>
        <p className="text-xs text-slate-500 mt-1">Nothing matches the current filters.</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-1.5 transition-opacity', loading && 'opacity-60')}>
      {items.map((item) => (
        <FeedRow key={item.id} item={item} onRowClick={onRowClick} />
      ))}
    </div>
  )
}
