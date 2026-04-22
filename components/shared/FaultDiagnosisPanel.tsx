'use client'

import { cn } from '@/lib/utils'
import { GAP_WARNING, GAP_INFO, type StringStatus } from '@/lib/string-health'
import {
  STATUS_STYLES,
  type StatusKey,
} from '@/lib/design-tokens'
import {
  Droplets, TreePine, Wrench, PlugZap, CheckCircle, Cable, ArrowRight,
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

  const openCircuit = strings.filter(s => s.status === 'OPEN_CIRCUIT')
  if (openCircuit.length > 0) {
    diagnoses.push({
      stringNumbers: openCircuit.map(s => s.string_number),
      severity: 'critical',
      cause: 'Open Circuit — No Current Flow',
      pattern: `Voltage present (${openCircuit[0].voltage.toFixed(0)} V) but 0 A current — panels connected but current cannot flow.`,
      action: 'Check MC4 connectors, string fuses, and combiner box switches. Inspect for loose or corroded connections.',
      icon: Cable,
    })
  }

  const disconnected = strings.filter(s => s.status === 'DISCONNECTED')
  if (disconnected.length > 0) {
    diagnoses.push({
      stringNumbers: disconnected.map(s => s.string_number),
      severity: 'critical',
      cause: 'Disconnected — Total Signal Loss',
      pattern: '0 V and 0 A — no electrical connection detected.',
      action: 'Emergency inspection: check cables for damage, verify inverter input terminals, inspect junction boxes.',
      icon: PlugZap,
    })
  }

  const critical = strings.filter(s => s.status === 'CRITICAL')
  if (critical.length > 0) {
    diagnoses.push({
      stringNumbers: critical.map(s => s.string_number),
      severity: 'critical',
      cause: 'Faulty Panel or Major Obstruction',
      pattern: `Current ${critical[0].gap_percent.toFixed(0)}%+ below inverter average — severe underperformance.`,
      action: 'Inspect for broken panel, heavy bird droppings, or major shading obstruction.',
      icon: Wrench,
    })
  }

  const warning = strings.filter(s => s.status === 'WARNING' && s.gap_percent >= GAP_WARNING)
  if (warning.length > 0) {
    diagnoses.push({
      stringNumbers: warning.map(s => s.string_number),
      severity: 'warning',
      cause: 'Partial Shading or Dirty Panels',
      pattern: `Current ${GAP_WARNING}–${GAP_WARNING * 2}% below average — moderate underperformance.`,
      action: 'Schedule cleaning or check for tree shadow during peak hours.',
      icon: TreePine,
    })
  }

  const mild = strings.filter(s => s.status === 'WARNING' && s.gap_percent > GAP_INFO && s.gap_percent < GAP_WARNING)
  if (mild.length > 0) {
    diagnoses.push({
      stringNumbers: mild.map(s => s.string_number),
      severity: 'info',
      cause: 'Minor Dust or Light Soiling',
      pattern: `Current ${GAP_INFO}–${GAP_WARNING}% below average — mild underperformance.`,
      action: 'Monitor trend; schedule routine cleaning if persistent.',
      icon: Droplets,
    })
  }

  const normalStrings = strings.filter(s => s.status === 'NORMAL')
  if (diagnoses.length === 0 && normalStrings.length > 0) {
    diagnoses.push({
      stringNumbers: [],
      severity: 'info',
      cause: 'All Strings Healthy',
      pattern: 'All strings within normal operating range.',
      action: 'No action needed — continue monitoring.',
      icon: CheckCircle,
    })
  }

  return diagnoses
}

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

const SEVERITY_LABEL: Record<DiagSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
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
        const affects = d.stringNumbers.length
        return (
          <div
            key={i}
            className={cn(
              'rounded-md border border-l-[3px] bg-white overflow-hidden',
              leftBorder,
              'border-slate-200',
            )}
          >
            {/* Header */}
            <div className={cn('px-3.5 py-2.5', style.bg)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', style.fg)} strokeWidth={2} />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">
                      {d.cause}
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">{d.pattern}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border',
                    style.bg,
                    style.fg,
                    style.border,
                  )}
                >
                  {SEVERITY_LABEL[d.severity]}
                  {affects > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono">{affects}</span>
                    </>
                  )}
                </span>
              </div>

              {/* Affected strings — colored dots + numbers */}
              {d.stringNumbers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-6">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Affected
                  </span>
                  {d.stringNumbers.slice(0, 12).map((n) => (
                    <span
                      key={n}
                      className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm border',
                        style.border,
                        'bg-white',
                      )}
                    >
                      <span className={cn('w-1 h-1 rounded-full', style.dot)} />
                      <span className="text-slate-700">PV{n}</span>
                    </span>
                  ))}
                  {d.stringNumbers.length > 12 && (
                    <span className="text-[10px] font-mono text-slate-500">
                      + {d.stringNumbers.length - 12} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action block — distinct, more prominent than a one-liner */}
            <div className="px-3.5 py-2 bg-white border-t border-slate-100">
              <div className="flex items-start gap-2">
                <ArrowRight className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', style.fg)} strokeWidth={2.5} />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-1.5">
                    Action
                  </span>
                  <span className="text-[12px] text-slate-700">{d.action}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
