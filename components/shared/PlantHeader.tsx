'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Zap, MapPin, Activity, Clock, Cpu, RefreshCw,
} from 'lucide-react'

interface PlantHeaderProps {
  plantName: string
  healthState: number | null
  capacityKw: number | null
  address: string | null
  deviceCount: number
  lastSynced: string | null
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
  stringSummary,
  backPath,
  backLabel,
  autoRefresh,
  isRefreshing,
  onToggleAutoRefresh,
  onRefresh,
}: PlantHeaderProps) {
  const router = useRouter()

  const healthBadge = (state: number | null) => {
    if (state === 3) return { label: 'Healthy', variant: 'success' as const }
    if (state === 2) return { label: 'Faulty', variant: 'destructive' as const }
    return { label: 'Disconnected', variant: 'secondary' as const }
  }

  const formatDate = (d: string | null) => {
    if (!d) return 'Never'
    const date = new Date(d)
    if (isNaN(date.getTime())) return 'Never'
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const health = healthBadge(healthState)

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="px-4 sm:px-6 py-4">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <h1 className="text-lg font-semibold text-gray-900 truncate">{plantName}</h1>
            <Badge variant={health.variant}>{health.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutoRefresh}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                autoRefresh
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-50 text-gray-400 border-gray-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing} className="text-gray-500">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push(backPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
            </Button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-3 text-xs text-gray-500">
          {capacityKw && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>{Number(capacityKw).toFixed(1)} kW</span>
            </div>
          )}
          {address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span className="max-w-[200px] truncate">{address}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            <span>{deviceCount} inverter{deviceCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Synced {formatDate(lastSynced)}</span>
          </div>
          {stringSummary.total > 0 && (
            <>
              <span className="text-gray-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {stringSummary.ok} OK
                </span>
                {stringSummary.warning > 0 && (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {stringSummary.warning} warn
                  </span>
                )}
                {stringSummary.critical > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {stringSummary.critical} critical
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
