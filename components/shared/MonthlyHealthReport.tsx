import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, CheckCircle, XCircle, Circle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

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

function getAlertColor(count: number): string {
  if (count === 0) return 'text-gray-400'
  if (count <= 5) return 'text-orange-500'
  return 'text-red-600 font-semibold'
}

function getStatusIcon(data: MonthlyHealthData) {
  if (data.trend === 'offline' || data.avg_current < 0.1) {
    return <Circle className="w-4 h-4 text-gray-400" />
  }
  if (data.avg_health_score < 50) {
    return <XCircle className="w-4 h-4 text-red-500" />
  }
  if (data.avg_health_score < 75) {
    return <AlertTriangle className="w-4 h-4 text-amber-500" />
  }
  return <CheckCircle className="w-4 h-4 text-emerald-500" />
}

function getStatusLabel(data: MonthlyHealthData): string {
  if (data.trend === 'offline' || data.avg_current < 0.1) return 'Offline'
  if (data.avg_health_score < 50) return 'Critical'
  if (data.avg_health_score < 75) return 'Warning'
  return 'Healthy'
}

function HealthBar({ score }: { score: number }) {
  const segments = 4
  // Cap score at 100 for display
  const cappedScore = Math.min(100, score)
  const filledSegments = Math.round((cappedScore / 100) * segments)

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <div className="flex gap-0.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2.5 h-3 rounded-sm flex-shrink-0',
              i < filledSegments
                ? cappedScore >= 75 ? 'bg-emerald-500'
                  : cappedScore >= 50 ? 'bg-amber-500'
                  : 'bg-red-500'
                : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      <span className="text-xs text-gray-600 ml-1 whitespace-nowrap">
        {cappedScore > 0 ? `${Math.round(cappedScore)}%` : '—'}
      </span>
    </div>
  )
}

function TrendBadge({ trend }: { trend: MonthlyHealthData['trend'] }) {
  const styles: Record<typeof trend, string> = {
    stable: 'text-gray-500',
    improving: 'text-emerald-600',
    declining: 'text-red-500',
    offline: 'text-gray-400'
  }
  const labels: Record<typeof trend, string> = {
    stable: 'Stable',
    improving: 'Improving',
    declining: 'Declining',
    offline: 'Offline'
  }
  return (
    <span className={cn('text-[10px]', styles[trend])}>
      {labels[trend]}
    </span>
  )
}

