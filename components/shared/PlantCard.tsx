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

/**
 * SPC PlantCard — v3 Solar Corporate (DESIGN.md §12.3).
 * White card with left accent stripe (status color), slate-200 border.
 * Hover: border → solar-gold + subtle shadow lift.
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
  }
  basePath?: string
}

const LEFT_ACCENT_BY_STATUS = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  offline: 'bg-slate-400',
  'open-circuit': 'bg-violet-500',
  info: 'bg-blue-500',
}

export function PlantCard({ plant, basePath = '/dashboard/plants' }: PlantCardProps) {
  const router = useRouter()
  const statusKey = statusKeyFromPlantHealth(plant.health_state)
  const statusStyle = STATUS_STYLES[statusKey]
  const providerMeta = providerBadge(plant.provider)
  const leftAccent = LEFT_ACCENT_BY_STATUS[statusKey]

  return (
    <div
      onClick={() => router.push(`${basePath}/${plant.id}`)}
      className="relative bg-white rounded-md border border-slate-200 overflow-hidden cursor-pointer group hover:border-solar-gold hover:shadow-card transition-all"
    >
      {/* Left accent stripe — full height, 3px */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', leftAccent)} />

      <div className="p-4 pl-5">
        {/* Header row: plant name + provider badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-solar-gold-700 transition-colors">
              {plant.plant_name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider',
                  statusStyle.fg,
                )}
              >
                {plantHealthLabel(plant.health_state)}
              </span>
              {plant.capacity_kw && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-[11px] font-mono font-semibold text-slate-700">
                    {Number(plant.capacity_kw).toFixed(1)} kW
                  </span>
                </>
              )}
            </div>
          </div>
          {providerMeta && (
            <span
              className={cn(
                'shrink-0 inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border',
                providerMeta.bg,
                providerMeta.fg,
                providerMeta.border,
              )}
            >
              {providerMeta.label}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
              <span className="text-[11px] text-slate-500">
                <span className="font-mono font-semibold text-slate-900">
                  {plant.device_count}
                </span>{' '}
                inverter{plant.device_count !== 1 ? 's' : ''}
              </span>
            </div>
            {plant.alert_count > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" strokeWidth={2} />
                <span className="text-[11px] font-bold text-red-700 font-mono">
                  {plant.alert_count}
                </span>
              </div>
            )}
            {plant.alert_count === 0 && (
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} />
                <span className="text-[11px] font-semibold text-emerald-700">
                  All clear
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
