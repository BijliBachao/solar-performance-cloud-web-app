'use client'

/**
 * StringHealthDonut — per-plant string-health donut card.
 *
 * v2 (2026-05-24): replaced the real-time 5-bucket view with a settled,
 * window-based 3-bucket view (Healthy / Abnormal / Critical) backed by
 * /api/plants/[code]/string-health-donut. Default mode is "Previous Day
 * End"; user can toggle to "Today (live)". Real-time noise (nighttime
 * 100%-offline, dawn 0A-fault spikes) is gone by design.
 *
 * V1 cutover (Task 10): the live toggle is "Today (live)" — it reads today's
 * PKT string_daily (the SAME V1 metric the NOC "today" donut and the /analysis
 * today cell use), replacing the retired SR-anchored "Last 3 Hours" mode. So
 * the per-plant Today donut == NOC today == /analysis today cell.
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §5b
 */

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, RefreshCw, Info } from 'lucide-react'
import { DonutCore } from '@/components/shared/DonutCore'
import { cn } from '@/lib/utils'
import type {
  DonutAggregate,
  DonutBucket,
} from '@/lib/string-health-donut'

// ─── Types ──────────────────────────────────────────────────────────

type DonutMode = 'prev-day' | 'today'

interface DonutApiResponse extends DonutAggregate {
  mode: DonutMode
  timeBasis: {
    label: string
    startsAt: string
    endsAt: string
    hoursCovered?: number
  }
  freshness: { lastDataAt: string | null; coveragePct: number }
  warnings: Array<{ code: string; message: string }>
}

interface StringHealthDonutProps {
  plantCode: string
  /** For tests / storybook — overrides the localStorage default. */
  initialMode?: DonutMode
}

// ─── Constants ──────────────────────────────────────────────────────

const STORAGE_KEY = 'spcStringDonutMode'
const VALID_MODES: ReadonlySet<DonutMode> = new Set(['prev-day', 'today'])

// ─── Helpers ────────────────────────────────────────────────────────

function readStoredMode(): DonutMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    // V1 cutover (Task 10): migrate the retired 'last-3h' value to 'today'.
    if (raw === 'last-3h') return 'today'
    if (raw && VALID_MODES.has(raw as DonutMode)) return raw as DonutMode
  } catch {
    // localStorage can throw in sandboxed iframes / private browsing
  }
  return null
}

function writeStoredMode(mode: DonutMode) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, mode) } catch {
    // best-effort persistence
  }
}

