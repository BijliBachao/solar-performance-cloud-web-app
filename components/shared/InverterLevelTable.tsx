'use client'

import { PerformanceCell } from './PerformanceCell'
import { cn } from '@/lib/utils'

interface InverterRow {
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  kw: number | null
  scores: Record<string, number | null>
}

interface InverterLevelTableProps {
  dates: string[]
  rows: InverterRow[]
  loading?: boolean
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function InverterLevelTable({ dates, rows, loading }: InverterLevelTableProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No inverter data available for the selected period.
      </div>
    )
  }

  // Track plant boundaries for visual grouping
  let prevPlantId = ''

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[160px]">
              Plant
            </th>
            <th className="sticky left-[160px] z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[140px]">
              Inverter
            </th>
            <th className="sticky left-[300px] z-20 bg-gray-50 px-2 py-2 text-right text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[90px]">
              kW/Inverter
            </th>
            {dates.map((date) => (
              <th
                key={date}
                className="px-2 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 min-w-[64px] whitespace-nowrap"
              >
                {formatDateHeader(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const showDivider = row.plant_id !== prevPlantId && idx > 0
            prevPlantId = row.plant_id

            return (
              <tr
                key={row.device_id}
                className={cn(
                  'group hover:bg-blue-50/50 transition-colors',
                  showDivider && 'border-t-2 border-gray-300'
                )}
              >
                <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-1.5 text-xs border-r border-gray-200 whitespace-nowrap transition-colors">
                  <span className="font-medium text-gray-900">{row.plant_name}</span>
                </td>
                <td className="sticky left-[160px] z-10 bg-white group-hover:bg-blue-50/50 px-3 py-1.5 text-xs text-gray-700 border-r border-gray-200 whitespace-nowrap transition-colors">
                  {row.device_name}
                </td>
                <td className="sticky left-[300px] z-10 bg-white group-hover:bg-blue-50/50 px-2 py-1.5 text-xs text-gray-600 text-right border-r border-gray-200 transition-colors">
                  {row.kw ? `${row.kw} kW` : '—'}
                </td>
                {dates.map((date) => (
                  <PerformanceCell
                    key={date}
                    score={row.scores[date]}
                  />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
