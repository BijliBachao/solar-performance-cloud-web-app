'use client'

import { cn } from '@/lib/utils'
import { GAP_CRITICAL, GAP_INFO, type StringStatus } from '@/lib/string-health'
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

interface StringComparisonTableProps {
  strings: StringData[]
}

/**
 * Industrial string comparison table — DESIGN.md §13 compliant.
 *   - Uppercase eyebrow headers (10px, slate-400, unit hint line under)
 *   - Tabular-mono numbers, right-aligned for numeric columns
 *   - Thin slate-100 row dividers, no heavy borders
 *   - Row hover: slate-50 wash confirms interactivity
 *   - Status column: colored dot + label pill from STATUS_STYLES
 *   - Gap % inline bar viz for quick visual deviation scanning
 *   - Dense row (~32px) so 19+ strings fit without scroll on laptop
 */

const ROW_TINT: Record<StringStatus, string> = {
  NORMAL: '',
  WARNING: 'bg-amber-50/40',
  CRITICAL: 'bg-red-50/40',
  OPEN_CIRCUIT: 'bg-violet-50/60',
  DISCONNECTED: 'bg-slate-50',
}

function gapColorClass(gap: number): string {
  if (gap > GAP_CRITICAL) return STATUS_STYLES.critical.fg
  if (gap > GAP_INFO) return STATUS_STYLES.warning.fg
  return STATUS_STYLES.healthy.fg
}

function gapBarColor(gap: number): string {
  if (gap > GAP_CRITICAL) return 'bg-red-500'
  if (gap > GAP_INFO) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function StringComparisonTable({ strings }: StringComparisonTableProps) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <table className="w-full text-[12px]">
        {/* ── Eyebrow header ────────────────────────────────────── */}
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">String</div>
            </th>
            <th className="px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Voltage</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">V</div>
            </th>
            <th className="px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">A</div>
            </th>
            <th className="px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Power</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">W</div>
            </th>
            <th className="px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">kWh</div>
            </th>
            <th className="px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Gap</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">%</div>
            </th>
            <th className="px-3 py-2 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</div>
            </th>
          </tr>
        </thead>

        {/* ── Rows ───────────────────────────────────────────────── */}
        <tbody className="divide-y divide-slate-100">
          {strings.map((s) => {
            const key = statusKeyFromStringStatus(s.status)
            const style = STATUS_STYLES[key]
            const gap = Math.max(0, Math.min(100, Math.abs(s.gap_percent)))
            return (
              <tr
                key={s.string_number}
                className={cn(
                  'transition-colors hover:bg-slate-50',
                  ROW_TINT[s.status],
                )}
              >
                {/* String identifier */}
                <td className="px-3 py-2 font-mono font-bold text-slate-900">
                  PV{s.string_number}
                </td>

                {/* Numeric columns — right-aligned, tabular mono */}
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {s.voltage.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {s.current.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {s.power.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {s.energy_kwh != null ? s.energy_kwh.toFixed(1) : '—'}
                </td>

                {/* Gap % — number + inline deviation bar */}
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all', gapBarColor(s.gap_percent))}
                        style={{ width: `${gap}%` }}
                      />
                    </div>
                    <span className={cn('font-mono font-semibold w-12 text-right', gapColorClass(s.gap_percent))}>
                      {s.gap_percent.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* Status pill — dot + label from STATUS_STYLES */}
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
                      style.fg,
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                    {style.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