const fetcher = async (url: string): Promise<DonutApiResponse> => {
  // SWR's cache layer drops in-flight responses on unmount; we don't need
  // an explicit AbortController for that. (A previous version had one but
  // never called .abort() — that was dead code; removed.)
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    let message = `Failed to load (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.code) code = body.code
      if (body?.error) message = body.error
    } catch {
      // body wasn't JSON; keep defaults
    }
    const err = new Error(message) as Error & { code?: string; status?: number }
    err.code = code
    err.status = res.status
    throw err
  }
  return res.json()
}

function isStale(lastDataAt: string | null, mode: DonutMode): boolean {
  if (!lastDataAt) return false
  // Stale = no data in the last 30 minutes (only meaningful for the live "today"
  // mode; prev-day is a settled snapshot that never reads stale).
  if (mode !== 'today') return false
  const ageMs = Date.now() - new Date(lastDataAt).getTime()
  return ageMs > 30 * 60 * 1000
}

// ─── Component ──────────────────────────────────────────────────────

export function StringHealthDonut({ plantCode, initialMode }: StringHealthDonutProps) {
  // Mode state: prop > localStorage > 'prev-day'
  const [mode, setMode] = useState<DonutMode>(initialMode ?? 'prev-day')
  useEffect(() => {
    if (initialMode) return
    const stored = readStoredMode()
    if (stored) setMode(stored)
  }, [initialMode])

  const handleModeChange = (next: DonutMode) => {
    if (next === mode) return
    setMode(next)
    writeStoredMode(next)
  }

  const url = `/api/plants/${encodeURIComponent(plantCode)}/string-health-donut?mode=${mode}`
  const { data, error, isLoading, mutate } = useSWR<DonutApiResponse>(
    plantCode ? url : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Refresh interval matches server cache: 60s for today (live), 300s for prev-day
      refreshInterval: mode === 'today' ? 60_000 : 300_000,
      shouldRetryOnError: (err: { status?: number }) => {
        // Don't retry 4xx — bad request / unauthorized won't fix itself
        return !err?.status || err.status >= 500
      },
      errorRetryCount: 3,
    },
  )

  // ── Error state ──
  if (error) {
    const isAuthErr = error?.status === 401 || error?.status === 403
    return (
      <CardShell title="String Health" mode={mode} onModeChange={handleModeChange}>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-3" strokeWidth={2} />
          <p className="text-sm font-bold text-slate-900 mb-1">Unable to load string health</p>
          <p className="text-xs text-slate-500 mb-4 max-w-xs">{error.message}</p>
          {!isAuthErr && (
            <button
              type="button"
              onClick={() => mutate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      </CardShell>
    )
  }

  // ── Loading state ──
  if (isLoading || !data) {
    return (
      <CardShell title="String Health" mode={mode} onModeChange={handleModeChange}>
        <SkeletonBody />
      </CardShell>
    )
  }

  const total = data.totalStrings
  const stale = isStale(data.freshness.lastDataAt, mode)

  // ── Empty state ──
  if (total === 0) {
    const noDataWarning = data.warnings.find(
      (w) => w.code === 'NO_DATA_YESTERDAY' || w.code === 'NO_DATA_TODAY',
    )
    return (
      <CardShell title="String Health" mode={mode} onModeChange={handleModeChange} subtitle={data.timeBasis.label}>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center mb-3">
            <span className="text-2xl text-slate-300">∅</span>
          </div>
          <p className="text-sm font-bold text-slate-700 mb-1">
            {noDataWarning ? 'No data for this window' : 'No wired strings yet'}
          </p>
          <p className="text-xs text-slate-500 max-w-xs">
            {noDataWarning?.message ?? 'Data will appear once the poller syncs from your inverter provider.'}
          </p>
          {mode === 'today' && noDataWarning && (
            <button
              type="button"
              onClick={() => handleModeChange('prev-day')}
              className="mt-3 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
            >
              View previous day instead →
            </button>
          )}
        </div>
      </CardShell>
    )
  }

  // ── Normal render ──
  const healthyPct = total > 0 ? (data.counts.healthy / total) * 100 : 0

  return (
    <CardShell
      title="String Health"
      mode={mode}
      onModeChange={handleModeChange}
      subtitle={data.timeBasis.label}
      staleBadge={stale}
    >
      <DonutCore
        counts={{
          healthy: data.counts.healthy,
          abnormal: data.counts.abnormal,
          critical: data.counts.critical,
        }}
        total={total}
        breakdown={data.breakdown}
        size="md"
        legendOrientation="right"
        centerMetric={{ value: total.toLocaleString(), label: 'strings' }}
        centerSubline={`${healthyPct.toFixed(1)}% healthy`}
      />

      {/* Footnotes — informational only */}
      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
        {/* V1 rollup legend: the 3 arcs summarise the 5 per-string cell bands
            shown on /analysis, so the donut and the cells always reconcile. */}
        <p className="text-[10px] text-slate-400">
          Healthy = Normal · Abnormal = Watch + Underperforming (+ no-data) · Critical = Serious Fault + Dead
        </p>
        {(data.excluded.unused + data.excluded.nonStandard) > 0 && (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3 h-3 text-slate-400" strokeWidth={2} />
            {data.excluded.unused + data.excluded.nonStandard} string
            {data.excluded.unused + data.excluded.nonStandard === 1 ? '' : 's'} excluded
            {data.excluded.unused > 0 && (
              <span className="text-slate-400">· {data.excluded.unused} unused</span>
            )}
            {data.excluded.nonStandard > 0 && (
              <span className="text-slate-400">· {data.excluded.nonStandard} non-standard</span>
            )}
          </p>
        )}
        {data.warnings.length > 0 && data.warnings.map((w) => (
          <p key={w.code} className="text-[11px] text-amber-700 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2} />
            {w.message}
          </p>
        ))}
      </div>
    </CardShell>
  )
}

// ─── Card chrome ─────────────────────────────────────────────────────

function CardShell({
  title,
  subtitle,
  mode,
  onModeChange,
  staleBadge,
  children,
}: {
  title: string
  subtitle?: string
  mode: DonutMode
  onModeChange: (m: DonutMode) => void
  staleBadge?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4 sm:p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <span className="w-1.5 h-1.5 bg-solar-gold-500 rounded-full" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[11px] text-slate-400 font-mono truncate">· {subtitle}</span>
          )}
          {staleBadge && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
              Stale
            </span>
          )}
        </div>
        <ModeToggle mode={mode} onChange={onModeChange} />
      </div>
      {children}
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: DonutMode; onChange: (m: DonutMode) => void }) {
  const opts: Array<{ value: DonutMode; label: string; tooltip: string }> = [
    { value: 'prev-day', label: 'Prev day', tooltip: 'Yesterday\'s settled scores — stable, refreshes once per morning' },
    { value: 'today', label: 'Today (live)', tooltip: 'Today\'s V1 scores so far (PKT) — recomputed every poll cycle, settles by end of day. Matches the NOC today donut and the analysis today cell.' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Time basis"
      className="inline-flex items-center bg-slate-100 rounded-sm p-0.5 text-[11px] font-semibold flex-shrink-0"
    >
      {opts.map((o) => {
        const active = o.value === mode
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            title={o.tooltip}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-2.5 py-1 rounded-sm transition-colors',
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SkeletonBody() {
  return (
    <div className="flex flex-row items-center gap-6 animate-pulse">
      <div className="w-[180px] h-[180px] rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <div className="w-[120px] h-[120px] rounded-full bg-white" />
      </div>
      <ul className="space-y-2 w-full">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="flex-1 h-3 bg-slate-100 rounded-sm" style={{ width: `${60 + ((i * 12) % 30)}%` }} />
            <div className="w-10 h-3 bg-slate-100 rounded-sm" />
            <div className="w-12 h-3 bg-slate-100 rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  )
}
