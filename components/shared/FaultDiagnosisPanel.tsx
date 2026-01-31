'use client'

import { cn } from '@/lib/utils'
import {
  Droplets, CloudRain, TreePine, Wrench,
  Unplug, PlugZap, TrendingDown, Thermometer,
} from 'lucide-react'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE'
}

interface FaultDiagnosisPanelProps {
  strings: StringData[]
  avgCurrent: number
}

interface Diagnosis {
  stringNumbers: number[]
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  cause: string
  pattern: string
  action: string
  icon: any
}

function diagnoseStrings(strings: StringData[], avgCurrent: number): Diagnosis[] {
  const diagnoses: Diagnosis[] = []
  // Exclude OFFLINE (unused MPPT ports) from fault analysis
  const liveStrings = strings.filter(s => s.status !== 'OFFLINE')
  const critical = liveStrings.filter(s => s.status === 'CRITICAL')
  const warning = liveStrings.filter(s => s.status === 'WARNING')

  // Count offline ports for info
  const offlineStrings = strings.filter(s => s.status === 'OFFLINE')
  if (offlineStrings.length > 0) {
    diagnoses.push({
      stringNumbers: offlineStrings.map(s => s.string_number),
      severity: 'INFO',
      cause: 'Unused MPPT Ports',
      pattern: `${offlineStrings.length} MPPT input${offlineStrings.length !== 1 ? 's' : ''} with voltage but no current — not connected to panels`,
      action: 'No action needed — these are spare MPPT inputs on the inverter',
      icon: Unplug,
    })
  }

  // Broken / Disconnected (0V and 0A)
  const broken = liveStrings.filter(s => s.voltage === 0 && s.current === 0)
  if (broken.length > 0) {
    diagnoses.push({
      stringNumbers: broken.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Broken / Disconnected String',
      pattern: '0V and 0A - no electrical connection',
      action: 'Emergency inspection: check cables, connectors, and junction boxes',
      icon: PlugZap,
    })
  }

  // Voltage present but 0 current (string has panels but no current flow)
  const noCurrentButVoltage = liveStrings.filter(
    s => s.voltage > 0 && s.current === 0 && !broken.includes(s)
  )
  if (noCurrentButVoltage.length > 0) {
    diagnoses.push({
      stringNumbers: noCurrentButVoltage.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Open Circuit - No Current Flow',
      pattern: `Voltage present (${noCurrentButVoltage[0].voltage.toFixed(0)}V) but 0A current`,
      action: 'Check for loose cable connections, blown fuse, or disconnected combiner box',
      icon: Unplug,
    })
  }

  // Severe underperformance (>50% below avg, but not zero)
  const severe = critical.filter(
    s => s.current > 0 && s.gap_percent > 50
  )
  if (severe.length > 0) {
    diagnoses.push({
      stringNumbers: severe.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Faulty Panel or Major Obstruction',
      pattern: `Current ${severe[0].gap_percent.toFixed(0)}%+ below average`,
      action: 'Inspect for broken panel, heavy bird droppings, or major shading',
      icon: Wrench,
    })
  }

  // Moderate underperformance (25-50% below avg)
  const moderate = warning.filter(s => s.gap_percent >= 25 && s.gap_percent <= 50)
  if (moderate.length > 0) {
    diagnoses.push({
      stringNumbers: moderate.map(s => s.string_number),
      severity: 'WARNING',
      cause: 'Partial Shading or Dirty Panels',
      pattern: `Current 25-50% below average`,
      action: 'Schedule cleaning or check for tree shadow during peak hours',
      icon: TreePine,
    })
  }

  // Mild underperformance (10-25% below avg)
  const mild = liveStrings.filter(s => s.gap_percent > 10 && s.gap_percent <= 25 && s.current > 0)
  if (mild.length > 0) {
    diagnoses.push({
      stringNumbers: mild.map(s => s.string_number),
      severity: 'INFO',
      cause: 'Minor Dust or Light Soiling',
      pattern: 'Current 10-25% below average',
      action: 'Monitor trend; schedule routine cleaning if persistent',
      icon: Droplets,
    })
  }

  // If no issues found (don't count offline-only as "all healthy")
  if (diagnoses.length === 0 && liveStrings.length > 0) {
    diagnoses.push({
      stringNumbers: [],
      severity: 'INFO',
      cause: 'All Strings Healthy',
      pattern: 'All strings within normal range',
      action: 'No action needed - continue monitoring',
      icon: TrendingDown,
    })
  }

  return diagnoses
}

const severityStyle = {
  CRITICAL: {
    border: 'border-l-red-500',
    bg: 'bg-red-50/50',
    badge: 'bg-red-100 text-red-700',
    icon: 'text-red-500',
  },
  WARNING: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/50',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'text-amber-500',
  },
  INFO: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/50',
    badge: 'bg-blue-100 text-blue-700',
    icon: 'text-blue-500',
  },
}

export function FaultDiagnosisPanel({ strings, avgCurrent }: FaultDiagnosisPanelProps) {
  const diagnoses = diagnoseStrings(strings, avgCurrent)

  return (
    <div className="space-y-2">
      {diagnoses.map((d, i) => {
        const style = severityStyle[d.severity]
        const Icon = d.icon
        return (
          <div
            key={i}
            className={cn('border-l-3 rounded-r-lg p-3 border', style.border, style.bg)}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', style.icon)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{d.cause}</span>
                  {d.stringNumbers.length > 0 && (
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', style.badge)}>
                      {d.stringNumbers.map(n => `PV${n}`).join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{d.pattern}</p>
                <p className="text-xs text-gray-700 mt-1">
                  <span className="font-medium">Action:</span> {d.action}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
