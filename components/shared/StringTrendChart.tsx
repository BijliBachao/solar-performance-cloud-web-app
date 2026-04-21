'use client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'

interface TrendDataPoint {
  timestamp: string
  strings: Array<{ string_number: number; current: number }>
}

interface StringTrendChartProps {
  data: TrendDataPoint[]
}

// Distinct palette for overlaid trend lines. Values chosen to be readable
// on a white background and remain distinguishable when many strings overlap.
// First color is the brand solar-gold; the rest are a vetted multi-series
// palette compatible with the v3 Solar Corporate design system.
const TREND_LINE_COLORS = [
  '#F59E0B', // solar-gold (brand)
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
  '#4338ca', // indigo-700
  '#16a34a', // green-600
  '#a16207', // yellow-700
]

export function StringTrendChart({ data }: StringTrendChartProps) {
  if (!data || data.length === 0) return null

  // Get unique string numbers
  const stringNumbers = [
    ...new Set(data.flatMap((d) => d.strings.map((s) => s.string_number))),
  ].sort((a, b) => a - b)

  // Transform data for Recharts
  const chartData = data.map((point) => {
    const entry: Record<string, any> = {
      time: format(new Date(point.timestamp), 'HH:mm'),
    }
    for (const s of point.strings) {
      entry[`PV${s.string_number}`] = s.current
    }
    return entry
  })

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={{ stroke: '#E2E8F0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            label={{
              value: 'Current (A)',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11, fill: '#475569' },
            }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 2,
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
            }}
            labelStyle={{ color: '#475569', fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {stringNumbers.map((num, idx) => (
            <Line
              key={num}
              type="monotone"
              dataKey={`PV${num}`}
              stroke={TREND_LINE_COLORS[idx % TREND_LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
