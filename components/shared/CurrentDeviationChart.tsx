'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from 'recharts'
import { cn } from '@/lib/utils'
import { type StringStatus, GAP_INFO } from '@/lib/string-health'
import { STATUS_STYLES } from '@/lib/design-tokens'

interface StringData {
  string_number: number
  current: number
  gap_percent: number
  status: StringStatus
  energy_kwh?: number
}

interface CurrentDeviationChartProps {
  strings: StringData[]
  avgCurrent: number
}

// Bar colors mirror STATUS_STYLES.*.dot (solid-500 family) so the chart stays
// visually consistent with badges, matrix cells, and the row tints used
// elsewhere in the plant detail page.
const BAR_COLOR_BY_STATUS: Record<StringStatus, string> = {
  NORMAL: '#10B981', // emerald-500
  WARNING: '#F59E0B', // amber-500
  CRITICAL: '#EF4444', // red-500
  OPEN_CIRCUIT: '#8B5CF6', // violet-500
  OFFLINE: '#94A3B8', // slate-400
}

const STATUS_LABELS: Record<StringStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
  OPEN_CIRCUIT: 'Open Circuit',
  OFFLINE: 'Offline',
}

export function CurrentDeviationChart({ strings, avgCurrent }: CurrentDeviationChartProps) {
  const data = strings.map((s) => ({
    name: `PV${s.string_number}`,
    current: s.current,
    status: s.status,
    kwh: s.energy_kwh || 0,
  }))

  // Per-status count — drives the inline legend
  const counts = strings.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1
      return acc
    },
    {} as Record<StringStatus, number>,
  )

  // Summary footer stats
  const total = strings.length
  const aboveAvg = avgCurrent > 0
    ? strings.filter((s) => s.current >= avgCurrent).length
    : 0
  const belowAvg = total - aboveAvg

  // Healthy band (±GAP_INFO% around avg) — gives viewers a "normal zone"
  const gapFrac = GAP_INFO / 100
  const bandLow = avgCurrent > 0 ? avgCurrent * (1 - gapFrac) : 0
  const bandHigh = avgCurrent > 0 ? avgCurrent * (1 + gapFrac) : 0

  return (
    <div className="w-full">
      {/* ── Top row — inline legend + Avg readout ───────────────── */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
          {(['NORMAL', 'WARNING', 'CRITICAL', 'OPEN_CIRCUIT', 'OFFLINE'] as StringStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: BAR_COLOR_BY_STATUS[k] }}
              />
              <span className="font-mono font-semibold">{counts[k] || 0}</span>
              <span>{STATUS_LABELS[k]}</span>
            </span>
          ))}
        </div>
        {avgCurrent > 0 && (
          <div className="text-[10px] font-mono text-slate-500 shrink-0">
            <span className="font-bold uppercase tracking-widest text-slate-400">Avg</span>
            <span className="mx-1 text-slate-300">┆</span>
            <span className="font-semibold text-slate-900">{avgCurrent.toFixed(2)} A</span>
            <span className="text-slate-400 ml-1.5">
              (±{GAP_INFO}% = {bandLow.toFixed(2)}–{bandHigh.toFixed(2)} A)
            </span>
          </div>
        )}
      </div>

      {/* ── Chart ──────────────────────────────────────────────── */}
      <div className="w-full h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            {/* Healthy band — ±GAP_INFO% around avg */}
            {avgCurrent > 0 && (
              <ReferenceArea
                y1={bandLow}
                y2={bandHigh}
                fill="#F59E0B"
                fillOpacity={0.07}
                stroke="none"
              />
            )}

            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'var(--font-mono, monospace)' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'var(--font-mono, monospace)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}A`}
              width={40}
            />
            <Tooltip
              cursor={{ fill: '#F1F5F9' }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 4,
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                padding: '8px 10px',
              }}
              labelStyle={{ color: '#0F172A', fontWeight: 700, fontSize: 11 }}
              formatter={(value: number, _name: string, props: any) => {
                const entry = props.payload
                return [
                  <span key="val" style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                    <strong>{value.toFixed(2)} A</strong>
                    {' — '}
                    {STATUS_LABELS[entry.status as StringStatus] || entry.status}
                    {entry.kwh > 0 ? ` · ${entry.kwh.toFixed(1)} kWh` : ''}
                  </span>,
                  'Current',
                ]
              }}
            />

            {/* Avg reference line — no inline label (avg shown in header) */}
            {avgCurrent > 0 && (
              <ReferenceLine
                y={avgCurrent}
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="6 3"
              />
            )}

            <Bar dataKey="current" radius={[2, 2, 0, 0]} maxBarSize={32}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={BAR_COLOR_BY_STATUS[entry.status] ?? '#94A3B8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Footer — quick stats ─────────────────────────────── */}
      <div className="flex items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-500 flex-wrap">
        <span>
          <span className="font-mono font-semibold text-slate-900">{total}</span>
          <span> string{total !== 1 ? 's' : ''} total</span>
        </span>
        {avgCurrent > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-mono font-semibold text-emerald-700">{aboveAvg}</span>
              <span> at or above avg</span>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-mono font-semibold text-slate-600">{belowAvg}</span>
              <span> below</span>
            </span>
          </>
        )}
        <span className="text-slate-300">·</span>
        <span className={cn('flex items-center gap-1')}>
          <span className="w-2 h-2 rounded-sm bg-solar-gold/10 border border-solar-gold/30" />
          <span>Healthy zone (±{GAP_INFO}%)</span>
        </span>
      </div>
    </div>
  )
}
