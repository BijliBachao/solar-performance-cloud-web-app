'use client'

import { useState } from 'react'
import { StringCellDetail } from './StringCellDetail'
import { cn } from '@/lib/utils'
import { STATUS_STYLES, perfBandStyleFromScore, completenessStyleFromPct } from '@/lib/design-tokens'
import { providerLabel } from '@/lib/constants'

// ── Clickable performance cell ─────────────────────────────────────────────
// Wraps the existing cell-styling logic in a <td><button> so the daily score
// is both visually correct AND a drill-down trigger. Keyboard-focusable.

// 5 V1 bands as 5 colours, via the central design-tokens map keyed off
// classifyStringPerformance: Normal=green (clean), Watch=yellow,
// Underperforming=orange, Serious Fault=red, Dead=dark/grey, no-data=muted.
// The donut/NOC roll the same classifier up to 3 arcs — ONE source of truth.
function getCellStyle(score: number | null): string {
  return perfBandStyleFromScore(score).cell
}

interface ClickablePerformanceCellProps {
  score: number | null
  onClick: () => void
}

function ClickablePerformanceCell({ score, onClick }: ClickablePerformanceCellProps) {
  const display = score !== null && score !== undefined ? `${Math.round(score)}%` : '—'
  return (
    <td className="px-0 py-0 text-center text-xs tabular-nums whitespace-nowrap border-r border-hairline">
      <button
        type="button"
        onClick={onClick}
        title="Click to see how this score was computed"
        className={cn(
          'w-full h-full px-2 py-1.5 text-xs tabular-nums focus:outline-none focus:shadow-focus focus:relative',
          'hover:brightness-95 transition-[filter] cursor-pointer',
          getCellStyle(score),
        )}
      >
        {display}
      </button>
    </td>
  )
}

interface StringRow {
  plant_id: string
  plant_name: string
  device_id: string
  device_name: string
  /** Inverter brand (huawei|solis|growatt|sungrow|csi) — shown as a chip. */
  provider?: string | null
  /** Inverter model string, if known — shown in the chip tooltip. */
  model?: string | null
  string_number: number
  group: string
  kw_per_string: number | null
  perf_avg: number | null
  /** Avg Data Completeness % (received ÷ 96) over the range — Reyyan §9, own column. */
  compl_avg?: number | null
  energy_kwh: number | null
  scores: Record<string, number | null>
  type?: 'active' | 'inactive' | 'unused'
  /** False when the string has no admin-entered panel_count (scoring used the default). */
  panel_count_set?: boolean
  /**
   * Admin flag: non-standard orientation/shade — excluded from peer comparison,
   * so its stored P2P health_score is NULL and the daily cells render blank.
   * We surface a "Non-standard" chip so the blank cells aren't read as "OK".
   */
  peer_excluded?: boolean
}

interface StringLevelTableProps {
  dates: string[]
  rows: StringRow[]
  loading?: boolean
  /** API path for the cell drill-down endpoint.
   *  Dashboard: /api/dashboard/analysis/string-cell (default)
   *  Admin:     /api/admin/analysis/string-cell
   */
  cellApiPath?: string
  /** Admin context — forwarded to the drill-down so it can surface §6 raw-%
   *  sensor-fault visibility. The dashboard (customer) mount leaves this false. */
  isAdmin?: boolean
}

