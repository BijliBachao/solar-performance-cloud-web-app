'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertData,
  calculateDuration,
  groupAlertsByDate,
  formatDateHeader,
  formatAlertTime,
} from '@/lib/alert-utils'
import {
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle,
  Clock,
  Calendar,
  Filter,
  Loader2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromSeverity,
  type StatusKey,
} from '@/lib/design-tokens'

interface AlertHistoryLogProps {
  plantId: string
  deviceId?: string
  showResolveButton?: boolean
  className?: string
}

interface AlertFilters {
  severity: 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'
  status: 'ALL' | 'ACTIVE' | 'RESOLVED'
  stringNumber: string // 'ALL' or number as string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

const severityIcons: Record<string, any> = {
  CRITICAL: XCircle,
  WARNING: AlertTriangle,
  INFO: Info,
}

/**
 * Strong left-border accent per severity. Maps to the dot/solid-500 variant
 * of the status, matching AlertPanel + FaultDiagnosisPanel.
 */
const LEFT_BORDER_BY_KEY: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-violet-600',
}

export function AlertHistoryLog({
  plantId,
  deviceId,
  showResolveButton = false,
  className,
}: AlertHistoryLogProps) {
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [filters, setFilters] = useState<AlertFilters>({
    severity: 'ALL',
    status: 'ALL',
    stringNumber: 'ALL',
  })
  const [availableStrings, setAvailableStrings] = useState<number[]>([])
  const [resolvingId, setResolvingId] = useState<number | null>(null)

  // Fetch alerts
  const fetchAlerts = useCallback(async (page = 1, append = false) => {
    try {
      if (!append) setLoading(true)
      setError(null)

      const decodedPlantId = decodeURIComponent(plantId)
      const params = new URLSearchParams({
        plant_id: decodedPlantId,
        page: String(page),
        limit: '50',
      })

      if (filters.severity !== 'ALL') {
        params.set('severity', filters.severity)
      }
      if (filters.status === 'ACTIVE') {
        params.set('resolved', 'false')
      } else if (filters.status === 'RESOLVED') {
        params.set('resolved', 'true')
      } else {
        params.set('resolved', 'all')
      }
      if (filters.stringNumber !== 'ALL') {
        params.set('string_number', filters.stringNumber)
      }
      if (deviceId) {
        params.set('device_id', deviceId)
      }

      const res = await fetch(`/api/alerts?${params}`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch alerts')
      }

      const data = await res.json()

      if (append) {
        setAlerts(prev => [...prev, ...data.alerts])
      } else {
        setAlerts(data.alerts)
        const strings = [...new Set(data.alerts.map((a: AlertData) => a.string_number))] as number[]
        setAvailableStrings(strings.sort((a, b) => a - b))
      }
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [plantId, deviceId, filters])

  useEffect(() => {
    fetchAlerts(1)
  }, [fetchAlerts])

  const handleResolve = async (alertId: number) => {
    try {
      setResolvingId(alertId)
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolve: true }),
        credentials: 'include',
      })
      if (res.ok) {
        setAlerts(prev =>
          prev.map(a =>
            a.id === alertId
              ? { ...a, resolved_at: new Date().toISOString(), resolved_by: 'You' }
              : a,
          ),
        )
      }
    } catch {
      /* silent */
    } finally {
      setResolvingId(null)
    }
  }

  const loadMore = () => {
    if (pagination && pagination.page < pagination.totalPages) {
      fetchAlerts(pagination.page + 1, true)
    }
  }

  const activeCount = alerts.filter(a => !a.resolved_at).length
  const resolvedCount = alerts.filter(a => a.resolved_at).length
  const groupedAlerts = groupAlertsByDate(alerts)

  // Loading state
  if (loading && alerts.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-spc-green border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400 mt-2">Loading alert history...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    const e = STATUS_STYLES.critical
    return (
      <div className={cn('p-4 rounded-sm border', e.bg, e.border, className)}>
        <p className={cn('text-sm font-semibold mb-2', e.fg)}>Failed to load alert history</p>
        <p className={cn('text-xs mb-3', e.fg)}>{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchAlerts(1)}>
          <RefreshCw className="w-3 h-3 mr-1" strokeWidth={2} /> Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Filter className="w-3.5 h-3.5" strokeWidth={2} />
          <span>Filters:</span>
        </div>

        {/* Severity Filter */}
        <Select
          value={filters.severity}
          onValueChange={(v) => setFilters(prev => ({ ...prev, severity: v as any }))}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters(prev => ({ ...prev, status: v as any }))}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>

        {/* String Filter */}
        {availableStrings.length > 1 && (
          <Select
            value={filters.stringNumber}
            onValueChange={(v) => setFilters(prev => ({ ...prev, stringNumber: v }))}
          >
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue placeholder="String" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Strings</SelectItem>
              {availableStrings.map(num => (
                <SelectItem key={num} value={String(num)}>PV{num}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Refresh Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => fetchAlerts(1)}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={2} />
        </Button>
      </div>

      {/* Summary Stats */}
      {pagination && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>
            <span className="font-mono font-semibold text-slate-700">{pagination.total}</span> total alerts
          </span>
          <span className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.critical.dot)} />
            <span className="font-mono font-semibold text-slate-700">{activeCount}</span>
            <span>active</span>
          </span>
          <span className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.healthy.dot)} />
            <span className="font-mono font-semibold text-slate-700">{resolvedCount}</span>
            <span>resolved</span>
          </span>
        </div>
      )}

      {/* Empty State */}
      {alerts.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <CheckCircle className={cn('w-8 h-8 mx-auto mb-2', STATUS_STYLES.healthy.fg)} strokeWidth={2} />
          <p className="text-sm">No alerts found for the selected filters</p>
        </div>
      )}

      {/* Grouped Alert List */}
      <div className="space-y-6">
        {Array.from(groupedAlerts.entries()).map(([dateKey, dayAlerts]) => (
          <div key={dateKey}>
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-slate-400" strokeWidth={2} />
              <h3 className="text-sm font-bold text-slate-700">{formatDateHeader(dateKey)}</h3>
              <span className="text-xs text-slate-400 font-mono">({dayAlerts.length} alerts)</span>
            </div>

            {/* Alerts for this date */}
            <div className="space-y-2 pl-1">
              {dayAlerts.map(alert => {
                const key = statusKeyFromSeverity(alert.severity)
                const style = STATUS_STYLES[key]
                const leftBorder = LEFT_BORDER_BY_KEY[key]
                const Icon = severityIcons[alert.severity] || Info
                const isResolved = !!alert.resolved_at
                const isResolving = resolvingId === alert.id
                const resolvedStyle = STATUS_STYLES.healthy

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'rounded-sm border border-l-[3px] border-slate-200 p-3 transition-colors',
                      leftBorder,
                      isResolved ? 'bg-slate-50' : style.bg,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <Icon
                          className={cn(
                            'h-4 w-4 mt-0.5 shrink-0',
                            isResolved ? 'text-slate-400' : style.fg,
                          )}
                          strokeWidth={2}
                        />
                        <div className="min-w-0 flex-1">
                          {/* Top line: severity + string + device + gap */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                'text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm',
                                isResolved
                                  ? 'bg-slate-200 text-slate-600'
                                  : cn(style.bg, style.fg),
                              )}
                            >
                              {alert.severity}
                            </span>
                            <span
                              className={cn(
                                'text-sm font-bold',
                                isResolved ? 'text-slate-500' : 'text-slate-900',
                              )}
                            >
                              PV{alert.string_number}
                            </span>
                            {alert.device_name && (
                              <span className="text-xs text-slate-400">{alert.device_name}</span>
                            )}
                            {alert.gap_percent != null && (
                              <span className="text-xs font-mono text-slate-500">
                                {Number(alert.gap_percent).toFixed(1)}% below avg
                              </span>
                            )}
                            {isResolved && (
                              <span
                                className={cn(
                                  'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0 rounded-sm border',
                                  resolvedStyle.bg,
                                  resolvedStyle.fg,
                                  resolvedStyle.border,
                                )}
                              >
                                Resolved
                              </span>
                            )}
                            {!isResolved && (
                              <span
                                className={cn(
                                  'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0 rounded-sm',
                                  STATUS_STYLES.critical.solid,
                                )}
                              >
                                Active
                              </span>
                            )}
                          </div>

                          {/* Message */}
                          <p
                            className={cn(
                              'text-xs mt-1',
                              isResolved ? 'text-slate-400' : 'text-slate-600',
                            )}
                          >
                            {alert.message}
                          </p>

                          {/* Values if present */}
                          {(alert.expected_value != null || alert.actual_value != null) && (
                            <div className="flex gap-4 mt-1 text-[11px] text-slate-500 font-mono">
                              {alert.expected_value != null && (
                                <span>Expected: {Number(alert.expected_value).toFixed(2)}A</span>
                              )}
                              {alert.actual_value != null && (
                                <span>Actual: {Number(alert.actual_value).toFixed(2)}A</span>
                              )}
                            </div>
                          )}

                          {/* Timeline info */}
                          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" strokeWidth={2} />
                              Created: <span className="font-mono">{formatAlertTime(alert.created_at)}</span>
                            </span>
                            {isResolved ? (
                              <>
                                <span className={cn('flex items-center gap-1', STATUS_STYLES.healthy.fg)}>
                                  <CheckCircle className="w-3 h-3" strokeWidth={2} />
                                  Resolved: <span className="font-mono">{formatAlertTime(alert.resolved_at!)}</span>
                                  {alert.resolved_by_name && ` by ${alert.resolved_by_name}`}
                                </span>
                                <span className="text-slate-400 font-mono">
                                  Duration: {calculateDuration(new Date(alert.created_at), new Date(alert.resolved_at!))}
                                </span>
                              </>
                            ) : (
                              <span className="flex items-center gap-1 font-semibold text-slate-700 font-mono">
                                Active for {calculateDuration(new Date(alert.created_at))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Resolve Button */}
                      {showResolveButton && !isResolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResolve(alert.id)}
                          disabled={isResolving}
                          className="text-xs shrink-0 h-7"
                        >
                          {isResolving ? (
                            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                          ) : (
                            'Resolve'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {pagination && pagination.page < pagination.totalPages && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loading}
            className="text-xs"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" strokeWidth={2} />
            ) : (
              <ChevronDown className="w-3 h-3 mr-1" strokeWidth={2} />
            )}
            Load More ({pagination.total - alerts.length} remaining)
          </Button>
        </div>
      )}

      {/* Page indicator */}
      {pagination && pagination.totalPages > 1 && (
        <div className="text-center text-xs text-slate-400 font-mono">
          Showing {alerts.length} of {pagination.total} alerts
        </div>
      )}
    </div>
  )
}
