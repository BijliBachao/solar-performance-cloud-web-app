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
  Calendar,
  Loader2,
  RefreshCw,
  ChevronDown,
  Check,
} from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromSeverity,
  type StatusKey,
} from '@/lib/design-tokens'

interface AlertHistoryLogProps {
  plantId?: string
  deviceId?: string
  showResolveButton?: boolean
  className?: string
}

type SeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'
type StatusFilter = 'ALL' | 'ACTIVE' | 'RESOLVED'

interface AlertFilters {
  severity: SeverityFilter
  status: StatusFilter
  stringNumber: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

// 'peer-excluded' entries are unreachable in practice — peer-excluded strings
// never produce alert rows. Included for type-completeness only.
const ICONS_BY_KEY: Record<StatusKey, any> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  healthy: CheckCircle,
  offline: Info,
  'open-circuit': XCircle,
  'peer-excluded': Info,
}

const LEFT_BORDER_BY_KEY: Record<StatusKey, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-500',
  'open-circuit': 'border-l-rose-600',
  'peer-excluded': 'border-l-indigo-600',
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

      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      })
      if (plantId) params.set('plant_id', decodeURIComponent(plantId))

      if (filters.severity !== 'ALL') params.set('severity', filters.severity)
      if (filters.status === 'ACTIVE') params.set('resolved', 'false')
      else if (filters.status === 'RESOLVED') params.set('resolved', 'true')
      else params.set('resolved', 'all')
      if (filters.stringNumber !== 'ALL') params.set('string_number', filters.stringNumber)
      if (deviceId) params.set('device_id', deviceId)

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

  // ── Loading state ─────────────────────────────────────────
  if (loading && alerts.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-solar-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400 mt-2">Loading alert history…</p>
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────
  if (error) {
    const e = STATUS_STYLES.critical
    return (
      <div className={cn('p-4 rounded-md border', e.bg, e.border, className)}>
        <p className={cn('text-sm font-semibold mb-2', e.fg)}>Failed to load alert history</p>
        <p className={cn('text-xs mb-3', e.fg)}>{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchAlerts(1)}>
          <RefreshCw className="w-3 h-3 mr-1" strokeWidth={2} /> Try again
        </Button>
      </div>
    )
  }

  const total = pagination?.total ?? alerts.length

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Summary pills — clickable to filter by status ──────── */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryPill
          label="Total"
          count={total}
          dotColor="bg-slate-400"
          active={filters.status === 'ALL'}
          onClick={() => setFilters(f => ({ ...f, status: 'ALL' }))}
        />
        <SummaryPill
          label="Active"
          count={activeCount}
          dotColor={STATUS_STYLES.critical.dot}
          active={filters.status === 'ACTIVE'}
          onClick={() => setFilters(f => ({ ...f, status: 'ACTIVE' }))}
        />
        <SummaryPill
          label="Resolved"
          count={resolvedCount}
          dotColor={STATUS_STYLES.healthy.dot}
          active={filters.status === 'RESOLVED'}
          onClick={() => setFilters(f => ({ ...f, status: 'RESOLVED' }))}
        />
      </div>

      {/* ── Filter row — severity pills + PV select + refresh ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">
          Severity
        </span>
        <SeverityPill
          label="All"
          active={filters.severity === 'ALL'}
          onClick={() => setFilters(f => ({ ...f, severity: 'ALL' }))}
        />
        <SeverityPill
          label="Critical"
          dotColor={STATUS_STYLES.critical.dot}
          active={filters.severity === 'CRITICAL'}
          onClick={() => setFilters(f => ({ ...f, severity: 'CRITICAL' }))}
        />
        <SeverityPill
          label="Warning"
          dotColor={STATUS_STYLES.warning.dot}
          active={filters.severity === 'WARNING'}
          onClick={() => setFilters(f => ({ ...f, severity: 'WARNING' }))}
        />
        <SeverityPill
          label="Info"
          dotColor={STATUS_STYLES.info.dot}
          active={filters.severity === 'INFO'}
          onClick={() => setFilters(f => ({ ...f, severity: 'INFO' }))}
        />

        {availableStrings.length > 1 && (
          <Select
            value={filters.stringNumber}
            onValueChange={(v) => setFilters(prev => ({ ...prev, stringNumber: v }))}
          >
            <SelectTrigger className="w-[110px] h-7 text-[11px] ml-2">
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

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 ml-auto"
          onClick={() => fetchAlerts(1)}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={2} />
        </Button>
      </div>

      {/* ── Empty state ─────────────────────────────────────── */}
      {alerts.length === 0 && (
        <div className="text-center py-10 bg-emerald-50/40 rounded-md border border-emerald-100">
          <CheckCircle className="w-6 h-6 mx-auto mb-1.5 text-emerald-500" strokeWidth={2} />
          <p className="text-sm font-bold text-emerald-700">No alerts found</p>
          <p className="text-[11px] text-slate-500 mt-0.5">for the selected filters</p>
        </div>
      )}

      {/* ── Grouped list ────────────────────────────────────── */}
      <div className="space-y-5">
        {Array.from(groupedAlerts.entries()).map(([dateKey, dayAlerts]) => (
          <div key={dateKey}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
              <h3 className="text-[12px] font-bold text-slate-700">
                {formatDateHeader(dateKey)}
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                · {dayAlerts.length} alert{dayAlerts.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-1">
              {dayAlerts.map(alert => {
                const key = statusKeyFromSeverity(alert.severity)
                const style = STATUS_STYLES[key]
                const leftBorder = LEFT_BORDER_BY_KEY[key]
                const Icon = ICONS_BY_KEY[key]
                const isResolved = !!alert.resolved_at
                const isResolving = resolvingId === alert.id

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'rounded-sm border border-l-[3px] px-3 py-2 transition-colors',
                      leftBorder,
                      'border-slate-200',
                      isResolved ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50',
                    )}
                  >
                    {/* Row 1 — identity + status + time */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={cn(
                          'w-3.5 h-3.5 shrink-0',
                          isResolved ? 'text-slate-400' : style.fg,
                        )}
                        strokeWidth={2}
                      />
                      <span
                        className={cn(
                          'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0',
                          isResolved ? 'bg-slate-200 text-slate-600' : cn(style.bg, style.fg),
                        )}
                      >
                        {alert.severity}
                      </span>
                      <span
                        className={cn(
                          'text-[12px] font-bold shrink-0',
                          isResolved ? 'text-slate-500' : 'text-slate-900',
                        )}
                      >
                        PV{alert.string_number}
                      </span>
                      {alert.device_name && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {alert.device_name}
                        </span>
                      )}
                      {alert.gap_percent != null && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {Number(alert.gap_percent).toFixed(1)}% below avg
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0 rounded-sm shrink-0 ml-1',
                          isResolved
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200',
                        )}
                      >
                        {isResolved ? 'Resolved' : 'Active'}
                      </span>

                      <span className="ml-auto shrink-0 flex items-center gap-2">
                        {showResolveButton && !isResolved && (
                          <button
                            onClick={() => handleResolve(alert.id)}
                            disabled={isResolving}
                            title="Resolve alert"
                            className="shrink-0 flex items-center justify-center w-5 h-5 rounded-sm border border-solar-gold/40 text-solar-gold-700 hover:bg-solar-gold hover:text-white hover:border-solar-gold transition-colors disabled:opacity-50"
                          >
                            {isResolving ? (
                              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                            ) : (
                              <Check className="w-3 h-3" strokeWidth={2.5} />
                            )}
                          </button>
                        )}
                      </span>
                    </div>

                    {/* Row 2 — message */}
                    {alert.message && (
                      <p
                        className={cn(
                          'text-[11px] mt-1 ml-[1.5rem] truncate',
                          isResolved ? 'text-slate-400' : 'text-slate-600',
                        )}
                      >
                        {alert.message}
                      </p>
                    )}

                    {/* Row 3 — expected vs actual (if present) */}
                    {(alert.expected_value != null || alert.actual_value != null) && (
                      <div className="flex gap-3 mt-1 ml-[1.5rem] text-[10px] font-mono text-slate-500">
                        {alert.expected_value != null && (
                          <span>
                            <span className="text-slate-400">Expected</span>{' '}
                            {Number(alert.expected_value).toFixed(2)} A
                          </span>
                        )}
                        {alert.actual_value != null && (
                          <span>
                            <span className="text-slate-400">Actual</span>{' '}
                            {Number(alert.actual_value).toFixed(2)} A
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 4 — timeline (created · resolved · duration) */}
                    <div className="flex items-center gap-3 mt-1 ml-[1.5rem] text-[10px] text-slate-500 flex-wrap">
                      <span>
                        <span className="text-slate-400">Created</span>{' '}
                        <span className="font-mono font-semibold text-slate-600">
                          {formatAlertTime(alert.created_at)}
                        </span>
                      </span>
                      {isResolved ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-emerald-700">
                            <span className="text-slate-400">Resolved</span>{' '}
                            <span className="font-mono font-semibold">
                              {formatAlertTime(alert.resolved_at!)}
                            </span>
                            {alert.resolved_by_name && (
                              <span className="text-slate-500"> by {alert.resolved_by_name}</span>
                            )}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-500">
                            Duration {calculateDuration(new Date(alert.created_at), new Date(alert.resolved_at!))}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono font-semibold text-slate-700">
                            Active {calculateDuration(new Date(alert.created_at))}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Load more ──────────────────────────────────────── */}
      {pagination && pagination.page < pagination.totalPages && (
        <div className="text-center pt-3">
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
            Load more ({pagination.total - alerts.length} remaining)
          </Button>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="text-center text-[10px] text-slate-400 font-mono">
          Showing {alerts.length} of {pagination.total}
        </div>
      )}
    </div>
  )
}

// ── Small stateless helpers ──────────────────────────────────

function SummaryPill({
  label,
  count,
  dotColor,
  active,
  onClick,
}: {
  label: string
  count: number
  dotColor: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border transition-all text-left',
        active
          ? 'bg-white border-solar-gold/40 shadow-card'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
      <span className="text-lg font-mono font-bold text-slate-900 leading-none">
        {count}
      </span>
    </button>
  )
}

function SeverityPill({
  label,
  dotColor,
  active,
  onClick,
}: {
  label: string
  dotColor?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border transition-colors',
        active
          ? 'bg-solar-gold/10 text-solar-gold-700 border-solar-gold/40'
          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700',
      )}
    >
      {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />}
      {label}
    </button>
  )
}
