'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Activity, Clock, Cpu, RefreshCw, Zap, Sun, AlertTriangle,
  TrendingUp, Gauge,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  STATUS_STYLES,
  statusKeyFromPlantHealth,
  plantHealthLabel,
  providerBadge,
} from '@/lib/design-tokens'
import { HEALTH_HEALTHY, HEALTH_WARNING } from '@/lib/string-health'

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

function healthColor(pct: number | null): string {
  if (pct === null) return 'text-slate-400'
  if (pct >= HEALTH_HEALTHY) return 'text-emerald-700'
  if (pct >= HEALTH_WARNING) return 'text-amber-700'
  return 'text-red-700'
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
}: PlantHeaderProps) {
  const router = useRouter()
  const healthKey = statusKeyFromPlantHealth(healthState)
  const healthStyle = STATUS_STYLES[healthKey]
  const providerMeta = providerBadge(provider)
  const lastAgo = formatAgo(lastDataAt ?? lastSynced)

  return (
    <div className="bg-white border-b border-slate-200 shadow-card">
      <div className="px-4 sm:px-6 py-4 max-w-[1440px] mx-auto">
        {/* ── Top row: back button + title + controls ────────────── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <button
              onClick={() => router.push(backPath)}
              className="mt-0.5 shrink-0 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 transition-colors"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">{backLabel}</span>
            </button>

            <div className="min-w-0 flex-1">
              {/* Status pill row (above the title) */}
              <div className="flex items-center gap-1.5 mb-1">
                {liveStatus === 'PRODUCING' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 shrink-0">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE
                  </span>
                ) : liveStatus === 'IDLE' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    STANDBY
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    OFFLINE
                  </span>
                )}
                <span
                  className={cn(
                    'shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0 rounded-sm border',
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
                      'shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0 rounded-sm border',
                      providerMeta.bg,
                      providerMeta.fg,
                      providerMeta.border,
                    )}
                  >
                    {providerMeta.label}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 ml-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                  Last data <span className="font-mono font-semibold text-slate-600">{lastAgo}</span>
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-slate-900 truncate">
                {plantName}
              </h1>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* ── KPI strip (5 compact tiles on one row) ─────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden">
          {/* Now */}
          <div className="bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
              <Zap className="w-2.5 h-2.5 text-solar-gold-500" strokeWidth={2.5} />
              Now
            </div>
            {liveStatus === 'PRODUCING' ? (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {currentPowerKw.toFixed(1)}
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">kW</span>
              </div>
            ) : liveStatus === 'IDLE' ? (
              <span className="text-sm font-semibold text-slate-400">Standby</span>
            ) : (
              <span className="text-sm font-semibold text-slate-400">—</span>
            )}
          </div>

          {/* Today */}
          <div className="bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
              <Sun className="w-2.5 h-2.5 text-solar-gold-500" strokeWidth={2.5} />
              Today
            </div>
            {todayEnergyKwh > 0 ? (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {todayEnergyKwh >= 1000
                    ? (todayEnergyKwh / 1000).toFixed(2)
                    : todayEnergyKwh.toFixed(1)}
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">
                  {todayEnergyKwh >= 1000 ? 'MWh' : 'kWh'}
                </span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-400">—</span>
            )}
          </div>

          {/* Capacity */}
          <div className="bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
              <Activity className="w-2.5 h-2.5 text-blue-500" strokeWidth={2.5} />
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

          {/* Utilization */}
          <div className="bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
              <Gauge className="w-2.5 h-2.5 text-violet-500" strokeWidth={2.5} />
              Utilization
            </div>
            {utilizationPct !== null ? (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {utilizationPct}
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">%</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-400">—</span>
            )}
          </div>

          {/* Health */}
          <div className="bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
              <TrendingUp className="w-2.5 h-2.5 text-emerald-500" strokeWidth={2.5} />
              Strings OK
            </div>
            {healthPct !== null ? (
              <div className="flex items-baseline gap-1">
                <span className={cn('text-lg font-mono font-bold leading-none', healthColor(healthPct))}>
                  {healthPct}
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">%</span>
                <span className="text-[10px] font-mono font-semibold text-slate-400 ml-1">
                  ({stringSummary.ok}/{totalStringCount})
                </span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-400">—</span>
            )}
          </div>
        </div>

        {/* ── Status strip: inverters · string breakdown · alerts ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Cpu className="w-3 h-3 text-slate-400" strokeWidth={2} />
            <span>
              <span className="font-mono font-bold text-slate-900">{deviceCount}</span>{' '}
              inverter{deviceCount !== 1 ? 's' : ''}
            </span>
          </div>
          {stringSummary.total > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-2.5 font-bold">
                <span className="text-emerald-700">
                  <span className="font-mono">{stringSummary.ok}</span> OK
                </span>
                {stringSummary.warning > 0 && (
                  <span className="text-amber-700">
                    <span className="font-mono">{stringSummary.warning}</span> warn
                  </span>
                )}
                {stringSummary.critical > 0 && (
                  <span className="text-red-700">
                    <span className="font-mono">{stringSummary.critical}</span> crit
                  </span>
                )}
              </div>
            </>
          )}
          {alertCount > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-1 text-red-700 font-bold">
                <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                <span className="font-mono">{alertCount}</span>
                <span>active alert{alertCount !== 1 ? 's' : ''}</span>
              </div>
            </>
          )}
          {alertCount === 0 && stringSummary.critical === 0 && stringSummary.warning === 0 && totalStringCount > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-emerald-700 font-bold">All clear</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
