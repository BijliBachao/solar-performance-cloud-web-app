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

// Bar colors mirror STATUS_STYLES.*.dot (solid-500 family) so charts stay
// consistent with badges, dots, and matrix cells used elsewhere in the UI.
const BAR_COLOR_BY_STATUS: Record<StringStatus, string> = {
  NORMAL: '#10B981', // emerald-500
  WARNING: '#F59E0B', // amber-500
  CRITICAL: '#EF4444', // red-500
  OPEN_CIRCUIT: '#8B5CF6', // violet-500
  DISCONNECTED: '#94A3B8', // slate-400
}

const STATUS_LABELS: Record<StringStatus, string> = {
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
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={{ stroke: '#CBD5E1' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}A`}
          />
          <Tooltip
            cursor={{ fill: '#F1F5F9' }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 2,
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)',
            }}
            labelStyle={{ color: '#475569', fontWeight: 600 }}
            formatter={(value: number, _name: string, props: any) => {
              const entry = props.payload
              return [
                <span key="val" style={{ color: '#0F172A' }}>
                  <strong>{value.toFixed(2)}A</strong>
                  {' — '}{STATUS_LABELS[entry.status as StringStatus] || entry.status}
                  {entry.kwh > 0 ? ` — ${entry.kwh.toFixed(1)} kWh today` : ''}
                </span>,
                'Current',
              ]
            }}
          />
          {avgCurrent > 0 && (
            <ReferenceLine
              y={avgCurrent}
              stroke="#F59E0B"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{
                value: `Avg: ${avgCurrent.toFixed(2)}A`,
                position: 'right',
                style: { fontSize: 10, fill: '#F59E0B', fontWeight: 700 },
              }}
            />
          )}
          <Bar dataKey="current" radius={[2, 2, 0, 0]} maxBarSize={40}>
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
  )
}
