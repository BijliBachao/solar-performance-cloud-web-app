import { cn } from '@/lib/utils'
import { HEALTH_HEALTHY, HEALTH_WARNING, HEALTH_CAUTION, HEALTH_SEVERE } from '@/lib/string-health'

interface PerformanceCellProps {
  score: number | null
}

function getCellStyle(score: number | null): string {
  if (score === null || score === undefined) return 'bg-gray-100 text-gray-400'
  if (score >= HEALTH_HEALTHY) return ''
  if (score >= HEALTH_CAUTION) return 'bg-yellow-100 text-yellow-800 font-semibold'
  if (score >= HEALTH_WARNING) return 'bg-orange-200 text-orange-900 font-bold'
  if (score >= HEALTH_SEVERE) return 'bg-red-200 text-red-900 font-bold'
  return 'bg-red-400 text-white font-bold'
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
