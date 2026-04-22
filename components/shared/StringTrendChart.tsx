'use client'

import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface TrendDataPoint {
  timestamp: string
  strings: Array<{ string_number: number; current: number }>
}

interface StringTrendChartProps {
  data: TrendDataPoint[]
}

/**
 * Multi-line string-current trend.
 *   - Inverter average drawn as a thick solar-gold line (the hero signal).
 *   - Individual strings drawn at low opacity so the bundle is calm.
 *   - Clicking a string chip in the legend highlights that line (100% opacity,
 *     thicker stroke). Click again to unpin.
 *   - Empty → null so the parent shows its own empty state.
 */
const TREND_LINE_COLORS = [
  '#2563eb', // blue-600
  '#ea580c', // orange-600
  '#dc2626', // red-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#be185d', // pink-700
  '#65a30d', // lime-600
  '#d97706', // amber-600
  '#4f46e5', // indigo-600
  '#0d9488', // teal-600
  '#e11d48', // rose-600
  '#a855f7', // purple-500
  '#0284c7', // sky-600
  '#b45309', // amber-700
  '#059669', // emerald-600
  '#6d28d9', // violet-700
  '#f43f5e', // rose-500
  '#047857', // emerald-700
  '#1d4ed8', // blue-700
  '#b91c1c', // red-700
]

const AVG_COLOR = '#F59E0B' // solar-gold-500

export function StringTrendChart({ data }: StringTrendChartProps) {
  const [focus, setFocus] = useState<number | null>(null)

  const { stringNumbers, chartData } = useMemo(() => {
    if (!data || data.length === 0) return { stringNumbers: [] as number[], chartData: [] as any[] }
    const nums = [...new Set(data.flatMap((d) => d.strings.map((s) => s.string_number)))].sort(
      (a, b) => a - b,
    )
    const rows = data.map((point) => {
      const entry: Record<string, any> = {
        time: format(new Date(point.timestamp), 'HH:mm'),
      }
      let sum = 0
      let n = 0
      for (const s of point.strings) {
        entry[`PV${s.string_number}`] = s.current
        if (s.current > 0) {
          sum += s.current
          n += 1
        }
      }
      entry.__avg = n > 0 ? sum / n : null
      return entry
    })
    return { stringNumbers: nums, chartData: rows }
  }, [data])

  if (!data || data.length === 0) return null

  const handleToggle = (n: number) => setFocus((f) => (f === n ? null : n))

  return (
    <div className="w-full">
      {/* Legend row — chips scroll horizontally if many strings */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setFocus(null)}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border transition-colors',
            focus === null
              ? 'bg-solar-gold/10 text-solar-gold-700 border-solar-gold/40'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
          )}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: AVG_COLOR }} />
          Avg
        </button>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {stringNumbers.map((num, idx) => {
              const color = TREND_LINE_COLORS[idx % TREND_LINE_COLORS.length]
              const active = focus === num
              return (
                <button
                  key={num}
                  onClick={() => handleToggle(num)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-1 rounded-sm border transition-colors',
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  PV{num}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'var(--font-mono, monospace)' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'var(--font-mono, monospace)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}A`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                padding: '8px 10px',
              }}
              labelStyle={{ color: '#0F172A', fontWeight: 700, fontSize: 11 }}
              itemSorter={(item: any) =>
                item.dataKey === '__avg' ? -1 : -(item.value ?? 0)
              }
              formatter={(value: any, name: any) => {
                if (name === '__avg') return [`${Number(value).toFixed(2)} A`, 'Avg']
                return [`${Number(value).toFixed(2)} A`, String(name)]
              }}
            />

            {/* Individual string lines — dim unless one is focused */}
            {stringNumbers.map((num, idx) => {
              const color = TREND_LINE_COLORS[idx % TREND_LINE_COLORS.length]
              const isFocus = focus === num
              const isDimmed = focus !== null && !isFocus
              return (
                <Line
                  key={num}
                  type="monotone"
                  dataKey={`PV${num}`}
                  stroke={color}
                  strokeWidth={isFocus ? 2.5 : 1.25}
                  strokeOpacity={isDimmed ? 0.1 : isFocus ? 1 : 0.35}
                  dot={false}
                  activeDot={isFocus ? { r: 4 } : false}
                  isAnimationActive={false}
                />
              )
            })}

            {/* Inverter average — thick gold on top, the hero signal */}
            <Line
              type="monotone"
              dataKey="__avg"
              name="Avg"
              stroke={AVG_COLOR}
              strokeWidth={focus === null ? 3 : 2}
              strokeOpacity={focus === null ? 1 : 0.5}
              dot={false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-slate-400 mt-2">
        {focus === null
          ? 'Click a string chip above to isolate its line. Click Avg to reset.'
          : `Highlighting PV${focus} — click again to reset, or pick a different string.`}
      </p>
    </div>
  )
}
