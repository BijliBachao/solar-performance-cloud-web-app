'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, RefreshCw, Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  STATUS_STYLES,
  statusKeyFromPlantHealth,
  statusKeyFromPlantOp,
  plantHealthLabel,
  providerBadge,
  gradeFromScore,
} from '@/lib/design-tokens'
import {
  PLANT_OP_LABEL, type PlantOpStatus,
} from '@/lib/string-health'
import { Sparkline } from './Sparkline'

type PlantLiveStatus = 'PRODUCING' | 'IDLE' | 'OFFLINE'

interface PlantHeaderProps {
  plantName: string
  healthState: number | null
  capacityKw: number | null
  address: string | null
  deviceCount: number
  lastSynced: string | null
  lastDataAt?: string | null
  provider?: string
  stringSummary: { total: number; ok: number; warning: number; critical: number }
  backPath: string
  backLabel: string
  autoRefresh: boolean
  isRefreshing: boolean
  onToggleAutoRefresh: () => void
  onRefresh: () => void
  // Plant-level live KPIs (optional — preview pages may omit)
  liveStatus?: PlantLiveStatus
  /** Unified operational status (Status Unification). When provided, it is
   *  THE one status chip — replacing the power-floor pill + vendor badge. */
  opStatus?: PlantOpStatus
  currentPowerKw?: number
  todayEnergyKwh?: number
  utilizationPct?: number | null
  healthPct?: number | null
  alertCount?: number
  totalStringCount?: number
  sparkline24h?: number[]
}

