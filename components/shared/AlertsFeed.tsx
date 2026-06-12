'use client'

/**
 * AlertsFeed — a presentational, reusable notification feed.
 *
 * Renders ONE merged stream of system alerts (our computed string health) and
 * vendor alarms (the inverter's own faults) as a clean notifications-screen
 * list. Each row:
 *   [severity-tinted round avatar w/ kind glyph] · [bold title + breadcrumb·detail] · [relative time]
 *
 * Pure presentation — no fetching. The owning page fetches + filters and passes
 * `items` in. BOTH admin and customer surfaces reuse this ONE component:
 *   - admin shows the org segment of the breadcrumb (organization_name set)
 *   - customer omits it (organization_name null)
 *
 * Vendor-agnostic: the provider is shown verbatim (capitalized) in the chip —
 * no provider name is hardcoded, so new vendors slot in with zero changes.
 */

import { cn } from '@/lib/utils'
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns'
import { Cpu, Activity, CheckCircle } from 'lucide-react'
import { STATUS_STYLES, statusKeyFromSeverity, type StatusKey } from '@/lib/design-tokens'

// One unified row, normalized by buildAlertsFeed (lib/alerts-feed.ts).
export interface FeedItem {
  id: string
  kind: 'system' | 'vendor'
  provider: string
  organization_id: string | null
  organization_name: string | null
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  string_number: number | null
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

// Left-accent border per severity — the severity colour accent on each row,
// kept for at-a-glance triage scannability.
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

// Kind → glyph + label. System = our computed checks; Vendor = the inverter's
// own faults. (Colour comes from severity, not kind — kind is just the glyph.)
const KIND_META: Record<FeedItem['kind'], { label: string; icon: typeof Cpu }> = {
  system: { label: 'System', icon: Activity },
  vendor: { label: 'Vendor', icon: Cpu },
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

/** Provider code → capitalized label for the chip. Generic — no hardcoded
 *  vendor list, so any future provider string renders sensibly. */
function providerChipLabel(provider: string): string {
  if (!provider) return '—'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

function FeedRow({ item, onRowClick }: { item: FeedItem; onRowClick?: (i: FeedItem) => void }) {
  const key = statusKeyFromSeverity(item.severity)
  const style = STATUS_STYLES[key]
  const kind = KIND_META[item.kind]
  const KindIcon = kind.icon
  const resolved = item.resolved_at !== null

  // Breadcrumb: [org ·] plant › device [› String N] — org segment only when set.
  const orgPrefix = item.organization_name ? `${item.organization_name} · ` : ''
  let breadcrumb = `${orgPrefix}${item.plant_name} › ${item.device_name}`
  if (item.string_number != null) breadcrumb += ` › String ${item.string_number}`

  return (
    <button
      type="button"
      onClick={() => onRowClick?.(item)}
      className={cn(
        'w-full text-left flex items-center gap-3 bg-white border-b border-slate-100 border-l-[3px] px-3 py-2.5 transition-colors',
        SEVERITY_BORDER[key],
        'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-solar-gold/40',
        resolved && 'opacity-55',
      )}
    >
      {/* Round avatar, tinted by severity, with the kind glyph inside */}
      <span
        className={cn(
          'shrink-0 flex items-center justify-center w-9 h-9 rounded-full',
          style.bg,
          style.fg,
        )}
        aria-hidden="true"
      >
        <KindIcon className="w-4 h-4" strokeWidth={2} />
      </span>

      {/* Title + breadcrumb·detail */}
      <div className="min-w-0 flex-1">
        {/* Line 1: bold title + right-aligned relative time */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-bold text-slate-900 truncate">{item.title}</span>
          {resolved && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Resolved
            </span>
          )}
          <span
            className="ml-auto shrink-0 text-[10px] font-mono tabular-nums text-slate-400"
            title={new Date(item.started_at).toLocaleString()}
          >
            {relativeTime(item.started_at)}
          </span>
        </div>

        {/* Line 2: breadcrumb — detail, ending with a compact kind·provider chip */}
        <div className="flex items-center gap-2 min-w-0 mt-0.5">
          <p className="text-[11px] text-slate-500 truncate min-w-0">
            <span className="text-slate-600">{breadcrumb}</span>
            {item.detail ? ` — ${item.detail}` : ''}
          </p>
          <span
            className={cn(
              'ml-auto shrink-0 inline-flex items-center border rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
              'bg-slate-50 text-slate-600 border-slate-200',
            )}
          >
            {kind.label}·{providerChipLabel(item.provider)}
          </span>
        </div>
      </div>
    </button>
  )
}

function SkeletonFeed() {
  return (
    <div className="animate-pulse divide-y divide-slate-100 border-y border-slate-100" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[58px] bg-slate-50" />
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
    <div className={cn('border-y border-slate-100 transition-opacity', loading && 'opacity-60')}>
      {items.map((item) => (
        <FeedRow key={item.id} item={item} onRowClick={onRowClick} />
      ))}
    </div>
  )
}
