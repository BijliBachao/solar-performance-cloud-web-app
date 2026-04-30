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
  gap_percent: number | null
  status: StringStatus
  energy_kwh?: number
  peer_excluded?: boolean
}

interface StringHealthMatrixProps {
  strings: StringData[]
  avgCurrent: number
}

/**
 * Dense per-string grid. Each cell shows three rows of data:
 *   1. String number (mono) + status dot
 *   2. Current (big mono) — the primary health signal
 *   3. Voltage (secondary, smaller) · deviation vs inverter avg
 *
 * Tooltip supplements with power + kWh + full status label.
 * Cell tint + dot come from STATUS_STYLES so colors always match
 * the rest of the app.
 */
export function StringHealthMatrix({ strings, avgCurrent }: StringHealthMatrixProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
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
                    'relative border rounded-sm px-2 py-2 cursor-default transition-all hover:shadow-card hover:border-slate-300',
                    // Peer-excluded cells use an indigo tint to distinguish them
                    // from healthy/warning/critical (status-based) cells. The
                    // string is producing energy, just not peer-comparable.
                    // Colors come from STATUS_STYLES['peer-excluded'] (single source).
                    s.peer_excluded ? STATUS_STYLES['peer-excluded'].bg : style.bg,
                    s.peer_excluded ? STATUS_STYLES['peer-excluded'].border : style.border,
                  )}
                >
                  {/* Row 1 — String number + status dot.
                      Peer-excluded shows an indigo dot regardless of underlying
                      status (unless DISCONNECTED/OPEN_CIRCUIT, in which case
                      that fault still wins so the cell stays urgent). */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      PV{s.string_number}
                    </span>
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        s.peer_excluded && s.status === 'NORMAL'
                          ? STATUS_STYLES['peer-excluded'].dot
                          : style.dot,
                      )}
                    />
                  </div>

                  {/* Row 2 — Primary reading (current) */}
                  <div className={cn('text-[15px] font-mono font-bold leading-none', style.fg)}>
                    {s.current > 0 ? s.current.toFixed(2) : '0.00'}
                    <span className="text-[10px] font-semibold text-slate-500 ml-0.5">A</span>
                  </div>

                  {/* Row 3 — Voltage + deviation */}
                  <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                    <span className="text-slate-500">
                      {s.voltage > 0 ? s.voltage.toFixed(0) : '0'}
                      <span className="text-slate-400 ml-0.5">V</span>
                    </span>
                    <span
                      className={cn(
                        'font-semibold',
                        s.status === 'OPEN_CIRCUIT' || s.status === 'OFFLINE'
                          ? 'text-slate-400'
                          : 'text-slate-500',
                      )}
                    >
                      {s.status === 'OPEN_CIRCUIT'
                        ? '0 A'
                        : s.status === 'OFFLINE'
                          ? 'Offline'
                          : deviationStr}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1 font-mono min-w-[160px]">
                  <p className="font-bold text-sm flex items-center justify-between border-b border-slate-100 pb-1 mb-1">
                    <span>PV{s.string_number}</span>
                    {s.peer_excluded && s.status === 'NORMAL' ? (
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        STATUS_STYLES['peer-excluded'].fg,
                      )}>
                        {STATUS_STYLES['peer-excluded'].label}
                      </span>
                    ) : (
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', style.fg)}>
                        {statusLabel(s.status)}
                      </span>
                    )}
                  </p>
                  <div className="flex justify-between">
                    <span className="text-slate-500">V (operating)</span>
                    <span>{s.voltage.toFixed(1)} V</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">I (operating)</span>
                    <span>{s.current.toFixed(2)} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">P</span>
                    <span>{(s.power / 1000).toFixed(2)} kW</span>
                  </div>
                  {s.energy_kwh != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Today</span>
                      <span>{s.energy_kwh.toFixed(2)} kWh</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gap</span>
                    <span>
                      {s.peer_excluded || s.gap_percent == null
                        ? '— (peer-excluded)'
                        : `${s.gap_percent.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

function statusLabel(status: StringStatus): string {
  switch (status) {
    case 'NORMAL': return 'Healthy'
    case 'WARNING': return 'Underperforming'
    case 'CRITICAL': return 'Major Loss'
    case 'OPEN_CIRCUIT': return '0 A Fault'
    case 'OFFLINE': return 'Offline'
  }
}
