import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertTriangle, CheckCircle, XCircle, Circle, HelpCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useState } from 'react'
import {
  ACTIVE_CURRENT_THRESHOLD,
  HEALTH_HEALTHY,
  HEALTH_CAUTION,
  HEALTH_WARNING,
} from '@/lib/string-health'
import {
  STATUS_STYLES,
  type StatusKey,
} from '@/lib/design-tokens'

interface Diagnosis {
  issue: string
  likely_cause: string
  action: string
  severity: 'critical' | 'warning' | 'info' | 'offline'
}

interface ShadingPattern {
  affected_hours: number[]
  avg_drop_percent: number
}

export interface MonthlyHealthData {
  string_number: number
  avg_current: number
  uptime_percent: number
  alert_count: number
  avg_health_score: number
  trend: 'stable' | 'improving' | 'declining' | 'offline'
  diagnosis: Diagnosis | null
  shading_pattern: ShadingPattern | null
}

interface MonthlyHealthReportProps {
  data: MonthlyHealthData[]
  inverterAvgCurrent?: number
}

function getAlertCountClass(count: number): string {
  if (count === 0) return 'text-slate-400'
  if (count <= 5) return 'text-amber-600'
  return 'text-red-700 font-bold'
}

function getStatusIcon(data: MonthlyHealthData) {
  if (data.trend === 'offline' || data.avg_current < ACTIVE_CURRENT_THRESHOLD) {
    return <Circle className="w-4 h-4 text-slate-400" strokeWidth={2} />
  }
  if (data.avg_health_score < HEALTH_WARNING) {
    return <XCircle className={cn('w-4 h-4', STATUS_STYLES.critical.fg)} strokeWidth={2} />
  }
  if (data.avg_health_score < HEALTH_HEALTHY) {
    return <AlertTriangle className={cn('w-4 h-4', STATUS_STYLES.warning.fg)} strokeWidth={2} />
  }
  return <CheckCircle className={cn('w-4 h-4', STATUS_STYLES.healthy.fg)} strokeWidth={2} />
}

function getStatusLabel(data: MonthlyHealthData): string {
  if (data.trend === 'offline' || data.avg_current < ACTIVE_CURRENT_THRESHOLD) return 'Offline'
  if (data.avg_health_score < HEALTH_WARNING) return 'Critical'
  if (data.avg_health_score < HEALTH_HEALTHY) return 'Warning'
  return 'Healthy'
}

/**
 * Segmented health bar (4 cells). Filled segments use STATUS_STYLES.*.dot
 * so the color vocabulary matches the rest of the app.
 */
function HealthBar({ score }: { score: number }) {
  const segments = 4
  const cappedScore = Math.min(100, score)
  const filledSegments = Math.round((cappedScore / 100) * segments)

  const filledDotClass =
    cappedScore >= HEALTH_HEALTHY
      ? STATUS_STYLES.healthy.dot
      : cappedScore >= HEALTH_WARNING
        ? STATUS_STYLES.warning.dot
        : STATUS_STYLES.critical.dot

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <div className="flex gap-0.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2.5 h-3 rounded-sm shrink-0',
              i < filledSegments ? filledDotClass : 'bg-slate-200',
            )}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-slate-700 ml-1 whitespace-nowrap">
        {cappedScore > 0 ? `${Math.round(cappedScore)}%` : '—'}
      </span>
    </div>
  )
}

function TrendBadge({ trend }: { trend: MonthlyHealthData['trend'] }) {
  const styleByTrend: Record<typeof trend, string> = {
    stable: 'text-slate-500',
    improving: STATUS_STYLES.healthy.fg,
    declining: STATUS_STYLES.critical.fg,
    offline: 'text-slate-400',
  }
  const label: Record<typeof trend, string> = {
    stable: 'Stable',
    improving: 'Improving',
    declining: 'Declining',
    offline: 'Offline',
  }
  return (
    <span className={cn('text-[10px] font-semibold', styleByTrend[trend])}>
      {label[trend]}
    </span>
  )
}

