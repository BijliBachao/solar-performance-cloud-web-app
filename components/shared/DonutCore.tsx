'use client'

/**
 * DonutCore — pure 3-segment donut chart primitive.
 *
 * No fetching, no URL state, no localStorage. Props in, render out.
 * Used by:
 *   - StringHealthDonut.tsx (per-plant card wrapper)
 *   - NocConsole.tsx (fleet operations console)
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §5a
 */

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'
import type { DonutBucket, DonutBreakdown } from '@/lib/string-health-donut'

// ─── Public API ──────────────────────────────────────────────────────

export interface DonutCoreCounts {
  healthy: number
  abnormal: number
  critical: number
}

export interface DonutCoreProps {
  counts: DonutCoreCounts
  total: number
  /** Optional — enriches tooltip with by-score / by-noData / by-openCircuit splits */
  breakdown?: DonutBreakdown
  /** Centre metric displayed inside the donut hole — pass `{ value, label }` */
  centerMetric?: { value: string; label: string }
  /** Optional small line below the centre metric, e.g., "98.0% healthy" */
  centerSubline?: string
  /** Controlled hover state — pass through if the parent needs to know */
  hoveredBucket?: DonutBucket | null
  onHoverBucket?: (bucket: DonutBucket | null) => void
  /** Click handler — when present, segments become buttons */
  onClickBucket?: (bucket: DonutBucket) => void
  /** Currently selected bucket (renders thicker outline) */
  selectedBucket?: DonutBucket | null
  /**
   * Multi-select (NOC v3): selected slices get the thick outline; when ANY
   * selection is active, non-selected slices dim — the explicit active-state
   * affordance for donut-as-filter. Takes precedence over `selectedBucket`.
   */
  selectedBuckets?: DonutBucket[] | null
  size?: 'sm' | 'md' | 'lg'
  showLegend?: boolean
  legendOrientation?: 'right' | 'bottom'
  /** For ARIA — describes the chart contents */
  ariaLabel?: string
  /**
   * Optional per-slice overrides for re-purposing the primitive onto a
   * different 3-bucket taxonomy (e.g. the NOC connectivity donut maps
   * live→healthy, frozen→abnormal, offline→critical). Colors MUST still
   * come from a design-token lookup, never hardcoded at the call site.
   * Unset keys fall back to the default String-Health hex/labels/unit.
   */
  colors?: Partial<Record<DonutBucket, string>>
  labels?: Partial<Record<DonutBucket, string>>
  /** Noun used in the tooltip (default "string" / "strings"). */
  unit?: { singular: string; plural: string }
}

// ─── Static config ───────────────────────────────────────────────────

const SIZE_PX: Record<NonNullable<DonutCoreProps['size']>, { donut: number; inner: number; outer: number }> = {
  sm: { donut: 140, inner: 48, outer: 66 },
  md: { donut: 180, inner: 62, outer: 86 },
  lg: { donut: 240, inner: 84, outer: 116 },
}

// Hex needed for Recharts <Cell fill> — matches STATUS_STYLES tokens elsewhere
const BUCKET_HEX: Record<DonutBucket, string> = {
  healthy: '#10B981',  // emerald-500
  abnormal: '#F59E0B', // amber-500
  critical: '#EF4444', // red-500
}

const BUCKET_LABEL: Record<DonutBucket, string> = {
  healthy: 'Healthy',
  abnormal: 'Abnormal',
  critical: 'Critical',
}

// V1 band cutover: the 3 summary arcs roll up the 5 per-string cell bands.
// Surfaced in the tooltip so the donut and the /analysis cells stay reconciled:
// Healthy = Normal; Abnormal = Watch + Underperforming (+ no-data); Critical =
// Serious Fault + Dead. The cells show all 5 as 5 colours; the donut summarises.
const BUCKET_ROLLUP: Record<DonutBucket, string> = {
  healthy: 'Normal (≥95%)',
  abnormal: 'Watch + Underperforming (60–94%) + no-data',
  critical: 'Serious Fault + Dead (<60%)',
}

// ─── Tooltip ─────────────────────────────────────────────────────────

