'use client'

/**
 * StringHealthDonut — enterprise-grade status breakdown donut.
 *
 * Design traced to research in CLIENT-FEEDBACK-2026-04-23.md §Item 4:
 *   · Datadog / Grafana / Splunk / Intergalactic (Semrush) patterns
 *   · 1px segment gaps, hover-grows-segment, legend with tabular numbers
 *   · Scales from 1 to 2000+ strings — small segments still render in
 *     legend with full count even if invisible in the donut
 *   · Accessible: ARIA label, keyboard legend navigation
 *   · Status taxonomy: 5 buckets matching STATUS_STYLES (single source
 *     of truth). No new colours, no new vocabulary.
 *
 * API surface:
 *   <StringHealthDonut
 *     counts={{ healthy: 297, warning: 12, critical: 4, openCircuit: 2, offline: 1 }}
 *     title="String Health"
 *     onStatusClick={(key) => scrollAndFilter(key)}
 *   />
 *
 * State handling (all explicit, no "undefined" renders):
 *   · loading  → skeleton donut + shimmer legend
 *   · empty    → "∅ No strings yet" message
 *   · error    → warning + retry button (parent supplies handler)
 *   · normal   → full donut + legend
 */

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { STATUS_STYLES, type StatusKey } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export interface StringStatusCounts {
  healthy: number
  warning: number
  critical: number
  openCircuit: number
  offline: number
}

type DonutStatusKey = Extract<
  StatusKey,
  'healthy' | 'warning' | 'critical' | 'open-circuit' | 'offline'
>

interface SegmentData {
  key: DonutStatusKey
  value: number
  label: string
  color: string
}

interface StringHealthDonutProps {
  counts: StringStatusCounts | null
  title?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onStatusClick?: (status: DonutStatusKey) => void
  /** Passes through for context — e.g. "Fleet" or "Mall of Multan" */
  subtitle?: string
}

// Hex fallbacks — Recharts needs hex for <Cell fill>. Mirrors STATUS_STYLES.dot
// classes so badges, donut, and legend read as one visual system.
const STATUS_HEX: Record<DonutStatusKey, string> = {
  healthy: '#10B981',       // emerald-500
  warning: '#F59E0B',       // amber-500
  critical: '#EF4444',      // red-500
  'open-circuit': '#F43F5E',// rose-500 (the new "0 A Fault" colour)
  offline: '#94A3B8',       // slate-400
}

function toSegments(counts: StringStatusCounts): SegmentData[] {
  const segments: SegmentData[] = [
    { key: 'healthy', value: counts.healthy, label: STATUS_STYLES.healthy.label, color: STATUS_HEX.healthy },
    { key: 'warning', value: counts.warning, label: STATUS_STYLES.warning.label, color: STATUS_HEX.warning },
    { key: 'critical', value: counts.critical, label: STATUS_STYLES.critical.label, color: STATUS_HEX.critical },
    { key: 'open-circuit', value: counts.openCircuit, label: STATUS_STYLES['open-circuit'].label, color: STATUS_HEX['open-circuit'] },
    { key: 'offline', value: counts.offline, label: STATUS_STYLES.offline.label, color: STATUS_HEX.offline },
  ]
  // Descending sort for display order (largest first clockwise)
  return segments.sort((a, b) => b.value - a.value)
}

