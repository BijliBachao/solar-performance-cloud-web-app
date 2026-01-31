'use client'

import { Power, Activity, TrendingUp, AlertTriangle } from 'lucide-react'

interface PlantQuickStatsProps {
  totalPower: number
  avgCurrent: number
  healthPercent: number
  stringsOk: number
  stringsTotal: number
  alertCount: number
  criticalCount: number
}

export function PlantQuickStats({
  totalPower,
  avgCurrent,
  healthPercent,
  stringsOk,
  stringsTotal,
  alertCount,
  criticalCount,
}: PlantQuickStatsProps) {
  const formatPower = (watts: number) => {
    if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`
    if (watts > 0) return `${watts.toFixed(0)} W`
    return '—'
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Power className="w-4 h-4 text-yellow-500" />
          <span className="text-xs text-gray-500">Total Power</span>
        </div>
        <p className="text-xl font-semibold text-gray-900">{formatPower(totalPower)}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-gray-500">Avg Current</span>
        </div>
        <p className="text-xl font-semibold text-gray-900">
          {avgCurrent > 0 ? `${avgCurrent.toFixed(2)} A` : '—'}
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <span className="text-xs text-gray-500">String Health</span>
        </div>
        <p className={`text-xl font-semibold ${
          stringsTotal === 0 ? 'text-gray-400' :
          healthPercent >= 90 ? 'text-green-600' :
          healthPercent >= 70 ? 'text-yellow-600' : 'text-red-600'
        }`}>
          {stringsTotal > 0 ? `${healthPercent}%` : '—'}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {stringsTotal > 0 ? `${stringsOk}/${stringsTotal} strings OK` : 'No data yet'}
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <span className="text-xs text-gray-500">Active Alerts</span>
        </div>
        <p className={`text-xl font-semibold ${alertCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {alertCount}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {alertCount === 0 ? 'All clear' : `${criticalCount} critical`}
        </p>
      </div>
    </div>
  )
}
