'use client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Cpu, AlertTriangle, Activity } from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromPlantHealth,
  plantHealthLabel,
  providerBadge,
} from '@/lib/design-tokens'
import {
  HEALTH_HEALTHY,
  HEALTH_CAUTION,
  HEALTH_WARNING,
  HEALTH_SEVERE,
} from '@/lib/string-health'
import { Sparkline } from './Sparkline'

/**
 * SPC PlantCard — v4 Solar Corporate (DESIGN.md §12.3).
 * Live pulse · current power + today kWh · 24h production bars ·
 * health progress bar · inverter/alert summary footer.
 */

interface PlantCardProps {
  plant: {
    id: string
    plant_name: string
    capacity_kw: number | null
    health_state: number | null
    device_count: number
    alert_count: number
    provider?: string
    isLive?: boolean
    currentPowerKw?: number
    todayEnergyKwh?: number
    healthPercent?: number | null
    productionBars?: number[]
  }
  basePath?: string
}

const LEFT_ACCENT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  offline: 'bg-slate-400',
  'open-circuit': 'bg-violet-500',
  info: 'bg-blue-500',
}

function healthBarColor(percent: number): string {
  if (percent >= HEALTH_HEALTHY) return 'bg-emerald-500'
  if (percent >= HEALTH_CAUTION) return 'bg-emerald-400'
  if (percent >= HEALTH_WARNING) return 'bg-amber-500'
  if (percent >= HEALTH_SEVERE) return 'bg-red-500'
  return 'bg-red-600'
}

export function PlantCard({ plant, basePath = '/dashboard/plants' }: PlantCardProps) {
  const router = useRouter()
  const statusKey = statusKeyFromPlantHealth(plant.health_state)
  const providerMeta = providerBadge(plant.provider)
  const healthPercent = plant.healthPercent
  const hasHealth = healthPercent !== null && healthPercent !== undefined && healthPercent > 0
  const hasProductionBars = plant.productionBars && plant.productionBars.length > 0 && plant.productionBars.some((v) => v > 0)

  return (
    <div
      onClick={() => router.push(`${basePath}/${plant.id}`)}
      className="relative bg-white rounded-md border border-slate-200 overflow-hidden cursor-pointer group hover:border-solar-gold hover:shadow-card transition-all"
    >
      {/* Left accent stripe */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', LEFT_ACCENT[statusKey])} />

      <div className="p-4 pl-5 space-y-3">
        {/* Header: Live pill + Provider badge + Plant name */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            {plant.isLive ? (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                {plantHealthLabel(plant.health_state).toUpperCase()}
              </span>
            )}
            {providerMeta && (
              <span
                className={cn(
                  'shrink-0 inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1 py-0 rounded-sm border',
                  providerMeta.bg,
                  providerMeta.fg,
                  providerMeta.border,
                )}
              >
                {providerMeta.label}
              </span>
            )}
            <span className="ml-auto text-[11px] font-mono font-semibold text-slate-500 shrink-0">
              {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : '—'}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-solar-gold-700 transition-colors">
            {plant.plant_name}
          </h3>
        </div>

        {/* Now + Today metrics */}
        <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-100">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Now</span>
            <div className="text-lg font-mono font-bold text-slate-900 leading-tight">
              {plant.isLive && (plant.currentPowerKw ?? 0) > 0
                ? `${(plant.currentPowerKw ?? 0).toFixed(1)}`
                : '—'}
              {plant.isLive && (plant.currentPowerKw ?? 0) > 0 && (
                <span className="text-xs font-mono font-semibold text-slate-500 ml-1">kW</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Today</span>
            <div className="text-lg font-mono font-bold text-slate-900 leading-tight">
              {(plant.todayEnergyKwh ?? 0) > 0
                ? `${(plant.todayEnergyKwh ?? 0).toFixed(1)}`
                : '—'}
              {(plant.todayEnergyKwh ?? 0) > 0 && (
                <span className="text-xs font-mono font-semibold text-slate-500 ml-1">kWh</span>
              )}
            </div>
          </div>
        </div>

        {/* Production bars (24h) */}
        {hasProductionBars && (
          <div>
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              <span>Today's Production</span>
              <span className="font-mono">24h</span>
            </div>
            <Sparkline
              data={plant.productionBars!}
              variant="bars"
              color="#F59E0B"
              height={24}
            />
          </div>
        )}

        {/* Health progress bar */}
        {hasHealth && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="font-bold uppercase tracking-wider text-slate-400">Health</span>
              <span className="font-mono font-bold text-slate-700">
                {(healthPercent as number).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full transition-all', healthBarColor(healthPercent as number))}
                style={{ width: `${Math.min(healthPercent as number, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer: devices + alerts */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
              <span className="text-[11px] text-slate-500">
                <span className="font-mono font-bold text-slate-900">{plant.device_count}</span>{' '}
                inv
              </span>
            </div>
          </div>
          {plant.alert_count > 0 ? (
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" strokeWidth={2} />
              <span className="text-[11px] font-bold text-red-700 font-mono">
                {plant.alert_count} alert{plant.alert_count !== 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} />
              <span className="text-[11px] font-semibold text-emerald-700">All clear</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