// Help Guide Component
function HealthGuide({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="mb-4 border border-blue-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 bg-blue-50 flex items-center justify-between text-left hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-800">Understanding This Report</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-blue-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-600" />
        )}
      </button>

      {isOpen && (
        <div className="p-3 bg-white text-xs space-y-3">
          {/* What This Report Shows */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">What This Report Shows</h4>
            <p className="text-gray-600">
              Each PV string (group of panels) should produce similar current. This report compares
              strings to detect problems like dirty panels, shading, or faulty connections.
            </p>
          </div>

          {/* Column Explanations */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">Column Guide</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
              <div><span className="font-medium">Current:</span> Avg amps this month</div>
              <div><span className="font-medium">Uptime:</span> % of daylight hours active</div>
              <div><span className="font-medium">Alerts:</span> Issues detected this month</div>
              <div><span className="font-medium">Health:</span> Performance vs other strings</div>
            </div>
          </div>

          {/* Problem Detection */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">What We Detect</h4>
            <div className="grid grid-cols-1 gap-1 text-gray-600">
              <div className="flex items-center gap-2">
                <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                <span><span className="font-medium">Critical:</span> &lt;50% performance — faulty panel, major issue</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                <span><span className="font-medium">Warning:</span> &lt;75% performance — dirty panels, shading</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-blue-500 flex-shrink-0" />
                <span><span className="font-medium">Monitor:</span> &lt;90% performance — minor dust, watch trend</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span><span className="font-medium">Offline:</span> No output — disconnected or not installed</span>
              </div>
            </div>
          </div>

          {/* Shading Detection */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">Tree Shadow Detection</h4>
            <p className="text-gray-600">
              If a string drops 15%+ at specific hours (e.g., 3-5 PM) while others don&apos;t,
              it&apos;s likely shaded by a tree or building. The report shows affected hours.
            </p>
          </div>

          {/* Trend */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">Trend Indicators</h4>
            <div className="flex gap-4 text-gray-600">
              <span><span className="text-emerald-600">Improving</span> — Getting better</span>
              <span><span className="text-gray-500">Stable</span> — No change</span>
              <span><span className="text-red-500">Declining</span> — Getting worse</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MonthlyHealthReport({ data, inverterAvgCurrent }: MonthlyHealthReportProps) {
  const [showGuide, setShowGuide] = useState(false)

  if (!data || data.length === 0) {
    return (
      <p className="text-center text-gray-500 py-4">
        No health data available for this period.
      </p>
    )
  }

  // Filter out strings that need attention (have diagnosis)
  const issueStrings = data.filter(d => d.diagnosis)

  // Calculate summary stats
  const healthyCount = data.filter(d => !d.diagnosis && d.avg_current >= 0.1).length
  const issueCount = issueStrings.length
  const offlineCount = data.filter(d => d.avg_current < 0.1).length

  return (
    <div className="space-y-4">
      {/* Help Guide */}
      <HealthGuide isOpen={showGuide} onToggle={() => setShowGuide(!showGuide)} />

      {/* Summary Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {healthyCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-gray-600">{healthyCount} Healthy</span>
            </span>
          )}
          {issueCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-gray-600">{issueCount} Need Attention</span>
            </span>
          )}
          {offlineCount > 0 && (
            <span className="flex items-center gap-1">
              <Circle className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">{offlineCount} Offline</span>
            </span>
          )}
        </div>
        {inverterAvgCurrent !== undefined && inverterAvgCurrent > 0 && (
          <div className="text-gray-500">
            Avg: <span className="font-medium text-gray-700">{inverterAvgCurrent.toFixed(2)}A</span>
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
                className={cn(
                  row.diagnosis && 'bg-amber-50/50'
                )}
              >
                <TableCell className="font-medium text-gray-900">
                  PV{row.string_number}
                </TableCell>
                <TableCell>
                  {row.avg_current > 0 ? (
                    <span className="text-gray-700">{row.avg_current.toFixed(2)}A</span>
                  ) : (
                    <span className="text-gray-400">0.00A</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'text-xs',
                      row.uptime_percent >= 90 ? 'text-emerald-600'
                        : row.uptime_percent >= 70 ? 'text-amber-600'
                        : 'text-red-500'
                    )}
                  >
                    {row.uptime_percent > 0 ? `${Math.round(row.uptime_percent)}%` : '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={getAlertColor(row.alert_count)}>
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
                      <span className="text-xs text-gray-600">
                        {getStatusLabel(row)}
                      </span>
                    </div>
                    {row.trend !== 'offline' && row.avg_current >= 0.1 && (
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
          (severityOrder[a.diagnosis!.severity] || 4) - (severityOrder[b.diagnosis!.severity] || 4)
        )
        const criticalCount = sortedIssues.filter(s => s.diagnosis!.severity === 'critical').length
        const warningCount = sortedIssues.filter(s => s.diagnosis!.severity === 'warning').length
        const infoCount = sortedIssues.filter(s => s.diagnosis!.severity === 'info').length
        const offlineCount = sortedIssues.filter(s => s.diagnosis!.severity === 'offline').length

        return (
          <div className="mt-4 space-y-3">
            {/* Critical Issues */}
            {criticalCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">
                    Critical ({criticalCount})
                  </span>
                </div>
                <ul className="space-y-1">
                  {sortedIssues.filter(s => s.diagnosis!.severity === 'critical').map((row) => (
                    <li key={row.string_number} className="text-xs text-gray-700">
                      <span className="font-medium">PV{row.string_number}:</span>{' '}
                      <span className="text-red-700">{row.diagnosis!.issue}</span>
                      {' — '}<span className="text-gray-600">{row.diagnosis!.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warning Issues */}
            {warningCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    Warning ({warningCount})
                  </span>
                </div>
                <ul className="space-y-1">
                  {sortedIssues.filter(s => s.diagnosis!.severity === 'warning').map((row) => (
                    <li key={row.string_number} className="text-xs text-gray-700">
                      <span className="font-medium">PV{row.string_number}:</span>{' '}
                      <span className="text-amber-700">{row.diagnosis!.issue}</span>
                      {' — '}<span className="text-gray-600">{row.diagnosis!.action}</span>
                      {row.alert_count > 0 && (
                        <span className="text-gray-400 ml-1">({row.alert_count} alerts)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info Issues */}
            {infoCount > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Circle className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    Monitor ({infoCount})
                  </span>
                </div>
                <ul className="space-y-1">
                  {sortedIssues.filter(s => s.diagnosis!.severity === 'info').map((row) => (
                    <li key={row.string_number} className="text-xs text-gray-700">
                      <span className="font-medium">PV{row.string_number}:</span>{' '}
                      <span className="text-blue-700">{row.diagnosis!.issue}</span>
                      {' — '}<span className="text-gray-600">{row.diagnosis!.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Offline Issues */}
            {offlineCount > 0 && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Circle className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    Offline ({offlineCount})
                  </span>
                </div>
                <ul className="space-y-1">
                  {sortedIssues.filter(s => s.diagnosis!.severity === 'offline').map((row) => (
                    <li key={row.string_number} className="text-xs text-gray-700">
                      <span className="font-medium">PV{row.string_number}:</span>{' '}
                      <span className="text-gray-600">{row.diagnosis!.issue}</span>
                      {' — '}<span className="text-gray-500">{row.diagnosis!.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
