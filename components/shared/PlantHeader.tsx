'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, RefreshCw, Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  STATUS_STYLES,
  statusKeyFromPlantHealth,
  plantHealthLabel,
  providerBadge,
} from '@/lib/design-tokens'
import { HEALTH_HEALTHY, HEALTH_WARNING } from '@/lib/string-health'
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

function healthColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'text-slate-400'
  if (pct >= HEALTH_HEALTHY) return 'text-emerald-700'
  if (pct >= HEALTH_WARNING) return 'text-amber-700'
  return 'text-red-700'
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
      <div className="relative bg-white rounded-lg border border-slate-200 overflow-hidden shadow-featured">
        {/* 3px gradient top accent — solar-gold 400 → 500 → 600 */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-solar-gold-400 via-solar-gold-500 to-solar-gold-600" />

        <div className="p-5 sm:p-6 pt-5">
          {/* ── Row 1: Back button + refresh controls ────────────── */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <button
              onClick={() => router.push(backPath)}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 transition-colors"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{backLabel}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleAutoRefresh}
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm border transition-colors',
                  autoRefresh
                    ? 'bg-solar-gold/10 text-solar-gold-700 border-solar-gold/30'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    autoRefresh ? 'bg-solar-gold animate-pulse' : 'bg-slate-400',
                  )}
                />
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="text-slate-400 hover:text-slate-900 p-1 transition-colors disabled:opacity-50"
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
                <Sun className="h-3.5 w-3.5 text-solar-gold-600" strokeWidth={2} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Plant Power
                </span>
                {liveStatus === 'PRODUCING' ? (
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
                    STANDBY
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
                    <span className="text-5xl font-mono font-bold tracking-tight text-slate-900 leading-none">
                      {currentPowerKw.toFixed(1)}
                    </span>
                    <span className="text-xl font-mono font-semibold text-slate-500">kW</span>
                  </>
                ) : liveStatus === 'IDLE' ? (
                  <span className="text-3xl font-mono font-semibold text-slate-400 leading-none">
                    Standby
                  </span>
                ) : (
                  <span className="text-3xl font-mono font-semibold text-slate-400 leading-none">
                    —
                  </span>
                )}
              </div>

              {/* Plant name */}
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate mb-2">
                {plantName}
              </h1>

              {/* Status & provider badges + inverter count */}
              <div className="flex items-center gap-1.5 flex-wrap">
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
                <span className="text-[11px] text-slate-500">
                  ·
                  <span className="font-mono font-bold text-slate-900 ml-1.5">{deviceCount}</span>
                  <span className="ml-1">inverter{deviceCount !== 1 ? 's' : ''}</span>
                </span>
              </div>
            </div>

            {/* RIGHT — 24h plant power sparkline */}
            <div className="flex-1 min-w-0 lg:max-w-md">
              <Sparkline
                data={sparkline24h}
                variant="area"
                color="#F59E0B"
                height={72}
              />
              <div className="flex justify-between text-[9px] font-mono font-semibold text-slate-400 mt-1 px-1">
                <span>24h ago</span>
                <span>NOW</span>
              </div>
            </div>
          </div>

          {/* ── Row 3: KPI strip (5 cells, grid-px Stripe-style) ────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden">
            {/* Capacity */}
            <div className="bg-white px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Capacity
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {capacityKw ? Number(capacityKw).toFixed(1) : '—'}
                </span>
                {capacityKw && (
                  <span className="text-[10px] font-mono font-semibold text-slate-500">kW</span>
                )}
              </div>
            </div>

            {/* Today */}
            <div className="bg-white px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Today
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {todayEnergyKwh > 0 ? formatEnergy(todayEnergyKwh).split(' ')[0] : '—'}
                </span>
                {todayEnergyKwh > 0 && (
                  <span className="text-[10px] font-mono font-semibold text-slate-500">
                    {formatEnergy(todayEnergyKwh).split(' ')[1]}
                  </span>
                )}
              </div>
            </div>

            {/* Utilization */}
            <div className="bg-white px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Utilization
              </div>
              {utilizationPct !== null && utilizationPct !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                    {utilizationPct}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-500">%</span>
                </div>
              ) : (
                <span className="text-lg font-mono font-semibold text-slate-400 leading-none">—</span>
              )}
            </div>

            {/* Availability (IEC 61724-1) — strings online vs total */}
            <div
              className="bg-white px-3 py-2.5"
              title="Availability (IEC 61724-1): strings reporting and producing vs total expected"
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Availability
              </div>
              {healthPct !== null && healthPct !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-lg font-mono font-bold leading-none', healthColor(healthPct))}>
                    {stringSummary.ok}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-500">
                    / {totalStringCount}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-400 ml-1">
                    ({healthPct}%)
                  </span>
                </div>
              ) : (
                <span className="text-lg font-mono font-semibold text-slate-400 leading-none">—</span>
              )}
            </div>

            {/* Alerts */}
            <div className="bg-white px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Alerts
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    'text-lg font-mono font-bold leading-none',
                    alertCount > 0 ? 'text-red-700' : 'text-emerald-700',
                  )}
                >
                  {alertCount}
                </span>
                {alertCount === 0 && (
                  <span className="text-[10px] font-semibold text-slate-400 ml-1">all clear</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 4: Footer — last updated ──────────────────────── */}
          <div className="mt-4 text-[11px] text-slate-500">
            Last updated <span className="font-mono font-semibold text-slate-700">{lastAgo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
