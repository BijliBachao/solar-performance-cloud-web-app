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
import { type StringStatus } from '@/lib/string-health'

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

function getBarColor(status: string): string {
  if (status === 'NORMAL') return '#76b900'
  if (status === 'WARNING') return '#ef9100'
  if (status === 'CRITICAL') return '#e52020'
  if (status === 'OPEN_CIRCUIT') return '#991b1b'
  return '#525252' // DISCONNECTED
}

const statusLabels: Record<string, string> = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
  OPEN_CIRCUIT: 'Open Circuit',
  DISCONNECTED: 'Disconnected',
}

export function CurrentDeviationChart({ strings, avgCurrent }: CurrentDeviationChartProps) {
  const data = strings.map((s) => ({
    name: `PV${s.string_number}`,
    current: s.current,
    status: s.status,
    kwh: s.energy_kwh || 0,
  }))

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#898989' }}
            axisLine={{ stroke: '#5e5e5e' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#898989' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}A`}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 2,
              border: '1px solid #333',
              backgroundColor: '#1a1a1a',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => {
              const entry = props.payload
              return [
                <span key="val" style={{ color: '#fff' }}>
                  <strong>{value.toFixed(2)}A</strong>
                  {' '}— {statusLabels[entry.status] || entry.status}
                  {entry.kwh > 0 ? ` — ${entry.kwh.toFixed(1)} kWh today` : ''}
                </span>,
                'Current',
              ]
            }}
          />
          {avgCurrent > 0 && (
            <ReferenceLine
              y={avgCurrent}
              stroke="#76b900"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{
                value: `Avg: ${avgCurrent.toFixed(2)}A`,
                position: 'right',
                style: { fontSize: 10, fill: '#76b900', fontWeight: 700 },
              }}
            />
          )}
          <Bar
            dataKey="current"
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry.status)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
