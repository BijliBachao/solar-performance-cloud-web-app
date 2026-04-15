'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Zap, MapPin, Activity, Clock, Cpu, RefreshCw,
} from 'lucide-react'

const providerLabel: Record<string, string> = {
  huawei: 'HUAWEI',
  solis: 'SOLIS',
  growatt: 'GROWATT',
  sungrow: 'SUNGROW',
}

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
  address,
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

  const healthConfig: Record<number, { label: string; color: string }> = {
    3: { label: 'HEALTHY', color: 'text-[#76b900]' },
    2: { label: 'FAULTY', color: 'text-[#e52020]' },
    1: { label: 'OFFLINE', color: 'text-[#898989]' },
  }
  const health = healthConfig[healthState || 0] || healthConfig[1]

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
    <div className="bg-[#1a1a1a] border-b border-[#333]">
      <div className="px-4 sm:px-6 py-4">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white truncate">{plantName}</h1>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${health.color}`}>
              {health.label}
            </span>
            {provider && (
              <span className="text-[10px] font-bold text-[#5e5e5e] uppercase tracking-widest">
                {providerLabel[provider] || provider}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutoRefresh}
              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm border transition-colors ${
                autoRefresh
                  ? 'bg-[#76b900]/10 text-[#76b900] border-[#76b900]/30'
                  : 'bg-transparent text-[#5e5e5e] border-[#333]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-[#76b900] animate-pulse' : 'bg-[#5e5e5e]'}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button onClick={onRefresh} disabled={isRefreshing} className="text-[#898989] hover:text-white p-1 transition-colors">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => router.push(backPath)} className="flex items-center gap-1 text-[11px] font-bold text-[#898989] hover:text-white transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-3 text-[11px] text-[#898989]">
          {capacityKw && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#5e5e5e]" />
              <span className="font-semibold text-[#a7a7a7]">{Number(capacityKw).toFixed(1)} kW</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#5e5e5e]" />
            <span className="font-semibold text-[#a7a7a7]">{deviceCount}</span> inverters
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#5e5e5e]" />
            Last data <span className="font-semibold text-[#a7a7a7]">{formatDate(lastDataAt ?? lastSynced)}</span>
          </div>
          {stringSummary.total > 0 && (
            <>
              <span className="text-[#333] hidden sm:inline">|</span>
              <div className="flex items-center gap-3">
                <span className="text-[#76b900] font-bold">{stringSummary.ok} OK</span>
                {stringSummary.warning > 0 && (
                  <span className="text-[#ef9100] font-bold">{stringSummary.warning} warn</span>
                )}
                {stringSummary.critical > 0 && (
                  <span className="text-[#e52020] font-bold">{stringSummary.critical} crit</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
