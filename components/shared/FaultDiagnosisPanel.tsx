'use client'

import { cn } from '@/lib/utils'
import { GAP_WARNING, GAP_INFO, type StringStatus } from '@/lib/string-health'
import {
  STATUS_STYLES,
  type StatusKey,
} from '@/lib/design-tokens'
import {
  Droplets, TreePine, Wrench, PlugZap, CheckCircle, Cable,
} from 'lucide-react'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: StringStatus
}

interface FaultDiagnosisPanelProps {
  strings: StringData[]
  avgCurrent: number
}

type DiagSeverity = 'critical' | 'warning' | 'info'

interface Diagnosis {
  stringNumbers: number[]
  severity: DiagSeverity
  cause: string
  pattern: string
  action: string
  icon: any
}

function diagnoseStrings(strings: StringData[], _avgCurrent: number): Diagnosis[] {
  const diagnoses: Diagnosis[] = []

  // ── Open Circuit: voltage present, no current (wiring fault) ──
  const openCircuit = strings.filter(s => s.status === 'OPEN_CIRCUIT')
  if (openCircuit.length > 0) {
    diagnoses.push({
      stringNumbers: openCircuit.map(s => s.string_number),
      severity: 'critical',
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
      severity: 'critical',
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
      severity: 'critical',
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
      severity: 'warning',
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
      severity: 'info',
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
      severity: 'info',
      cause: 'All Strings Healthy',
      pattern: 'All strings within normal operating range',
      action: 'No action needed — continue monitoring.',
      icon: CheckCircle,
    })
  }

  return diagnoses
}

/**
 * Map diagnosis severity → central status key so all alert/diagnosis styling
 * flows through the same lookup.
 */
const SEVERITY_TO_STATUS: Record<DiagSeverity, StatusKey> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
}

const LEFT_BORDER_BY_KEY: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-violet-600',
}

export function FaultDiagnosisPanel({ strings, avgCurrent }: FaultDiagnosisPanelProps) {
  const diagnoses = diagnoseStrings(strings, avgCurrent)

  return (
    <div className="space-y-2">
      {diagnoses.map((d, i) => {
        const key = SEVERITY_TO_STATUS[d.severity]
        const style = STATUS_STYLES[key]
        const leftBorder = LEFT_BORDER_BY_KEY[key]
        const Icon = d.icon
        return (
          <div
            key={i}
            className={cn(
              'rounded-sm border border-l-[3px] p-3',
              leftBorder,
              'border-slate-200',
              style.bg,
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', style.fg)} strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">{d.cause}</span>
                  {d.stringNumbers.length > 0 && (
                    <span
                      className={cn(
                        'text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-sm border',
                        style.bg,
                        style.fg,
                        style.border,
                      )}
                    >
                      {d.stringNumbers.map(n => `PV${n}`).join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{d.pattern}</p>
                <p className="text-xs text-slate-700 mt-1">
                  <span className="font-semibold">Action:</span> {d.action}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