// Help Guide — collapsible explanation panel
function HealthGuide({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const info = STATUS_STYLES.info
  return (
    <div className={cn('mb-4 border rounded-sm overflow-hidden', info.border)}>
      <button
        onClick={onToggle}
        className={cn(
          'w-full px-3 py-2 flex items-center justify-between text-left transition-colors',
          info.bg,
          'hover:bg-blue-100',
        )}
      >
        <div className="flex items-center gap-2">
          <HelpCircle className={cn('w-4 h-4', info.fg)} strokeWidth={2} />
          <span className={cn('text-xs font-bold', info.fg)}>Understanding This Report</span>
        </div>
        {isOpen ? (
          <ChevronUp className={cn('w-4 h-4', info.fg)} strokeWidth={2} />
        ) : (
          <ChevronDown className={cn('w-4 h-4', info.fg)} strokeWidth={2} />
        )}
      </button>

      {isOpen && (
        <div className="p-3 bg-white text-xs space-y-3">
          <div>
            <h4 className="font-bold text-slate-900 mb-1">What This Report Shows</h4>
            <p className="text-slate-600">
              Each PV string (group of panels) should produce similar current. This report compares
              strings to detect problems like dirty panels, shading, or faulty connections.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-1">Column Guide</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
              <div><span className="font-semibold">Current:</span> Avg amps this month</div>
              <div><span className="font-semibold">Uptime:</span> % of daylight hours active</div>
              <div><span className="font-semibold">Alerts:</span> Issues detected this month</div>
              <div><span className="font-semibold">Health:</span> Performance vs other strings</div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-1">What We Detect</h4>
            <div className="grid grid-cols-1 gap-1 text-slate-600">
              <div className="flex items-center gap-2">
                <XCircle className={cn('w-3 h-3 shrink-0', STATUS_STYLES.critical.fg)} strokeWidth={2} />
                <span><span className="font-semibold">Critical:</span> &lt;50% performance — faulty panel, major issue</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn('w-3 h-3 shrink-0', STATUS_STYLES.warning.fg)} strokeWidth={2} />
                <span><span className="font-semibold">Warning:</span> &lt;75% performance — dirty panels, shading</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className={cn('w-3 h-3 shrink-0', STATUS_STYLES.info.fg)} strokeWidth={2} />
                <span><span className="font-semibold">Monitor:</span> &lt;90% performance — minor dust, watch trend</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-slate-400 shrink-0" strokeWidth={2} />
                <span><span className="font-semibold">Offline:</span> No output — disconnected or not installed</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-1">Tree Shadow Detection</h4>
            <p className="text-slate-600">
              If a string drops 15%+ at specific hours (e.g., 3-5 PM) while others don&apos;t,
              it&apos;s likely shaded by a tree or building. The report shows affected hours.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-1">Trend Indicators</h4>
            <div className="flex gap-4 text-slate-600">
              <span><span className={STATUS_STYLES.healthy.fg}>Improving</span> — Getting better</span>
              <span><span className="text-slate-500">Stable</span> — No change</span>
              <span><span className={STATUS_STYLES.critical.fg}>Declining</span> — Getting worse</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Severity badges for diagnosis buckets (critical / warning / info / offline). */
const SEVERITY_KEY: Record<Diagnosis['severity'], StatusKey> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
  offline: 'offline',
}

export function MonthlyHealthReport({ data, inverterAvgCurrent }: MonthlyHealthReportProps) {
  const [showGuide, setShowGuide] = useState(false)

  if (!data || data.length === 0) {
    return (
      <p className="text-center text-slate-500 py-4">
        No health data available for this period.
      </p>
    )
  }

  // Filter out strings that need attention (have diagnosis)
  const issueStrings = data.filter(d => d.diagnosis)

  // Calculate summary stats
  const healthyCount = data.filter(d => !d.diagnosis && d.avg_current >= ACTIVE_CURRENT_THRESHOLD).length
  const issueCount = issueStrings.length
  const offlineCount = data.filter(d => d.avg_current < ACTIVE_CURRENT_THRESHOLD).length

  return (
    <div className="space-y-4">
      {/* Help Guide */}
      <HealthGuide isOpen={showGuide} onToggle={() => setShowGuide(!showGuide)} />

      {/* Summary Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {healthyCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle className={cn('w-3.5 h-3.5', STATUS_STYLES.healthy.fg)} strokeWidth={2} />
              <span className="text-slate-600">
                <span className="font-mono font-semibold text-slate-900">{healthyCount}</span> Healthy
              </span>
            </span>
          )}
          {issueCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className={cn('w-3.5 h-3.5', STATUS_STYLES.warning.fg)} strokeWidth={2} />
              <span className="text-slate-600">
                <span className="font-mono font-semibold text-slate-900">{issueCount}</span> Need Attention
              </span>
            </span>
          )}
          {offlineCount > 0 && (
            <span className="flex items-center gap-1">
              <Circle className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
              <span className="text-slate-600">
                <span className="font-mono font-semibold text-slate-900">{offlineCount}</span> Offline
              </span>
            </span>
          )}
        </div>
        {inverterAvgCurrent !== undefined && inverterAvgCurrent > 0 && (
          <div className="text-slate-500">
            Avg: <span className="font-mono font-semibold text-slate-900">{inverterAvgCurrent.toFixed(2)}A</span>
          </div>
        )}
      </div>

      {/* Main table */}
      <div className="overflow-x-auto isolate">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[60px]">String</TableHead>
              <TableHead className="min-w-[70px]">Current</TableHead>
              <TableHead className="min-w-[60px]">Uptime</TableHead>
              <TableHead className="min-w-[50px]">Alerts</TableHead>
              <TableHead className="min-w-[100px]">Health</TableHead>
              <TableHead className="min-w-[80px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={row.string_number}
                className={row.diagnosis ? 'bg-amber-50/40' : ''}
              >
                <TableCell className="font-semibold font-mono text-slate-900">
                  PV{row.string_number}
                </TableCell>
                <TableCell>
                  {row.avg_current > 0 ? (
                    <span className="font-mono text-slate-700">{row.avg_current.toFixed(2)}A</span>
                  ) : (
                    <span className="font-mono text-slate-400">0.00A</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'text-xs font-mono font-semibold',
                      row.uptime_percent >= HEALTH_HEALTHY
                        ? STATUS_STYLES.healthy.fg
                        : row.uptime_percent >= HEALTH_CAUTION
                          ? STATUS_STYLES.warning.fg
                          : STATUS_STYLES.critical.fg,
                    )}
                  >
                    {row.uptime_percent > 0 ? `${Math.round(row.uptime_percent)}%` : '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={cn('font-mono', getAlertCountClass(row.alert_count))}>
                    {row.alert_count}
                  </span>
                </TableCell>
                <TableCell>
                  <HealthBar score={row.avg_health_score} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      {getStatusIcon(row)}
                      <span className="text-xs text-slate-700">
                        {getStatusLabel(row)}
                      </span>
                    </div>
                    {row.trend !== 'offline' && row.avg_current >= ACTIVE_CURRENT_THRESHOLD && (
                      <TrendBadge trend={row.trend} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Issues Section - sorted by severity */}
      {issueStrings.length > 0 && (() => {
        const severityOrder = { critical: 0, warning: 1, info: 2, offline: 3 }
        const sortedIssues = [...issueStrings].sort((a, b) =>
          (severityOrder[a.diagnosis!.severity] || 4) - (severityOrder[b.diagnosis!.severity] || 4),
        )
        const buckets: Array<{
          severity: Diagnosis['severity']
          icon: any
          label: string
        }> = [
          { severity: 'critical', icon: XCircle, label: 'Critical' },
          { severity: 'warning', icon: AlertTriangle, label: 'Warning' },
          { severity: 'info', icon: Circle, label: 'Monitor' },
          { severity: 'offline', icon: Circle, label: 'Offline' },
        ]

        return (
          <div className="mt-4 space-y-3">
            {buckets.map(({ severity, icon: Icon, label }) => {
              const rows = sortedIssues.filter(s => s.diagnosis!.severity === severity)
              if (rows.length === 0) return null
              const style = STATUS_STYLES[SEVERITY_KEY[severity]]
              return (
                <div
                  key={severity}
                  className={cn('p-3 rounded-sm border', style.bg, style.border)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('w-4 h-4', style.fg)} strokeWidth={2} />
                    <span className={cn('text-sm font-bold', style.fg)}>
                      {label} ({rows.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((row) => (
                      <li key={row.string_number} className="text-xs text-slate-700">
                        <span className="font-mono font-semibold text-slate-900">PV{row.string_number}:</span>{' '}
                        <span className={style.fg}>{row.diagnosis!.issue}</span>
                        {' — '}<span className="text-slate-600">{row.diagnosis!.action}</span>
                        {severity === 'warning' && row.alert_count > 0 && (
                          <span className="text-slate-400 ml-1 font-mono">({row.alert_count} alerts)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
