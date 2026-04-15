'use client'

import { cn } from '@/lib/utils'
import { GAP_WARNING, GAP_INFO } from '@/lib/string-health'
import {
  Droplets, TreePine, Wrench,
  Unplug, PlugZap, TrendingDown, CheckCircle, Cable,
} from 'lucide-react'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'DISCONNECTED'
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

  // ── Open Circuit: voltage present, no current (wiring fault) ──
  const openCircuit = strings.filter(s => s.status === 'OPEN_CIRCUIT')
  if (openCircuit.length > 0) {
    diagnoses.push({
      stringNumbers: openCircuit.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Open Circuit — No Current Flow',
      pattern: `Voltage present (${openCircuit[0].voltage.toFixed(0)}V) but 0A current — panels connected but current cannot flow`,
      action: 'Check MC4 connectors, string fuses, and combiner box switches. Inspect for loose or corroded connections.',
      icon: Cable,
    })
  }

  // ── Disconnected: no voltage, no current (total loss) ─────────
  const disconnected = strings.filter(s => s.status === 'DISCONNECTED')
  if (disconnected.length > 0) {
    diagnoses.push({
      stringNumbers: disconnected.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Disconnected — Total Signal Loss',
      pattern: '0V and 0A — no electrical connection detected',
      action: 'Emergency inspection: check cables for damage, verify inverter input terminals, inspect junction boxes.',
      icon: PlugZap,
    })
  }

  // ── Critical: producing but severely underperforming ───────────
  const critical = strings.filter(s => s.status === 'CRITICAL')
  if (critical.length > 0) {
    diagnoses.push({
      stringNumbers: critical.map(s => s.string_number),
      severity: 'CRITICAL',
      cause: 'Faulty Panel or Major Obstruction',
      pattern: `Current ${critical[0].gap_percent.toFixed(0)}%+ below average — severe underperformance`,
      action: 'Inspect for broken panel, heavy bird droppings, or major shading obstruction.',
      icon: Wrench,
    })
  }

  // ── Warning: moderate underperformance ─────────────────────────
  const warning = strings.filter(s => s.status === 'WARNING' && s.gap_percent >= GAP_WARNING)
  if (warning.length > 0) {
    diagnoses.push({
      stringNumbers: warning.map(s => s.string_number),
      severity: 'WARNING',
      cause: 'Partial Shading or Dirty Panels',
      pattern: 'Current 25-50% below average',
      action: 'Schedule cleaning or check for tree shadow during peak hours.',
      icon: TreePine,
    })
  }

  // ── Info: mild underperformance ────────────────────────────────
  const mild = strings.filter(s => s.status === 'WARNING' && s.gap_percent > GAP_INFO && s.gap_percent < GAP_WARNING)
  if (mild.length > 0) {
    diagnoses.push({
      stringNumbers: mild.map(s => s.string_number),
      severity: 'INFO',
      cause: 'Minor Dust or Light Soiling',
      pattern: 'Current 10-25% below average',
      action: 'Monitor trend; schedule routine cleaning if persistent.',
      icon: Droplets,
    })
  }

  // ── All healthy ────────────────────────────────────────────────
  const normalStrings = strings.filter(s => s.status === 'NORMAL')
  if (diagnoses.length === 0 && normalStrings.length > 0) {
    diagnoses.push({
      stringNumbers: [],
      severity: 'INFO',
      cause: 'All Strings Healthy',
      pattern: 'All strings within normal operating range',
      action: 'No action needed — continue monitoring.',
      icon: CheckCircle,
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
