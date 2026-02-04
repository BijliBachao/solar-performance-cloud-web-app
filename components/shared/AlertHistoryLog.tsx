'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertData,
  calculateDuration,
  getSeverityConfig,
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

const severityStyles: Record<string, { border: string; bg: string; badge: string; color: string }> = {
  CRITICAL: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    color: 'text-red-600',
  },
  WARNING: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    color: 'text-amber-600',
  },
  INFO: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    color: 'text-blue-600',
  },
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

      // Decode plantId in case it's URL-encoded (e.g., from route params)
      const decodedPlantId = decodeURIComponent(plantId)
      const params = new URLSearchParams({
        plant_id: decodedPlantId,
        page: String(page),
        limit: '50',
      })

      // Apply filters
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
        // Extract unique string numbers for filter dropdown
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

  // Initial fetch
  useEffect(() => {
    fetchAlerts(1)
  }, [fetchAlerts])

  // Handle resolve
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
        // Update local state
        setAlerts(prev =>
          prev.map(a =>
            a.id === alertId
              ? { ...a, resolved_at: new Date().toISOString(), resolved_by: 'You' }
              : a
          )
        )
      }
    } catch {
      // Silent fail
    } finally {
      setResolvingId(null)
    }
  }

  // Load more
  const loadMore = () => {
    if (pagination && pagination.page < pagination.totalPages) {
      fetchAlerts(pagination.page + 1, true)
    }
  }

  // Summary stats
  const activeCount = alerts.filter(a => !a.resolved_at).length
  const resolvedCount = alerts.filter(a => a.resolved_at).length

  // Group alerts by date
  const groupedAlerts = groupAlertsByDate(alerts)

  // Loading state
  if (loading && alerts.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
          <p className="text-xs text-gray-400 mt-2">Loading alert history...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-4 border border-red-200 rounded-lg bg-red-50', className)}>
        <p className="text-sm text-red-600 mb-2">Failed to load alert history</p>
        <p className="text-xs text-red-500 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchAlerts(1)}>
          <RefreshCw className="w-3 h-3 mr-1" /> Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Filter className="w-3.5 h-3.5" />
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
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Summary Stats */}
      {pagination && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{pagination.total} total alerts</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            {activeCount} active
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            {resolvedCount} resolved
          </span>
        </div>
      )}

      {/* Empty State */}
      {alerts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p className="text-sm">No alerts found for the selected filters</p>
        </div>
      )}

      {/* Grouped Alert List */}
      <div className="space-y-6">
        {Array.from(groupedAlerts.entries()).map(([dateKey, dayAlerts]) => (
          <div key={dateKey}>
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-700">{formatDateHeader(dateKey)}</h3>
              <span className="text-xs text-gray-400">({dayAlerts.length} alerts)</span>
            </div>

            {/* Alerts for this date */}
            <div className="space-y-2 pl-1">
              {dayAlerts.map(alert => {
                const style = severityStyles[alert.severity] || severityStyles.INFO
                const Icon = severityIcons[alert.severity] || Info
                const isResolved = !!alert.resolved_at
                const isResolving = resolvingId === alert.id

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'border-l-4 rounded-r-lg p-3 transition-colors',
                      style.border,
                      isResolved ? 'bg-gray-50' : style.bg
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', isResolved ? 'text-gray-400' : style.color)} />
                        <div className="min-w-0 flex-1">
                          {/* Top line: severity + string + device + gap */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'text-[10px] font-bold px-1.5 py-0.5 rounded',
                              isResolved ? 'bg-gray-200 text-gray-600' : style.badge
                            )}>
                              {alert.severity}
                            </span>
                            <span className={cn('text-sm font-medium', isResolved ? 'text-gray-500' : 'text-gray-900')}>
                              PV{alert.string_number}
                            </span>
                            {alert.device_name && (
                              <span className="text-xs text-gray-400">{alert.device_name}</span>
                            )}
                            {alert.gap_percent != null && (
                              <span className="text-xs text-gray-500">
                                {Number(alert.gap_percent).toFixed(1)}% below avg
                              </span>
                            )}
                            {isResolved && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
                                Resolved
                              </Badge>
                            )}
                            {!isResolved && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Active
                              </Badge>
                            )}
                          </div>

                          {/* Message */}
                          <p className={cn('text-xs mt-1', isResolved ? 'text-gray-400' : 'text-gray-600')}>
                            {alert.message}
                          </p>

                          {/* Values if present */}
                          {(alert.expected_value != null || alert.actual_value != null) && (
                            <div className="flex gap-4 mt-1 text-[11px] text-gray-500">
                              {alert.expected_value != null && (
                                <span>Expected: {Number(alert.expected_value).toFixed(2)}A</span>
                              )}
                              {alert.actual_value != null && (
                                <span>Actual: {Number(alert.actual_value).toFixed(2)}A</span>
                              )}
                            </div>
                          )}

                          {/* Timeline info */}
                          <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Created: {formatAlertTime(alert.created_at)}
                            </span>
                            {isResolved ? (
                              <>
                                <span className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="w-3 h-3" />
                                  Resolved: {formatAlertTime(alert.resolved_at!)}
                                  {alert.resolved_by_name && ` by ${alert.resolved_by_name}`}
                                </span>
                                <span className="text-gray-400">
                                  Duration: {calculateDuration(new Date(alert.created_at), new Date(alert.resolved_at!))}
                                </span>
                              </>
                            ) : (
                              <span className="flex items-center gap-1 font-medium text-gray-700">
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
                          className="text-xs flex-shrink-0 h-7"
                        >
                          {isResolving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
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
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <ChevronDown className="w-3 h-3 mr-1" />
            )}
            Load More ({pagination.total - alerts.length} remaining)
          </Button>
        </div>
      )}

      {/* Page indicator */}
      {pagination && pagination.totalPages > 1 && (
        <div className="text-center text-xs text-gray-400">
          Showing {alerts.length} of {pagination.total} alerts
        </div>
      )}
    </div>
  )
}
