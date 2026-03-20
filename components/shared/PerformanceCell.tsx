import { cn } from '@/lib/utils'

interface PerformanceCellProps {
  score: number | null
}

function getCellStyle(score: number | null): string {
  if (score === null || score === undefined) return 'bg-gray-100 text-gray-400'
  if (score >= 90) return ''
  if (score >= 75) return 'bg-yellow-100 text-yellow-800 font-semibold'
  if (score >= 50) return 'bg-orange-200 text-orange-900 font-bold'
  if (score >= 25) return 'bg-red-200 text-red-900 font-bold'
  if (score > 0) return 'bg-red-400 text-white font-bold'
  return 'bg-red-500 text-white font-bold'
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
