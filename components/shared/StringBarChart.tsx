'use client'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface StringBarChartProps {
  strings: Array<{ string_number: number; current: number; status: string }>
}

const statusColors: Record<string, string> = {
  OK: '#22c55e',
  WARNING: '#eab308',
  CRITICAL: '#ef4444',
}

export function StringBarChart({ strings }: StringBarChartProps) {
  const data = strings.map((s) => ({
    name: `PV${s.string_number}`,
    current: s.current,
    status: s.status,
  }))

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: 'Current (A)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(2)} A`, 'Current']}
          />
          <Bar dataKey="current" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={statusColors[entry.status] || '#6b7280'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
