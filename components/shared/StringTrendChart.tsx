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

const COLORS = [
  '#22c55e', '#3b82f6', '#f97316', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f59e0b', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#d97706',
  '#10b981', '#7c3aed', '#f43f5e', '#059669', '#2563eb',
  '#dc2626', '#4f46e5', '#16a34a', '#ca8a04',
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{
              value: 'Current (A)',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12 },
            }}
          />
          <Tooltip />
          <Legend />
          {stringNumbers.map((num, idx) => (
            <Line
              key={num}
              type="monotone"
              dataKey={`PV${num}`}
              stroke={COLORS[idx % COLORS.length]}
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
