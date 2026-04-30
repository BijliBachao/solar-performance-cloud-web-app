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
  gap_percent: number | null
  status: StringStatus
  energy_kwh?: number
  peer_excluded?: boolean
  config?: {
    panel_count: number | null
    panel_make: string | null
    panel_rating_w: number | null
    nameplate_w: number | null
  } | null
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
  OPEN_CIRCUIT: 'bg-rose-50/60',
  OFFLINE: 'bg-slate-50',
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
            <th className="px-3 py-2 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Panels</div>
              <div className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">count × W</div>
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
            // Peer-excluded strings are not gap-comparable — gap_percent is null
            // from the API. Treat as 0 for the bar (which we hide anyway) so the
            // numeric path stays type-safe.
            const gapNum = s.gap_percent ?? 0
            const gap = Math.max(0, Math.min(100, Math.abs(gapNum)))
            return (
              <tr
                key={s.string_number}
                className={cn(
                  'transition-colors hover:bg-slate-50',
                  // Peer-excluded rows skip the red/amber tint — they're not
                  // peer-comparable, so a "below peers" tint would be misleading.
                  // Tint comes from STATUS_STYLES['peer-excluded'] (single source).
                  s.peer_excluded ? STATUS_STYLES['peer-excluded'].bg : ROW_TINT[s.status],
                )}
              >
                {/* String identifier */}
                <td className="px-3 py-2 font-mono font-bold text-slate-900">
                  PV{s.string_number}
                </td>

                {/* Panel config (read-only) */}
                <td className="px-3 py-2">
                  {s.config?.panel_count ? (
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-mono font-semibold text-slate-700">
                        {s.config.panel_count}
                        {s.config.panel_rating_w ? ` × ${s.config.panel_rating_w}W` : ''}
                        {s.config.nameplate_w
                          ? ` · ${(s.config.nameplate_w / 1000).toFixed(2)} kWp`
                          : ''}
                      </span>
                      {s.config.panel_make && (
                        <span className="text-[9px] text-slate-400">{s.config.panel_make}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 italic">Not configured</span>
                  )}
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

                {/* Gap % — number + inline deviation bar.
                    Peer-excluded strings show "—" since they're not in the peer
                    pool (non-standard orientation/shaded — comparison is unfair). */}
                <td className="px-3 py-2 text-right">
                  {s.peer_excluded ? (
                    <span className="font-mono text-slate-300">—</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full transition-all', gapBarColor(gapNum))}
                          style={{ width: `${gap}%` }}
                        />
                      </div>
                      <span className={cn('font-mono font-semibold w-12 text-right', gapColorClass(gapNum))}>
                        {gapNum.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </td>

                {/* Status pill — dot + label. Peer-excluded shows a distinct
                    "non-standard" pill so users know the row is intentionally
                    out of the peer pool (not a fault). The classifyRealtime
                    status is still respected for DISCONNECTED/OPEN_CIRCUIT.
                    Pill colors come from STATUS_STYLES['peer-excluded']. */}
                <td className="px-3 py-2">
                  {s.peer_excluded && s.status === 'NORMAL' ? (
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
                      STATUS_STYLES['peer-excluded'].fg,
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES['peer-excluded'].dot)} />
                      {STATUS_STYLES['peer-excluded'].label.toLowerCase()}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
                        style.fg,
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                      {style.label}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