function formatAgo(d: string | null) {
  if (!d) return 'Never'
  const date = new Date(d)
  if (isNaN(date.getTime())) return 'Never'
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Plant-level health % via the central V1 grade (gradeFromScore) so the header
// colour matches the per-string cells, the donut, and the NOC cutpoints.
function healthColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'text-ink-mute'
  switch (gradeFromScore(pct)) {
    case 'healthy': return 'text-emerald-700'
    case 'warning': return 'text-amber-700'
    case 'critical': return 'text-red-700'
    default: return 'text-slate-400'
  }
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`
  return `${kwh.toFixed(1)} kWh`
}

export function PlantHeader({
  plantName,
  healthState,
  capacityKw,
  deviceCount,
  lastSynced,
  lastDataAt,
  provider,
  stringSummary,
  backPath,
  backLabel,
  autoRefresh,
  isRefreshing,
  onToggleAutoRefresh,
  onRefresh,
  liveStatus = 'OFFLINE',
  opStatus,
  currentPowerKw = 0,
  todayEnergyKwh = 0,
  utilizationPct = null,
  healthPct = null,
  alertCount = 0,
  totalStringCount = 0,
  sparkline24h = [],
}: PlantHeaderProps) {
  const router = useRouter()
  const healthKey = statusKeyFromPlantHealth(healthState)
  const healthStyle = STATUS_STYLES[healthKey]
  const providerMeta = providerBadge(provider)
  const lastAgo = formatAgo(lastDataAt ?? lastSynced)

  return (
    <div className="px-4 sm:px-6 pt-5 pb-4 max-w-[1440px] mx-auto">
      {/* Featured card — 3px gradient top + shadow-featured (DESIGN.md §12.4) */}
      <div className="relative bg-canvas rounded-card border border-hairline overflow-hidden shadow-featured">
        {/* 3px gradient top accent — indigo brand ramp */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary-soft via-primary to-primary-press" />

        <div className="p-5 sm:p-6 pt-5">
          {/* ── Row 1: Back button + refresh controls ────────────── */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <button
              onClick={() => router.push(backPath)}
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-mute hover:text-ink transition-colors"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{backLabel}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleAutoRefresh}
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-pill border transition-colors',
                  autoRefresh
                    ? 'bg-primary-subtle text-primary border-primary/30'
                    : 'bg-canvas text-ink-mute border-hairline hover:bg-canvas-soft',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    autoRefresh ? 'bg-primary animate-pulse' : 'bg-slate-400',
                  )}
                />
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="text-ink-mute hover:text-ink p-1 transition-colors disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
                  strokeWidth={2}
                />
              </button>
            </div>
          </div>

          {/* ── Row 2: LEFT hero block + RIGHT sparkline ───────────── */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-5">
            {/* LEFT — label + LIVE pill + big value + plant name + pills */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Sun className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                <span className="text-[10px] font-medium uppercase tracking-widest text-ink-mute">
                  Plant Power
                </span>
                {/* THE status chip — Status Unification: one word from the
                    same engine as the NOC. Falls back to the legacy
                    power-floor pill only when opStatus isn't provided
                    (preview pages). */}
                {opStatus ? (
                  <span className={cn('flex items-center gap-1 text-[10px] font-bold', STATUS_STYLES[statusKeyFromPlantOp(opStatus)].fg)}>
                    {opStatus === 'live' ? (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                    ) : (
                      <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES[statusKeyFromPlantOp(opStatus)].dot)} />
                    )}
                    {PLANT_OP_LABEL[opStatus].toUpperCase()}
                  </span>
                ) : liveStatus === 'PRODUCING' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE
                  </span>
                ) : liveStatus === 'IDLE' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    IDLE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    OFFLINE
                  </span>
                )}
              </div>

              {/* Big mono value */}
              <div className="flex items-baseline gap-2 mb-2">
                {liveStatus === 'PRODUCING' ? (
                  <>
                    <span className="text-5xl font-light tabular-nums tracking-tight text-ink leading-none">
                      {currentPowerKw.toFixed(1)}
                    </span>
                    <span className="text-xl font-medium tabular-nums text-ink-mute">kW</span>
                  </>
                ) : liveStatus === 'IDLE' ? (
                  // Status Unification: one vocabulary — 'Idle', never 'Standby'.
                  <span className="text-3xl font-light tabular-nums text-ink-mute leading-none">
                    Idle
                  </span>
                ) : (
                  <span className="text-3xl font-light tabular-nums text-ink-mute leading-none">
                    —
                  </span>
                )}
              </div>

              {/* Plant name */}
              <h1 className="text-lg sm:text-xl font-light text-ink truncate mb-2">
                {plantName}
              </h1>

              {/* Provider badge + inverter count. The vendor health badge is
                  GONE when the unified opStatus chip is shown above — two
                  status systems in one header was the consistency bug this
                  page was famous for (Status Unification, 2026-06-05). */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {!opStatus && (
                  <span
                    className={cn(
                      'inline-flex items-center text-[9px] font-bold uppercase tracking-widest px-1.5 py-0 rounded-sm border',
                      healthStyle.bg,
                      healthStyle.fg,
                      healthStyle.border,
                    )}
                  >
                    {plantHealthLabel(healthState).toUpperCase()}
                  </span>
                )}
                {providerMeta && (
                  <span
                    className={cn(
                      'inline-flex items-center text-[9px] font-bold uppercase tracking-widest px-1.5 py-0 rounded-sm border',
                      providerMeta.bg,
                      providerMeta.fg,
                      providerMeta.border,
                    )}
                  >
                    {providerMeta.label}
                  </span>
                )}
                <span className="text-[11px] text-ink-mute">
                  ·
                  <span className="tabular-nums font-medium text-ink ml-1.5">{deviceCount}</span>
                  <span className="ml-1">inverter{deviceCount !== 1 ? 's' : ''}</span>
                </span>
              </div>
            </div>

            {/* RIGHT — 24h plant power sparkline */}
            <div className="flex-1 min-w-0 lg:max-w-md">
              <Sparkline
                data={sparkline24h}
                variant="area"
                color="var(--chart-1)"
                height={72}
              />
              <div className="flex justify-between text-[9px] tabular-nums font-medium text-ink-mute mt-1 px-1">
                <span>24h ago</span>
                <span>NOW</span>
              </div>
            </div>
          </div>

          {/* ── Row 3: KPI strip (5 cells, grid-px Stripe-style) ────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-hairline border border-hairline rounded-card overflow-hidden">
            {/* Capacity */}
            <div className="bg-canvas px-3 py-2.5">
              <div className="text-[9px] font-medium uppercase tracking-widest text-ink-mute mb-0.5">
                Capacity
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg tabular-nums font-medium text-ink leading-none">
                  {capacityKw ? Number(capacityKw).toFixed(1) : '—'}
                </span>
                {capacityKw && (
                  <span className="text-[10px] tabular-nums font-medium text-ink-mute">kW</span>
                )}
              </div>
            </div>

            {/* Today */}
            <div className="bg-canvas px-3 py-2.5">
              <div className="text-[9px] font-medium uppercase tracking-widest text-ink-mute mb-0.5">
                Today
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg tabular-nums font-medium text-ink leading-none">
                  {todayEnergyKwh > 0 ? formatEnergy(todayEnergyKwh).split(' ')[0] : '—'}
                </span>
                {todayEnergyKwh > 0 && (
                  <span className="text-[10px] tabular-nums font-medium text-ink-mute">
                    {formatEnergy(todayEnergyKwh).split(' ')[1]}
                  </span>
                )}
              </div>
            </div>

            {/* Utilization */}
            <div className="bg-canvas px-3 py-2.5">
              <div className="text-[9px] font-medium uppercase tracking-widest text-ink-mute mb-0.5">
                Utilization
              </div>
              {utilizationPct !== null && utilizationPct !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-lg tabular-nums font-medium text-ink leading-none">
                    {utilizationPct}
                  </span>
                  <span className="text-[10px] tabular-nums font-medium text-ink-mute">%</span>
                </div>
              ) : (
                <span className="text-lg tabular-nums font-medium text-ink-mute leading-none">—</span>
              )}
            </div>

            {/* Healthy strings — reporting + producing normally vs total. (Renamed
                from "Availability": that metric isn't in the V1 contract — §12.) */}
            <div
              className="bg-canvas px-3 py-2.5"
              title="Healthy strings: reporting and producing normally vs total expected"
            >
              <div className="text-[9px] font-medium uppercase tracking-widest text-ink-mute mb-0.5">
                Healthy Strings
              </div>
              {healthPct !== null && healthPct !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-lg tabular-nums font-medium leading-none', healthColor(healthPct))}>
                    {stringSummary.ok}
                  </span>
                  <span className="text-[10px] tabular-nums font-medium text-ink-mute">
                    / {totalStringCount}
                  </span>
                  <span className="text-[10px] tabular-nums font-medium text-ink-mute ml-1">
                    ({healthPct}%)
                  </span>
                </div>
              ) : (
                <span className="text-lg tabular-nums font-medium text-ink-mute leading-none">—</span>
              )}
            </div>

            {/* Alerts */}
            <div className="bg-canvas px-3 py-2.5">
              <div className="text-[9px] font-medium uppercase tracking-widest text-ink-mute mb-0.5">
                Alerts
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    'text-lg tabular-nums font-medium leading-none',
                    alertCount > 0 ? 'text-red-700' : 'text-emerald-700',
                  )}
                >
                  {alertCount}
                </span>
                {alertCount === 0 && (
                  <span className="text-[10px] font-medium text-ink-mute ml-1">all clear</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 4: Footer — last updated ──────────────────────── */}
          <div className="mt-4 text-[11px] text-ink-mute">
            Last updated <span className="tabular-nums font-medium text-ink-secondary">{lastAgo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
