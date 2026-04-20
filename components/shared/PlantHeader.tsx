'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Activity, Clock, Cpu, RefreshCw,
} from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromPlantHealth,
  plantHealthLabel,
  providerBadge,
} from '@/lib/design-tokens'

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
}: PlantHeaderProps) {
  const router = useRouter()

  const healthKey = statusKeyFromPlantHealth(healthState)
  const healthStyle = STATUS_STYLES[healthKey]
  const providerMeta = providerBadge(provider)

  const formatDate = (d: string | null) => {
    if (!d) return 'Never'
    const date = new Date(d)
    if (isNaN(date.getTime())) return 'Never'
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="px-4 sm:px-6 py-5">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 truncate">
              {plantName}
            </h1>
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${healthStyle.bg} ${healthStyle.fg} ${healthStyle.border}`}
            >
              {plantHealthLabel(healthState).toUpperCase()}
            </span>
            {providerMeta && (
              <span
                className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${providerMeta.bg} ${providerMeta.fg} ${providerMeta.border}`}
              >
                {providerMeta.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleAutoRefresh}
              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm border transition-colors ${
                autoRefresh
                  ? 'bg-spc-green/10 text-spc-green border-spc-green/30'
                  : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoRefresh ? 'bg-spc-green animate-pulse' : 'bg-slate-400'
                }`}
              />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-slate-400 hover:text-slate-900 p-1 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                strokeWidth={2}
              />
            </button>
            <button
              onClick={() => router.push(backPath)}
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> {backLabel}
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-3 text-[11px] text-slate-500">
          {capacityKw && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
              <span className="font-mono font-semibold text-slate-900">
                {Number(capacityKw).toFixed(1)} kW
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
            <span className="font-mono font-semibold text-slate-900">{deviceCount}</span>
            <span>inverter{deviceCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
            <span>Last data</span>
            <span className="font-mono font-semibold text-slate-900">
              {formatDate(lastDataAt ?? lastSynced)}
            </span>
          </div>
          {stringSummary.total > 0 && (
            <>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className={STATUS_STYLES.healthy.fg}>
                  <span className="font-mono">{stringSummary.ok}</span> OK
                </span>
                {stringSummary.warning > 0 && (
                  <span className={STATUS_STYLES.warning.fg}>
                    <span className="font-mono">{stringSummary.warning}</span> warn
                  </span>
                )}
                {stringSummary.critical > 0 && (
                  <span className={STATUS_STYLES.critical.fg}>
                    <span className="font-mono">{stringSummary.critical}</span> crit
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
