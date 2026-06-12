'use client'

/**
 * AlertsFeed — a presentational, reusable notification feed.
 *
 * Renders ONE merged stream of system alerts (our computed string health) and
 * vendor alarms (the inverter's own faults) as a clean, generously-spaced
 * notifications list. THE RULE: every row is completely understandable in plain
 * language while reading — WHAT happened (a human sentence, never a bare code),
 * WHERE (org / plant / inverter), HOW SEVERE, WHICH BRAND (provider logo), and
 * WHEN. Each row:
 *   [brand-logo avatar w/ severity ring] · [human title + breadcrumb + chips + evidence] · [time]
 *
 * Pure presentation — no fetching. The owning page fetches + filters and passes
 * `items` in. BOTH admin and customer surfaces reuse this ONE component:
 *   - admin shows the org segment of the breadcrumb (organization_name set)
 *   - customer omits it (organization_name null)
 *
 * Vendor-agnostic: the provider logo is `/logos/{provider}.jpg` for the 5 known
 * brands; an unknown provider (or a load error) falls back to a lucide glyph.
 */

import { useState } from 'react'
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
  alarm_code: string | null
  count: number
  device_names: string[]
  started_at: string
  resolved_at: string | null
}

interface AlertsFeedProps {
  items: FeedItem[]
  loading?: boolean
  onRowClick?: (item: FeedItem) => void
}

// The 5 brands that ship a logo in /public/logos. A provider outside this set
// (or a logo that fails to load) falls back to a lucide glyph — no brand name
// is hardcoded into copy, so a future vendor renders sensibly either way.
const LOGO_PROVIDERS = new Set(['growatt', 'solis', 'huawei', 'sungrow', 'csi'])

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

// Severity-coloured ring on the avatar — same token family as the dot, applied
// as a ring so the brand logo stays legible inside.
const SEVERITY_RING: Record<StatusKey, string> = {
  critical: 'ring-red-500',
  warning: 'ring-amber-500',
  info: 'ring-slate-400',
  healthy: 'ring-emerald-500',
  offline: 'ring-slate-400',
  'open-circuit': 'ring-rose-500',
  'peer-excluded': 'ring-indigo-500',
  frozen: 'ring-orange-500',
  idle: 'ring-slate-300',
}

// Kind → label + fallback glyph (used only when there is no brand logo).
// System = our computed checks; Vendor = the inverter's own faults.
const KIND_META: Record<FeedItem['kind'], { label: string; icon: typeof Cpu; chip: string }> = {
  system: { label: 'System', icon: Activity, chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  vendor: { label: 'Vendor', icon: Cpu, chip: 'bg-amber-50 text-amber-700 border-amber-200' },
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

/** Brand-logo avatar (white rounded box, severity ring) with a lucide glyph
 *  fallback for unknown providers or a failed image load. The logo JPGs carry
 *  their own backgrounds, so they sit in a white box with object-contain. */
function FeedAvatar({ item, ringClass }: { item: FeedItem; ringClass: string }) {
  const [imgError, setImgError] = useState(false)
  const provider = item.provider.toLowerCase()
  const showLogo = LOGO_PROVIDERS.has(provider) && !imgError
  const FallbackIcon = KIND_META[item.kind].icon

  return (
    <span
      className={cn(
        'shrink-0 flex items-center justify-center w-9 h-9 rounded-full overflow-hidden',
        'bg-white border border-slate-200 ring-2 ring-offset-1 ring-offset-white',
        ringClass,
      )}
      aria-hidden="true"
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/logos/${provider}.jpg`}
          alt=""
          className="w-full h-full object-contain p-0.5"
          onError={() => setImgError(true)}
        />
      ) : (
        <FallbackIcon className="w-4 h-4 text-slate-500" strokeWidth={2} />
      )}
    </span>
  )
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

function FeedRow({ item, onRowClick }: { item: FeedItem; onRowClick?: (i: FeedItem) => void }) {
  const key = statusKeyFromSeverity(item.severity)
  const style = STATUS_STYLES[key]
  const kindMeta = KIND_META[item.kind]
  const resolved = item.resolved_at !== null
  const grouped = item.count > 1

  // Breadcrumb WHERE: [org · ] plant › device-or-N-inverters [› String N].
  const orgPrefix = item.organization_name ? `${item.organization_name} · ` : ''
  const devicePart = grouped ? `${item.count} inverters` : item.device_name
  let breadcrumb = `${orgPrefix}${item.plant_name} › ${devicePart}`
  if (item.kind === 'system' && item.string_number != null) {
    breadcrumb += ` › String ${item.string_number}`
  }

  return (
    <button
      type="button"
      onClick={() => onRowClick?.(item)}
      className={cn(
        'w-full text-left flex items-start gap-3 bg-white border-b border-slate-100 border-l-[3px] px-3.5 py-3 transition-colors',
        SEVERITY_BORDER[key],
        'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-solar-gold/40',
        resolved && 'opacity-60',
      )}
    >
      <FeedAvatar item={item} ringClass={SEVERITY_RING[key]} />

      <div className="min-w-0 flex-1">
        {/* Line 1: bold human title + right-aligned relative time */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-bold text-slate-900 line-clamp-1">{item.title}</span>
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

        {/* Line 2: WHERE breadcrumb (muted, clipped at a line boundary) */}
        <p
          className="text-[11px] text-slate-500 line-clamp-1 mt-0.5"
          title={grouped ? item.device_names.join(', ') : undefined}
        >
          {breadcrumb}
        </p>

        {/* Chips: kind · severity · ×count · code — all plain-language */}
        <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
          <Chip className={kindMeta.chip}>{kindMeta.label}</Chip>
          <Chip className={cn(style.bg, style.fg, style.border)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
            {style.label}
          </Chip>
          {grouped && (
            <Chip className="bg-slate-100 text-slate-700 border-slate-300">×{item.count}</Chip>
          )}
          {item.alarm_code && (
            <Chip className="bg-slate-50 text-slate-500 border-slate-200 normal-case tracking-normal font-mono">
              code {item.alarm_code}
            </Chip>
          )}
        </div>

        {/* Line 3 (optional): supplementary evidence/advice, clipped cleanly */}
        {item.detail && (
          <p className="text-[10.5px] text-slate-400 line-clamp-1 mt-1.5">{item.detail}</p>
        )}
      </div>
    </button>
  )
}

function SkeletonFeed() {
  return (
    <div className="animate-pulse divide-y divide-slate-100 border-y border-slate-100" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[78px] bg-slate-50" />
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