interface SegmentPayload {
  key: DonutBucket
  value: number
  label: string
  color: string
  total: number
  breakdown?: DonutBreakdown
  unit?: { singular: string; plural: string }
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: SegmentPayload }> }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  if (!p) return null
  const pct = p.total > 0 ? ((p.value / p.total) * 100).toFixed(1) : '0'

  const detail = (() => {
    if (!p.breakdown) return null
    if (p.key === 'critical') {
      const { byScore, openCircuit } = p.breakdown.critical
      const parts: string[] = []
      if (byScore > 0) parts.push(`${byScore} by score`)
      if (openCircuit > 0) parts.push(`${openCircuit} by 0A fault`)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    if (p.key === 'abnormal') {
      const { byScore, noData } = p.breakdown.abnormal
      const parts: string[] = []
      if (byScore > 0) parts.push(`${byScore} by score`)
      if (noData > 0) parts.push(`${noData} no data`)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    return null
  })()

  // V1 rollup explainer: the 3 arcs summarise the 5 cell bands. This keeps the
  // donut (summary) and the /analysis cells (5 colours) reconciled in the UI.
  const rollup = BUCKET_ROLLUP[p.key]

  return (
    <div
      className="rounded-md border border-slate-200 px-3 py-2 text-xs pointer-events-none"
      style={{
        backgroundColor: '#FFFFFF',
        boxShadow: '0 10px 24px -8px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
        <span className="font-bold text-slate-900">{p.label}</span>
      </div>
      <div className="text-slate-600 font-mono tabular-nums">
        {p.value.toLocaleString()}{' '}
        <span className="text-slate-400">
          {p.value === 1 ? (p.unit?.singular ?? 'string') : (p.unit?.plural ?? 'strings')}
        </span>{' '}
        · {pct}%
      </div>
      {detail && (
        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{detail}</div>
      )}
      {rollup && (
        <div className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">{rollup}</div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export function DonutCore({
  counts,
  total,
  breakdown,
  centerMetric,
  centerSubline,
  hoveredBucket: controlledHover,
  onHoverBucket,
  onClickBucket,
  selectedBucket = null,
  selectedBuckets = null,
  size = 'md',
  showLegend = true,
  legendOrientation = 'right',
  ariaLabel,
  colors,
  labels,
  unit,
}: DonutCoreProps) {
  const [uncontrolledHover, setUncontrolledHover] = useState<DonutBucket | null>(null)
  const hoverKey = controlledHover !== undefined ? controlledHover : uncontrolledHover
  const setHover = (b: DonutBucket | null) => {
    if (controlledHover === undefined) setUncontrolledHover(b)
    onHoverBucket?.(b)
  }

  // Normalised selection: multi-select wins; single-select folds into a set.
  const selectedSet = useMemo<Set<DonutBucket> | null>(() => {
    if (selectedBuckets && selectedBuckets.length > 0) return new Set(selectedBuckets)
    if (selectedBucket) return new Set([selectedBucket])
    return null
  }, [selectedBuckets, selectedBucket])

  const segments = useMemo(() => {
    // Descending order so the largest slice starts at 12 o'clock
    const buckets: DonutBucket[] = ['healthy', 'abnormal', 'critical']
    return buckets
      .map((b) => ({
        key: b,
        value: counts[b],
        label: labels?.[b] ?? BUCKET_LABEL[b],
        color: colors?.[b] ?? BUCKET_HEX[b],
      }))
      .sort((a, b) => b.value - a.value)
  }, [counts, colors, labels])

  const chartData: SegmentPayload[] = segments.map((s) => ({ ...s, total, breakdown, unit }))
  const dim = SIZE_PX[size]
  const isInteractive = Boolean(onClickBucket)

  const accessibleLabel = ariaLabel ?? (
    `String health: ${counts.healthy} healthy, ${counts.abnormal} abnormal, ${counts.critical} critical (${total} total)`
  )

  // Empty: render an outline ring with the centre metric (parent decides what to show)
  if (total === 0) {
    return (
      <div className={cn(
        'flex',
        legendOrientation === 'right' ? 'flex-row items-center gap-6' : 'flex-col items-center gap-4',
      )}>
        <EmptyRing size={dim.donut} centerMetric={centerMetric} centerSubline={centerSubline} />
        {showLegend && <Legend segments={segments} total={0} hoverKey={null} setHover={() => {}} selectedSet={null} onClickBucket={undefined} />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex',
        legendOrientation === 'right' ? 'flex-row items-center gap-6' : 'flex-col items-center gap-4',
      )}
      role="img"
      aria-label={accessibleLabel}
    >
      <div className="relative flex-shrink-0" style={{ width: dim.donut, height: dim.donut }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={dim.inner}
              outerRadius={dim.outer}
              paddingAngle={1}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={true}
              animationDuration={400}
              onMouseEnter={(_, idx) => setHover(segments[idx]?.key ?? null)}
              onMouseLeave={() => setHover(null)}
              onClick={(data) => {
                const k = (data as { payload?: { key?: DonutBucket } })?.payload?.key
                if (k && onClickBucket) onClickBucket(k)
              }}
            >
              {chartData.map((s) => {
                const isSelected = selectedSet?.has(s.key) ?? false
                // Hover dim wins; otherwise an active selection dims the
                // NON-selected slices (donut-as-filter active state).
                const opacity = hoverKey
                  ? (hoverKey !== s.key ? 0.4 : 1)
                  : (selectedSet && !isSelected ? 0.35 : 1)
                return (
                  <Cell
                    key={s.key}
                    fill={s.color}
                    opacity={opacity}
                    // SVG paths don't honor CSS `outline`. Use stroke for the
                    // "selected bucket" cue so NocConsole users see which slice
                    // they clicked on.
                    stroke={isSelected ? '#0F172A' : '#FFFFFF'}
                    strokeWidth={isSelected ? 3 : 1}
                    style={{
                      cursor: isInteractive && s.value > 0 ? 'pointer' : 'default',
                      transition: 'opacity 150ms, stroke-width 150ms',
                    }}
                  />
                )
              })}
            </Pie>
            <Tooltip
              content={<DonutTooltip />}
              cursor={false}
              wrapperStyle={{ zIndex: 50, outline: 'none' }}
              allowEscapeViewBox={{ x: true, y: true }}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerMetric && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={cn(
              'font-bold font-mono tabular-nums text-slate-900 leading-none',
              size === 'lg' && 'text-[36px]',
              size === 'md' && 'text-[28px]',
              size === 'sm' && 'text-[22px]',
            )}>
              {centerMetric.value}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
              {centerMetric.label}
            </span>
            {centerSubline && (
              <span className="text-[11px] font-mono tabular-nums text-emerald-700 mt-1.5">
                {centerSubline}
              </span>
            )}
          </div>
        )}
      </div>

      {showLegend && (
        <Legend
          segments={segments}
          total={total}
          hoverKey={hoverKey}
          setHover={setHover}
          selectedSet={selectedSet}
          onClickBucket={onClickBucket}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function Legend({
  segments,
  total,
  hoverKey,
  setHover,
  selectedSet,
  onClickBucket,
}: {
  segments: Array<{ key: DonutBucket; value: number; label: string; color: string }>
  total: number
  hoverKey: DonutBucket | null
  setHover: (b: DonutBucket | null) => void
  selectedSet: Set<DonutBucket> | null
  onClickBucket?: (b: DonutBucket) => void
}) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 min-w-[200px]">
      {segments.map((s) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0
        const isHovered = hoverKey === s.key
        const isDimmed = (hoverKey && hoverKey !== s.key) || (!hoverKey && selectedSet && !selectedSet.has(s.key))
        const isSelected = selectedSet?.has(s.key) ?? false
        const interactive = Boolean(onClickBucket) && s.value > 0
        return (
          <li key={s.key}>
            <button
              type="button"
              disabled={!interactive}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              onClick={() => onClickBucket?.(s.key)}
              aria-pressed={isSelected || undefined}
              className={cn(
                'w-full flex items-center gap-3 py-1.5 px-1 text-left transition-all',
                interactive && 'hover:bg-slate-50 focus:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400',
                !interactive && 'cursor-default',
                isDimmed && !isSelected && 'opacity-40',
                isSelected && 'bg-slate-50',
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
  )
}

function EmptyRing({
  size,
  centerMetric,
  centerSubline,
}: {
  size: number
  centerMetric?: { value: string; label: string }
  centerSubline?: string
}) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center text-center">
          {centerMetric ? (
            <>
              <span className="text-2xl text-slate-300 leading-none">{centerMetric.value}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                {centerMetric.label}
              </span>
            </>
          ) : (
            <span className="text-3xl text-slate-300">∅</span>
          )}
          {centerSubline && (
            <span className="text-[11px] font-mono tabular-nums text-slate-500 mt-1.5">{centerSubline}</span>
          )}
        </div>
      </div>
    </div>
  )
}
