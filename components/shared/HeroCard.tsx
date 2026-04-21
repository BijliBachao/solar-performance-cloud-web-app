'use client'

import { Zap, TrendingUp, TrendingDown, Activity, Sun } from 'lucide-react'
import { Sparkline } from './Sparkline'
import { cn } from '@/lib/utils'

interface HeroCardProps {
  livePowerKw: number
  capacityKw: number
  sparkline: number[]
  deltaPercent: number | null
  deltaContext?: string | null
  totalPlants: number
  healthyPlants: number
  producingPlants: number
  isLive: boolean
}

/**
 * SPC HeroCard — the featured "Live Fleet Power" widget.
 * Stripe-style multi-layer shadow, solar-gold gradient top accent,
 * inline sparkline, delta indicator, and fleet context stats.
 */
export function HeroCard({
  livePowerKw,
  capacityKw,
  sparkline,
  deltaPercent,
  deltaContext,
  totalPlants,
  healthyPlants: _healthyPlants,
  producingPlants,
  isLive,
}: HeroCardProps) {
  const utilization = capacityKw > 0 ? Math.round((livePowerKw / capacityKw) * 100) : 0
  const hasDelta =
    deltaPercent !== null && deltaPercent !== undefined && !isNaN(deltaPercent) && deltaPercent !== 0
  const isPositive = (deltaPercent ?? 0) >= 0

  return (
    <div className="relative bg-white rounded-lg border border-slate-200 overflow-hidden shadow-featured">
      {/* Gradient top accent — solar gold */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-solar-gold-400 via-solar-gold-500 to-solar-gold-600" />

      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* LEFT: Label + Value + Delta */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="h-3.5 w-3.5 text-solar-gold-600" strokeWidth={2} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Live Fleet Power
              </span>
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  LIVE
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-mono font-bold tracking-tight text-slate-900 leading-none">
                {livePowerKw.toFixed(1)}
              </span>
              <span className="text-xl font-mono font-semibold text-slate-500">kW</span>
            </div>

            {hasDelta ? (
              <div className="flex items-center gap-1.5">
                {isPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" strokeWidth={2.5} />
                )}
                <span
                  className={cn(
                    'text-xs font-bold font-mono',
                    isPositive ? 'text-emerald-700' : 'text-red-700',
                  )}
                >
                  {isPositive ? '+' : ''}
                  {(deltaPercent ?? 0).toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500">
                  {deltaContext || 'vs same hour yesterday'}
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Gathering comparison data…</span>
            )}
          </div>

          {/* RIGHT: Sparkline */}
          <div className="flex-1 min-w-0 lg:max-w-md">
            <Sparkline data={sparkline} variant="area" color="#F59E0B" height={72} />
            <div className="flex justify-between text-[9px] font-mono font-semibold text-slate-400 mt-1 px-1">
              <span>24h ago</span>
              <span>NOW</span>
            </div>
          </div>
        </div>

        {/* Footer stats row */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 mt-4 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-solar-gold-50">
              <Zap className="h-3 w-3 text-solar-gold-600" strokeWidth={2} />
            </div>
            <span className="text-slate-600">
              <span className="font-mono font-bold text-slate-900">{capacityKw.toFixed(1)}</span>
              <span className="text-slate-400 ml-1">kW</span>
              <span className="ml-1">capacity</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-emerald-50">
              <Activity className="h-3 w-3 text-emerald-600" strokeWidth={2} />
            </div>
            <span className="text-slate-600">
              <span className="font-mono font-bold text-slate-900">{utilization}%</span>
              <span className="ml-1">utilization</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600">
              <span className="font-mono font-bold text-slate-900">{producingPlants}</span>
              <span className="text-slate-400 mx-1">/</span>
              <span className="font-mono font-semibold text-slate-500">{totalPlants}</span>
              <span className="ml-1">producing</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