// Tooltip content uses recharts' payload interface — types deliberately
// loose because recharts' exposed types are not stable across versions.
// Runtime shape is stable.
function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: SegmentData & { total?: number } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  if (!p) return null
  const total = p.total ?? 1
  const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0'
  return (
    <div
      className="rounded-md border border-slate-200 px-3 py-2 text-xs pointer-events-none"
      style={{
        backgroundColor: '#FFFFFF',
        opacity: 1,
        boxShadow: '0 10px 24px -8px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
        <span className="font-bold text-slate-900">{p.label}</span>
      </div>
      <div className="text-slate-600 font-mono tabular-nums">
        {p.value.toLocaleString()} <span className="text-slate-400">string{p.value === 1 ? '' : 's'}</span> · {pct}%
      </div>
    </div>
  )
}

export function StringHealthDonut({
  counts,
  title = 'String Health',
  subtitle,
  loading = false,
  error = null,
  onRetry,
  onStatusClick,
}: StringHealthDonutProps) {
  const [hoverKey, setHoverKey] = useState<DonutStatusKey | null>(null)

  const { segments, total, healthyPct, attentionCount } = useMemo(() => {
    if (!counts) return { segments: [], total: 0, healthyPct: 0, attentionCount: 0 }
    const segs = toSegments(counts)
    const t = segs.reduce((sum, s) => sum + s.value, 0)
    const h = t > 0 ? Math.round((counts.healthy / t) * 1000) / 10 : 0
    const attn = counts.warning + counts.critical + counts.openCircuit + counts.offline
    return { segments: segs, total: t, healthyPct: h, attentionCount: attn }
  }, [counts])

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <CardShell title={title} subtitle={subtitle}>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-3" strokeWidth={2} />
          <p className="text-sm font-bold text-slate-900 mb-1">Unable to load</p>
          <p className="text-xs text-slate-500 mb-4 max-w-xs">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      </CardShell>
    )
  }

  // ── Loading state ─────────────────────────────────────────────
  if (loading || !counts) {
    return (
      <CardShell title={title} subtitle={subtitle}>
        <SkeletonBody />
      </CardShell>
    )
  }

  // ── Empty state ───────────────────────────────────────────────
  if (total === 0) {
    return (
      <CardShell title={title} subtitle={subtitle}>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center mb-3">
            <span className="text-2xl text-slate-300">∅</span>
          </div>
          <p className="text-sm font-bold text-slate-700 mb-1">No strings monitored yet</p>
          <p className="text-xs text-slate-500 max-w-xs">Data will appear here once the poller syncs from your inverter provider.</p>
        </div>
      </CardShell>
    )
  }

  // ── Normal render ─────────────────────────────────────────────
  // Enrich each segment with total so tooltip can compute percent.
  const chartData = segments.map((s) => ({ ...s, total }))

  return (
    <CardShell title={title} subtitle={subtitle}>
      <div
        className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_1fr] gap-4 sm:gap-6 items-center"
        role="img"
        aria-label={
          `String health: ${counts.healthy} healthy, ${counts.warning} underperforming, ` +
          `${counts.critical} major loss, ${counts.openCircuit} zero-amp fault, ${counts.offline} offline.`
        }
      >
        {/* Donut + centre metric */}
        <div className="relative w-[180px] h-[180px] mx-auto sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={86}
                paddingAngle={1}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={true}
                animationDuration={500}
                onMouseEnter={(_, idx) => setHoverKey(segments[idx]?.key ?? null)}
                onMouseLeave={() => setHoverKey(null)}
                onClick={(data) => {
                  const k = (data as { payload?: { key?: DonutStatusKey } })?.payload?.key
                  if (k && onStatusClick) onStatusClick(k)
                }}
                stroke="#FFFFFF"
                strokeWidth={1}
              >
                {chartData.map((s) => (
                  <Cell
                    key={s.key}
                    fill={s.color}
                    opacity={hoverKey && hoverKey !== s.key ? 0.4 : 1}
                    style={{ cursor: onStatusClick ? 'pointer' : 'default', transition: 'opacity 150ms' }}
                  />
                ))}
              </Pie>
              <Tooltip
                content={<DonutTooltip />}
                cursor={false}
                wrapperStyle={{ zIndex: 50, outline: 'none', opacity: 1 }}
                allowEscapeViewBox={{ x: true, y: true }}
                isAnimationActive={false}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre metric — placed absolutely inside the donut hole */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[28px] font-bold font-mono tabular-nums text-slate-900 leading-none">
              {total.toLocaleString()}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
              strings
            </span>
            <span className="text-[11px] font-mono tabular-nums text-emerald-700 mt-1.5">
              {healthyPct.toFixed(1)}% healthy
            </span>
          </div>
        </div>

        {/* Legend — always shows ALL 5 statuses with exact counts */}
        <ul className="flex flex-col divide-y divide-slate-100">
          {segments.map((s) => {
            const style = STATUS_STYLES[s.key]
            const pct = total > 0 ? (s.value / total) * 100 : 0
            const isHovered = hoverKey === s.key
            const isDimmed = hoverKey && hoverKey !== s.key
            const interactive = onStatusClick && s.value > 0
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={!interactive}
                  onMouseEnter={() => setHoverKey(s.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => onStatusClick?.(s.key)}
                  title={style.shortDesc}
                  className={cn(
                    'w-full flex items-center gap-3 py-1.5 px-1 text-left transition-all',
                    interactive && 'hover:bg-slate-50 cursor-pointer',
                    !interactive && 'cursor-default',
                    isDimmed && 'opacity-40',
                  )}
                >
                  <span
                    className={cn(
                      'w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform',
                      isHovered && 'scale-125',
                    )}
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-[13px] font-medium text-slate-700 truncate">
                    {s.label}
                  </span>
                  <span className="text-[13px] font-mono tabular-nums font-semibold text-slate-900 text-right min-w-[44px]">
                    {s.value.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 text-right min-w-[44px]">
                    {pct < 0.1 && s.value > 0 ? '<0.1%' : `${pct.toFixed(1)}%`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Strings-needing-attention summary + drill-down affordance */}
      {attentionCount > 0 && onStatusClick && (
        <button
          type="button"
          onClick={() => onStatusClick('warning')}
          className="mt-3 w-full text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center justify-between px-1 py-1.5 border-t border-slate-100 transition-colors"
        >
          <span>
            <strong className="font-bold text-slate-900 font-mono tabular-nums">{attentionCount.toLocaleString()}</strong> string{attentionCount === 1 ? '' : 's'} need attention
          </span>
          <span className="text-slate-400">→</span>
        </button>
      )}
      {attentionCount === 0 && total > 0 && (
        <p className="mt-3 text-[11px] font-semibold text-emerald-700 text-center border-t border-slate-100 pt-2">
          ✓ All {total.toLocaleString()} strings healthy
        </p>
      )}
    </CardShell>
  )
}

// ─── Internal: card chrome (eyebrow-dot + optional subtitle) ─────

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4 sm:p-5 shadow-card">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="w-1.5 h-1.5 bg-solar-gold-500 rounded-full" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[11px] text-slate-400 font-mono">· {subtitle}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Internal: loading skeleton ──────────────────────────────────

function SkeletonBody() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_1fr] gap-4 sm:gap-6 items-center animate-pulse">
      <div className="w-[180px] h-[180px] mx-auto sm:mx-0 rounded-full bg-slate-100 flex items-center justify-center">
        <div className="w-[120px] h-[120px] rounded-full bg-white" />
      </div>
      <ul className="space-y-2 w-full">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="flex-1 h-3 bg-slate-100 rounded-sm" style={{ width: `${60 + ((i * 7) % 30)}%` }} />
            <div className="w-10 h-3 bg-slate-100 rounded-sm" />
            <div className="w-12 h-3 bg-slate-100 rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  )
}
