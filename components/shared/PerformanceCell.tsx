import { cn } from '@/lib/utils'
import { perfBandStyleFromScore } from '@/lib/design-tokens'

interface PerformanceCellProps {
  score: number | null
}

// 5 V1 bands as 5 colours, via the central design-tokens map keyed off
// classifyStringPerformance: Normal=green (clean), Watch=yellow,
// Underperforming=orange, Serious Fault=red, Dead=dark/grey, no-data=muted.
// The donut/NOC roll the same classifier up to 3 arcs — ONE source of truth.
function getCellStyle(score: number | null): string {
  return perfBandStyleFromScore(score).cell
}

function formatScore(score: number | null): string {
  if (score === null || score === undefined) return '—'
  return `${Math.round(score)}%`
}

export function PerformanceCell({ score }: PerformanceCellProps) {
  return (
    <td
      className={cn(
        'px-2 py-1.5 text-center text-xs font-mono whitespace-nowrap border-r border-gray-100',
        getCellStyle(score)
      )}
    >
      {formatScore(score)}
    </td>
  )
}
