'use client'

import { Line, LineChart, Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  variant?: 'line' | 'area' | 'bars'
}

/**
 * Reusable sparkline — tiny chart for cards and KPIs.
 * - `line`: simple line chart
 * - `area`: line + subtle fill (Stripe-style)
 * - `bars`: CSS bar chart (no recharts — faster for many instances)
 */
export function Sparkline({
  data,
  color = '#F59E0B',
  height = 40,
  variant = 'area',
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="bg-slate-50 rounded-sm" />
  }

  if (variant === 'bars') {
    const max = Math.max(...data, 0.001)
    return (
      <div className="flex items-end gap-0.5" style={{ height }}>
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-colors"
            style={{
              height: `${Math.max((v / max) * 100, 6)}%`,
              backgroundColor: v > 0 ? color : '#F1F5F9',
              opacity: v > 0 ? 1 : 0.5,
            }}
          />
        ))}
      </div>
    )
  }

  const chartData = data.map((value, idx) => ({ idx, value }))

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        {variant === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
