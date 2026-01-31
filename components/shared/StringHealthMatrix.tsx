'use client'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE'
}

interface StringHealthMatrixProps {
  strings: StringData[]
  avgCurrent: number
}

const statusConfig = {
  OK: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    glow: 'ring-emerald-100',
    dot: 'bg-emerald-500',
  },
  WARNING: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    glow: 'ring-amber-100',
    dot: 'bg-amber-500',
  },
  CRITICAL: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    glow: 'ring-red-100',
    dot: 'bg-red-500',
  },
  OFFLINE: {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-400',
    glow: 'ring-gray-100',
    dot: 'bg-gray-300',
  },
}

export function StringHealthMatrix({ strings, avgCurrent }: StringHealthMatrixProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {strings.map((s) => {
          const config = statusConfig[s.status]
          const deviation = avgCurrent > 0
            ? ((s.current - avgCurrent) / avgCurrent) * 100
            : 0
          const deviationStr = deviation >= 0 ? `+${deviation.toFixed(1)}%` : `${deviation.toFixed(1)}%`

          return (
            <Tooltip key={s.string_number}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'relative border rounded-lg p-2.5 cursor-default transition-all hover:ring-2',
                    config.bg,
                    config.glow,
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-600">
                      PV{s.string_number}
                    </span>
                    <span className={cn('w-2 h-2 rounded-full', config.dot)} />
                  </div>
                  <div className={cn('text-base font-bold leading-tight', config.text)}>
                    {s.status === 'OFFLINE' ? '0A' : `${s.current.toFixed(1)}A`}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {s.status === 'OFFLINE' ? 'Offline' : deviationStr}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1">
                  <p className="font-semibold">PV{s.string_number}</p>
                  <p>Voltage: {s.voltage.toFixed(1)} V</p>
                  <p>Current: {s.current.toFixed(2)} A</p>
                  <p>Power: {(s.power / 1000).toFixed(2)} kW</p>
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
