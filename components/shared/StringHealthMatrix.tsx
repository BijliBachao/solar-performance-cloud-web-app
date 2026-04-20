'use client'

import { cn } from '@/lib/utils'
import { type StringStatus } from '@/lib/string-health'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  STATUS_STYLES,
  statusKeyFromStringStatus,
} from '@/lib/design-tokens'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: StringStatus
  energy_kwh?: number
}

interface StringHealthMatrixProps {
  strings: StringData[]
  avgCurrent: number
}

export function StringHealthMatrix({ strings, avgCurrent }: StringHealthMatrixProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {strings.map((s) => {
          const style = STATUS_STYLES[statusKeyFromStringStatus(s.status)]
          const deviation = avgCurrent > 0
            ? ((s.current - avgCurrent) / avgCurrent) * 100
            : 0
          const deviationStr = deviation >= 0
            ? `+${deviation.toFixed(1)}%`
            : `${deviation.toFixed(1)}%`

          return (
            <Tooltip key={s.string_number}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'relative border rounded-sm p-2.5 cursor-default transition-all hover:shadow-card',
                    style.bg,
                    style.border,
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-600">
                      PV{s.string_number}
                    </span>
                    <span className={cn('w-2 h-2 rounded-full', style.dot)} />
                  </div>
                  <div className={cn('text-base font-mono font-bold leading-tight', style.fg)}>
                    {s.current > 0 ? `${s.current.toFixed(1)}A` : '0A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {s.status === 'OPEN_CIRCUIT'
                      ? 'Open Circuit'
                      : s.status === 'DISCONNECTED'
                        ? 'No Signal'
                        : deviationStr}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1 font-mono">
                  <p className="font-bold text-sm">PV{s.string_number}</p>
                  <p>Voltage: {s.voltage.toFixed(1)} V</p>
                  <p>Current: {s.current.toFixed(2)} A</p>
                  <p>Power: {(s.power / 1000).toFixed(2)} kW</p>
                  {s.energy_kwh != null && <p>Energy: {s.energy_kwh.toFixed(2)} kWh</p>}
                  <p>Gap: {s.gap_percent.toFixed(1)}%</p>
                  <p>Status: {s.status}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
