'use client'

import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ACTIVE_CURRENT_THRESHOLD } from '@/lib/string-health'

interface TrendDataPoint {
  timestamp: string
  strings: Array<{ string_number: number; current: number }>
}

interface StringTrendChartProps {
  data: TrendDataPoint[]
}

/**
 * Multi-line string-current trend. IEC 61724-1 aligned:
 *   - Explicit null-fill so Recharts shows visible gaps where data is missing
 *     (instead of interpolating through dropouts — a string that went offline
 *     and returned won't silently connect "100% performance" across the gap).
 *   - `connectNulls={false}` set explicitly.
 *   - Flat-zero strings (max current < ACTIVE_CURRENT_THRESHOLD) dropped from
 *     the plot but shown in the chip legend with a "silent" tag, so the
 *     viewer knows they exist without adding flat-line noise.
 *   - Per-chip uptime %: how much of the window had non-zero current (visual
 *     proxy for IEC 61724-1 data availability).
 *   - Day-boundary vertical rule + date label where HH:mm resets across midnight.
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

  const {
    stringNumbers,
    activeNumbers,
    silentNumbers,
    uptimeByString,
    chartData,
    dayBreakIdx,
    secondDayLabel,
  } = useMemo(() => {
    const empty = {
      stringNumbers: [] as number[],
      activeNumbers: [] as number[],
      silentNumbers: [] as number[],
      uptimeByString: {} as Record<number, number>,
      chartData: [] as any[],
      dayBreakIdx: -1,
      secondDayLabel: '',
    }
    if (!data || data.length === 0) return empty

    // All distinct string numbers that appear in the window (sorted)
    const nums = [
      ...new Set(data.flatMap((d) => d.strings.map((s) => s.string_number))),
    ].sort((a, b) => a - b)

    // Max current per string in this window — drives "silent" filtering
    const maxByString: Record<number, number> = {}
    const activeCountByString: Record<number, number> = {}
    const presenceCountByString: Record<number, number> = {}
    for (const p of data) {
      for (const s of p.strings) {
        presenceCountByString[s.string_number] = (presenceCountByString[s.string_number] || 0) + 1
        if (s.current > maxByString[s.string_number] || 0) {
          maxByString[s.string_number] = s.current
        }
        if (s.current > ACTIVE_CURRENT_THRESHOLD) {
          activeCountByString[s.string_number] = (activeCountByString[s.string_number] || 0) + 1
        }
      }
    }

    // Active (plot) vs silent (chip only, not on chart)
    const activeNums = nums.filter((n) => (maxByString[n] || 0) > ACTIVE_CURRENT_THRESHOLD)
    const silentNums = nums.filter((n) => (maxByString[n] || 0) <= ACTIVE_CURRENT_THRESHOLD)

    // Uptime % per string = non-zero-current points ÷ total points in window
    const totalPoints = data.length
    const uptime: Record<number, number> = {}
    for (const n of nums) {
      const produced = activeCountByString[n] || 0
      uptime[n] = totalPoints > 0 ? Math.round((produced / totalPoints) * 100) : 0
    }

    // Build chart rows. For each point, ensure EVERY active string has an
    // explicit value (number or null). Recharts treats null as a gap.
    const rows = data.map((point, idx) => {
      const entry: Record<string, any> = {
        time: format(new Date(point.timestamp), 'HH:mm'),
        // remember the date boundary (first row of a new day)
        _dateKey: format(new Date(point.timestamp), 'yyyy-MM-dd'),
        _dateLabel: format(new Date(point.timestamp), 'MMM d'),
        _idx: idx,
      }
      // Map reported strings by number for O(1) lookup
      const reported: Record<number, number> = {}
      for (const s of point.strings) reported[s.string_number] = s.current
      // Fill every active string — missing → explicit null
      let sum = 0
      let n = 0
      for (const num of activeNums) {
        const v = reported[num]
        if (v === undefined || v === null) {
          entry[`PV${num}`] = null
        } else {
          entry[`PV${num}`] = v
          if (v > ACTIVE_CURRENT_THRESHOLD) {
            sum += v
            n += 1
          }
        }
      }
      entry.__avg = n > 0 ? sum / n : null
      return entry
    })

    // Find first row whose date differs from row 0's date → day boundary
    let dayBreak = -1
    let day2Label = ''
    if (rows.length > 1) {
      const firstDay = rows[0]._dateKey
      for (let i = 1; i < rows.length; i++) {
        if (rows[i]._dateKey !== firstDay) {
          dayBreak = i
          day2Label = rows[i]._dateLabel
          break
        }
      }
    }

    return {
      stringNumbers: nums,
      activeNumbers: activeNums,
      silentNumbers: silentNums,
      uptimeByString: uptime,
      chartData: rows,
      dayBreakIdx: dayBreak,
      secondDayLabel: day2Label,
    }
  }, [data])

  if (!data || data.length === 0) return null

  const handleToggle = (n: number) => setFocus((f) => (f === n ? null : n))
  const dayBreakTime = dayBreakIdx >= 0 ? chartData[dayBreakIdx]?.time : null

  return (
    <div className="w-full">
      {/* Legend row — Avg chip + active string chips + silent chips */}
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
            {activeNumbers.map((num) => {
              const idx = stringNumbers.indexOf(num)
              const color = TREND_LINE_COLORS[idx % TREND_LINE_COLORS.length]
              const active = focus === num
              const uptime = uptimeByString[num] ?? 0
              return (
                <button
                  key={num}
                  onClick={() => handleToggle(num)}
                  title={`PV${num} · uptime ${uptime}% of window`}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-1 rounded-sm border transition-colors',
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  PV{num}
                  <span
                    className={cn(
                      'text-[9px] font-semibold',
                      active ? 'text-slate-300' : uptime >= 80 ? 'text-emerald-600' : uptime >= 40 ? 'text-amber-600' : 'text-red-600',
                    )}
                  >
                    {uptime}%
                  </span>
                </button>
              )
            })}
            {silentNumbers.length > 0 && (
              <span
                title={`Strings below the ${ACTIVE_CURRENT_THRESHOLD} A active threshold in this window — not plotted`}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-1 rounded-sm bg-slate-50 text-slate-500 border border-slate-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                {silentNumbers.length} silent
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />

            {/* Day-boundary marker — subtle vertical rule + label */}
            {dayBreakTime && (
              <ReferenceLine
                x={dayBreakTime}
                stroke="#CBD5E1"
                strokeDasharray="4 4"
                label={{
                  value: secondDayLabel,
                  position: 'top',
                  fill: '#64748B',
                  fontSize: 10,
                  fontWeight: 600,
                }}
                ifOverflow="visible"
              />
            )}

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
                if (value === null || value === undefined) return ['—', String(name)]
                if (name === '__avg') return [`${Number(value).toFixed(2)} A`, 'Avg']
                return [`${Number(value).toFixed(2)} A`, String(name)]
              }}
            />

            {/* Individual active string lines — null values render as gaps */}
            {activeNumbers.map((num) => {
              const idx = stringNumbers.indexOf(num)
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
                  connectNulls={false}
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
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-slate-400 mt-2">
        {focus === null
          ? `Click a PV chip to isolate its line. Chip uptime shows % of ${chartData.length} points with current above ${ACTIVE_CURRENT_THRESHOLD} A (IEC 61724-1 data availability).`
          : `Highlighting PV${focus} — click again to reset.`}
      </p>
    </div>
  )
}