interface CellSelection {
  deviceId: string
  stringNumber: number
  date: string
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// 5 V1 bands as 5 distinct COLOURED CHIPS via the central map (same classifier +
// background-wash as the daily cells): Normal=green, Watch=yellow, Underperforming=
// orange, Serious Fault=red, Dead=dark slate, no-data=muted. We use the background
// wash (`.cell`), not the text-only `.fg` — on white, Watch's dark-yellow text read
// as black and Underperforming's dark-orange read as red, collapsing the column to
// green/red/black. Normal has an empty `.cell` → give it a clean green wash here.
function metricCell(value: number | null): string {
  if (value === null) return 'text-gray-400'
  return perfBandStyleFromScore(value).cell || 'bg-emerald-50 text-emerald-800 font-semibold'
}

export function StringLevelTable({
  dates,
  rows,
  loading,
  cellApiPath = '/api/dashboard/analysis/string-cell',
  isAdmin = false,
}: StringLevelTableProps) {
  const [selected, setSelected] = useState<CellSelection | null>(null)

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
      <div className="text-center text-ink-mute py-12">
        No string data available for the selected period.
      </div>
    )
  }

  const activeRows = rows.filter(r => r.type === 'active' || !r.type)
  const inactiveRows = rows.filter(r => r.type === 'inactive')
  const unusedRows = rows.filter(r => r.type === 'unused')

  let prevDeviceId = ''

  return (
    <>
      {/* Drill-down panel — rendered as a sibling; fixed positioning keeps it above the table */}
      {selected && (
        <StringCellDetail
          apiPath={cellApiPath}
          deviceId={selected.deviceId}
          stringNumber={selected.stringNumber}
          date={selected.date}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
        />
      )}

    <div className="overflow-x-auto border border-hairline rounded-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-canvas-soft border-b border-hairline">
            <th className="sticky left-0 z-20 bg-canvas-soft px-3 py-2 text-left text-xs font-medium text-ink-secondary border-r border-hairline min-w-[140px]">
              Inverter
            </th>
            <th className="sticky left-[140px] z-20 bg-canvas-soft px-2 py-2 text-left text-xs font-medium text-ink-secondary border-r border-hairline min-w-[64px]">
              Group
            </th>
            <th className="sticky left-[204px] z-20 bg-canvas-soft px-2 py-2 text-left text-xs font-medium text-ink-secondary border-r border-hairline min-w-[60px]">
              String
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-blue-700 border-r border-hairline min-w-[52px] bg-blue-50/50">
              Perf
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-sky-700 border-r border-hairline min-w-[56px] bg-sky-50/50" title="Data Completeness — readings received ÷ 96 expected (a data-quality measure, kept separate from performance)">
              Data&nbsp;%
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-emerald-700 border-r border-hairline min-w-[60px] bg-emerald-50/50">
              kWh
            </th>
            {dates.map((date) => (
              <th
                key={date}
                className="px-2 py-2 text-center text-xs font-medium text-ink-secondary border-r border-hairline min-w-[64px] whitespace-nowrap"
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
            const isFirstOfDevice = idx === 0 || activeRows[idx - 1].device_id !== row.device_id
            prevDeviceId = row.device_id

            return (
              <tr
                key={`${row.device_id}-${row.string_number}`}
                className={cn(
                  'group hover:bg-blue-50/50 transition-colors',
                  showDivider && 'border-t-2 border-hairline'
                )}
              >
                <td className="sticky left-0 z-10 bg-canvas group-hover:bg-blue-50/50 px-3 py-1.5 text-xs text-ink-secondary border-r border-hairline whitespace-nowrap transition-colors">
                  <div className="font-medium text-ink flex items-center gap-1.5">
                    {row.device_name}
                    {isFirstOfDevice && row.provider && (
                      <span
                        title={row.model ? `${providerLabel(row.provider)} · ${row.model}` : providerLabel(row.provider)}
                        className="inline-flex items-center rounded border border-hairline bg-canvas-soft px-1 py-0.5 text-[9px] font-medium text-ink-secondary"
                      >
                        {providerLabel(row.provider)}
                      </span>
                    )}
                  </div>
                  {row.string_number === 1 && (
                    <div className="text-[10px] text-ink-mute">{row.plant_name}</div>
                  )}
                  {row.peer_excluded && (
                    <div className="mt-0.5">
                      <span
                        title={STATUS_STYLES['peer-excluded'].fullDesc}
                        className={cn(
                          'inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] font-medium',
                          STATUS_STYLES['peer-excluded'].fg,
                          STATUS_STYLES['peer-excluded'].bg,
                          STATUS_STYLES['peer-excluded'].border,
                        )}
                      >
                        <span className={cn('w-1 h-1 rounded-full', STATUS_STYLES['peer-excluded'].dot)} />
                        {STATUS_STYLES['peer-excluded'].label}
                      </span>
                    </div>
                  )}
                </td>
                <td className="sticky left-[140px] z-10 bg-canvas group-hover:bg-blue-50/50 px-2 py-1.5 text-xs text-ink-secondary border-r border-hairline transition-colors">
                  {row.group}
                </td>
                <td className="sticky left-[204px] z-10 bg-canvas group-hover:bg-blue-50/50 px-2 py-1.5 text-xs font-medium text-ink border-r border-hairline transition-colors">
                  PV{row.string_number}
                </td>
                <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums border-r border-hairline', metricCell(row.perf_avg))}>
                  {row.perf_avg !== null ? `${row.perf_avg}%` : '—'}
                </td>
                <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums border-r border-hairline bg-sky-50/30', row.compl_avg != null ? completenessStyleFromPct(row.compl_avg)?.fg ?? 'text-ink-mute' : 'text-ink-mute')}>
                  {row.compl_avg != null ? `${row.compl_avg}%` : '—'}
                </td>
                <td className="px-2 py-1.5 text-center text-xs tabular-nums font-medium border-r border-hairline bg-emerald-50/30 text-emerald-700">
                  {row.energy_kwh !== null ? row.energy_kwh.toFixed(1) : '—'}
                </td>
                {dates.map((date) => (
                  <ClickablePerformanceCell
                    key={date}
                    score={row.scores[date]}
                    onClick={() =>
                      setSelected({
                        deviceId: row.device_id,
                        stringNumber: row.string_number,
                        date,
                      })
                    }
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
                  <td className="sticky left-0 z-10 bg-amber-50/50 px-3 py-1 text-xs text-amber-700 border-r border-hairline whitespace-nowrap">
                    {row.device_name}
                  </td>
                  <td className="sticky left-[140px] z-10 bg-amber-50/50 px-2 py-1 text-xs text-amber-600 border-r border-hairline">
                    {row.group}
                  </td>
                  <td className="sticky left-[204px] z-10 bg-amber-50/50 px-2 py-1 text-xs font-medium text-amber-700 border-r border-hairline">
                    PV{row.string_number}
                  </td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-hairline bg-amber-50/30">—</td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-hairline bg-amber-50/30">—</td>
                  <td className="px-2 py-1 text-center text-xs text-amber-400 border-r border-hairline bg-amber-50/30">—</td>
                  {dates.map((date) => (
                    <td
                      key={date}
                      className="px-2 py-1 text-center text-xs text-amber-400 border-r border-hairline bg-amber-50/30"
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
                  className="bg-gray-100 px-3 py-2 text-xs font-medium text-gray-500 border-t-2 border-hairline"
                >
                  Unused / Spare Ports ({unusedRows.length})
                </td>
              </tr>
              {unusedRows.map((row) => (
                <tr
                  key={`unused-${row.device_id}-${row.string_number}`}
                  className="bg-gray-50/50"
                >
                  <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1 text-xs text-gray-400 border-r border-hairline whitespace-nowrap">
                    {row.device_name}
                  </td>
                  <td className="sticky left-[140px] z-10 bg-gray-50 px-2 py-1 text-xs text-gray-400 border-r border-hairline">
                    {row.group}
                  </td>
                  <td className="sticky left-[204px] z-10 bg-gray-50 px-2 py-1 text-xs text-gray-400 border-r border-hairline">
                    PV{row.string_number}
                  </td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-hairline bg-gray-50/50">—</td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-hairline bg-gray-50/50">—</td>
                  <td className="px-2 py-1 text-center text-xs text-gray-300 border-r border-hairline bg-gray-50/50">—</td>
                  {dates.map((date) => (
                    <td
                      key={date}
                      className="px-2 py-1 text-center text-xs text-gray-300 border-r border-hairline bg-gray-50/50"
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
    </>
  )
}
