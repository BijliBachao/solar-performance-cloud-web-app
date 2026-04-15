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
  Cell,
} from 'recharts'

interface StringData {
  string_number: number
  current: number
  gap_percent: number
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'DISCONNECTED'
}

interface CurrentDeviationChartProps {
  strings: StringData[]
  avgCurrent: number
}

function getBarColor(status: string, performance: number): string {
  if (status === 'OPEN_CIRCUIT') return '#991b1b' // red-800 — wiring fault
  if (status === 'DISCONNECTED') return '#374151' // gray-700 — total loss
  if (performance >= 0) return '#10b981' // emerald-500 — above avg
  if (performance > -10) return '#22c55e' // green-500 — slightly below
  if (performance > -25) return '#f59e0b' // amber-500 — warning
  if (performance > -50) return '#f97316' // orange-500 — concerning
  return '#ef4444' // red-500 — critical
}

export function CurrentDeviationChart({ strings, avgCurrent }: CurrentDeviationChartProps) {
  // Show ALL strings — dead strings appear as deep negative bars
  const data = strings.map((s) => {
    const performance = avgCurrent > 0
      ? ((s.current - avgCurrent) / avgCurrent) * 100
      : s.current > 0 ? 0 : -100
    return {
      name: `PV${s.string_number}`,
      performance: Number(performance.toFixed(1)),
      current: s.current,
      avg: avgCurrent,
      status: s.status,
    }
  })

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #e5e7eb',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
            formatter={(value: number, _name: string, props: any) => {
              const entry = props.payload
              const statusLabels: Record<string, string> = {
                NORMAL: 'Normal',
                WARNING: 'Warning',
                CRITICAL: 'Critical',
                OPEN_CIRCUIT: 'Open Circuit',
                DISCONNECTED: 'Disconnected',
              }
              return [
                <span key="val">
                  <strong>{value > 0 ? '+' : ''}{value}%</strong>
                  {' '}— {entry.current.toFixed(2)}A vs {entry.avg.toFixed(2)}A avg
                  {' '}({statusLabels[entry.status] || entry.status})
                </span>,
                'Performance',
              ]
            }}
          />
          <ReferenceLine
            y={0}
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={{
              value: `Avg: ${avgCurrent.toFixed(2)}A`,
              position: 'right',
              style: { fontSize: 10, fill: '#9ca3af' },
            }}
          />
          <Bar
            dataKey="performance"
            radius={[2, 2, 2, 2]}
            maxBarSize={40}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry.status, entry.performance)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
