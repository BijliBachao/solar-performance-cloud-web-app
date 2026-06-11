'use client'

import { Sun, Moon } from 'lucide-react'
import { useSunGate } from '@/lib/use-sun-gate'
import { cn } from '@/lib/utils'

interface SunElevationChipProps {
  /** Raw plant coords (Decimal/string/null). Omit for a regional reading. */
  latRaw?: unknown
  lngRaw?: unknown
  className?: string
}

/**
 * Compact, always-on sun-elevation readout (e.g. "☀ 23.4°"). Amber while the
 * sun is below the live-data gate, muted once it arms, "Night" below the
 * horizon. The tooltip carries the gate explanation (live data appears above
 * the threshold). Computes client-side and ticks every minute via useSunGate.
 */
export function SunElevationChip({ latRaw, lngRaw, className }: SunElevationChipProps) {
  const gate = useSunGate(latRaw, lngRaw)
  if (!gate) return null

  const { elevationDeg, thresholdDeg, armed, approximate } = gate
  const belowHorizon = elevationDeg < 0
  const scope = approximate ? 'Lahore-area' : 'At this plant'
  const title = belowHorizon
    ? `${scope}: the sun is below the horizon. Live string monitoring resumes after sunrise — readings appear once the sun rises above ${thresholdDeg}°.`
    : `${scope}: sun elevation ${elevationDeg.toFixed(1)}°. Live string monitoring is active once the sun rises above ${thresholdDeg}°.`

  return (
    <span
      title={title}
      className={cn(
        'hidden md:inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums select-none',
        armed ? 'text-slate-400' : 'text-amber-600',
        className,
      )}
    >
      {belowHorizon ? (
        <Moon className="w-3.5 h-3.5" strokeWidth={2} />
      ) : (
        <Sun className="w-3.5 h-3.5" strokeWidth={2} />
      )}
      {belowHorizon ? 'Night' : `${elevationDeg.toFixed(1)}°`}
    </span>
  )
}
