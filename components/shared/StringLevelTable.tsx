'use client'

import { PerformanceCell } from './PerformanceCell'
import { cn } from '@/lib/utils'
import { HEALTH_HEALTHY, HEALTH_CAUTION, HEALTH_WARNING } from '@/lib/string-health'

interface StringRow {
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  string_number: number
  mppt: number
  kw_per_string: number | null
  perf_avg: number | null
  avail_avg: number | null
  energy_kwh: number | null
  scores: Record<string, number | null>
  type?: 'active' | 'inactive' | 'unused'
}

interface StringLevelTableProps {
  dates: string[]
  rows: StringRow[]
  loading?: boolean
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function metricCell(value: number | null, type: 'perf' | 'avail'): string {
  if (value === null) return 'text-gray-400'
  if (value >= HEALTH_HEALTHY) return 'text-emerald-600 font-medium'
  if (value >= HEALTH_CAUTION) return 'text-yellow-700 font-medium'
  if (value >= HEALTH_WARNING) return 'text-orange-600 font-semibold'
  return 'text-red-600 font-bold'
}

export function StringLevelTable({ dates, rows, loading }: StringLevelTableProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No string data available for the selected period.
      </div>
    )
  }

  const activeRows = rows.filter(r => r.type === 'active' || !r.type)
  const inactiveRows = rows.filter(r => r.type === 'inactive')
  const unusedRows = rows.filter(r => r.type === 'unused')

  let prevDeviceId = ''

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[140px]">
              Inverter
            </th>
            <th className="sticky left-[140px] z-20 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[64px]">
              MPPT
            </th>
            <th className="sticky left-[204px] z-20 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[60px]">
              String
            </th>
            <th className="px-2 py-2 text-center text-xs font-semibold text-blue-700 border-r border-gray-200 min-w-[52px] bg-blue-50/50">
              Perf
            </th>
            <th className="px-2 py-2 text-center text-xs font-semibold text-violet-700 border-r border-gray-200 min-w-[52px] bg-violet-50/50">
              Avail
            </th>
            <th className="px-2 py-2 text-center text-xs font-semibold text-emerald-700 border-r border-gray-200 min-w-[60px] bg-emerald-50/50">
              kWh
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
          {/* Active strings */}
          {activeRows.map((row, idx) => {
            const showDivider = row.device_id !== prevDeviceId && idx > 0
            prevDeviceId = row.device_id

            return (
              <tr
                key={`${row.device_id}-${row.string_number}`}
                className={cn(
                  'group hover:bg-blue-50/50 transition-colors',
                  showDivider && 'border-t-2 border-gray-300'
                )}
              >
                <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-1.5 text-xs text-gray-700 border-r border-gray-200 whitespace-nowrap transition-colors">
                  <div className="font-medium text-gray-900">{row.device_name}</div>
                  {row.string_number === 1 && (
                    <div className="text-[10px] text-gray-400">{row.plant_name}</div>
                  )}
                </td>
                <td className="sticky left-[140px] z-10 bg-white group-hover:bg-blue-50/50 px-2 py-1.5 text-xs text-gray-600 border-r border-gray-200 transition-colors">
                  MPPT{row.mppt}
                </td>
                <td className="sticky left-[204px] z-10 bg-white group-hover:bg-blue-50/50 px-2 py-1.5 text-xs font-medium text-gray-900 border-r border-gray-200 transition-colors">
                  PV{row.string_number}
                </td>
                <td className={cn('px-2 py-1.5 text-center text-xs font-mono border-r border-gray-200 bg-blue-50/30', metricCell(row.perf_avg, 'perf'))}>
                  {row.perf_avg !== null ? `${row.perf_avg}%` : '—'}
                </td>
                <td className={cn('px-2 py-1.5 text-center text-xs font-mono border-r border-gray-200 bg-violet-50/30', metricCell(row.avail_avg, 'avail'))}>
                  {row.avail_avg !== null ? `${row.avail_avg}%` : '—'}
                </td>
                <td className="px-2 py-1.5 text-center text-xs font-mono font-semibold border-r border-gray-200 bg-emerald-50/30 text-emerald-700">
                  {row.energy_kwh !== null ? row.energy_kwh.toFixed(1) : '—'}
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

          {/* Inactive / Stopped Producing section */}
          {inactiveRows.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={6 + dates.length}
                  className="bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 border-t-2 border-amber-300"
                >
                  Stopped Producing ({inactiveRows.length}) — these strings had data before but stopped. Inspect for faults.
                </td>
              </tr>
              {inactiveRows.map((row) => (
                <tr
                  key={`inactive-${row.device_id}-${row.string_number}`}
                  className="bg-amber-50/30"
                >
                  <td className="sticky left-0 z-10 bg-amber-50/50 px-3 py-1 text-xs text-amber-700 border-r border-gray-200 whitespace-nowrap">
                    {row.device_name}
                  </td>
                  <td className="sticky left-[140px] z-10 bg-amber-50/50 px-2 py-1 text-xs text-amber-600 border-r border-gray-200">
                    MPPT{row.mppt}
                  </td>
                  <td className="sticky left-[204px] z-10 bg-amber-50/50 px-2 py-1 text-xs font-medium text-amber-700 border-r border-gray-200">
                    PV{row.string_number}
                  </td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-gray-200 bg-amber-50/30">—</td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-gray-200 bg-amber-50/30">—</td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-gray-200 bg-amber-50/30">—</td>
                  {dates.map((date) => (
                    <td
                      key={date}
                      className="px-2 py-1 text-center text-xs text-amber-400 border-r border-gray-100 bg-amber-50/30"
                    >
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {/* Unused / Spare Ports section */}
          {unusedRows.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={6 + dates.length}
                  className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 border-t-2 border-gray-300"
                >
                  Unused / Spare Ports ({unusedRows.length})
                </td>
              </tr>
              {unusedRows.map((row) => (
                <tr
                  key={`unused-${row.device_id}-${row.string_number}`}
                  className="bg-gray-50/50"
                >
                  <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1 text-xs text-gray-400 border-r border-gray-200 whitespace-nowrap">
                    {row.device_name}
                  </td>
                  <td className="sticky left-[140px] z-10 bg-gray-50 px-2 py-1 text-xs text-gray-400 border-r border-gray-200">
                    MPPT{row.mppt}
                  </td>
                  <td className="sticky left-[204px] z-10 bg-gray-50 px-2 py-1 text-xs text-gray-400 border-r border-gray-200">
                    PV{row.string_number}
                  </td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-gray-200 bg-gray-50/50">—</td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-gray-200 bg-gray-50/50">—</td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-gray-200 bg-gray-50/50">—</td>
                  {dates.map((date) => (
                    <td
                      key={date}
                      className="px-2 py-1 text-center text-xs text-gray-300 border-r border-gray-100 bg-gray-50/50"
                    >
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
