'use client'
import { useEffect, useState, useCallback } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { cn } from '@/lib/utils'
import {
  Bell, Clock, XCircle, AlertTriangle, Info, CheckCircle,
  Check, Loader2, RefreshCw, ChevronDown, Calendar,
} from 'lucide-react'
import { STATUS_STYLES, statusKeyFromSeverity } from '@/lib/design-tokens'
import {
  calculateDuration, groupAlertsByDate, formatDateHeader,
  formatAlertTime, type AlertData,
} from '@/lib/alert-utils'

// ── Types ───────────────────────────────────────────────────────────────
interface Summary {
  active: { critical: number; warning: number; info: number; total: number }
  resolvedToday: number
}
interface PlantOption { id: string; plant_name: string }
type StatusFilter = 'active' | 'resolved' | 'all'
type SeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'

// ── Shared pill style — matches the rest of the app ────────────────────
const PILL_BASE = 'px-3 py-1.5 text-xs font-semibold rounded-sm border transition-colors'
const PILL_ACTIVE = 'bg-solar-gold/10 text-solar-gold-700 border-solar-gold/30'
const PILL_IDLE = 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-900'

const LEFT_BORDER: Record<string, string> = {
  critical: 'border-l-red-600',
  warning: 'border-l-amber-600',
  info: 'border-l-blue-700',
  healthy: 'border-l-emerald-600',
  offline: 'border-l-slate-400',
  'open-circuit': 'border-l-rose-600',
}
const SEVERITY_ICON: Record<string, any> = {
  critical: XCircle, warning: AlertTriangle, info: Info,
  healthy: CheckCircle, offline: Info, 'open-circuit': XCircle,
}

// ── Page ────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'string' | 'hardware'>('string')
  const [plants, setPlants] = useState<PlantOption[]>([])
  const [selectedPlant, setSelectedPlant] = useState('')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  const [status, setStatus] = useState<StatusFilter>('active')
  const [severity, setSeverity] = useState<SeverityFilter>('ALL')
  const [page, setPage] = useState(1)
  const [resolvingId, setResolvingId] = useState<number | null>(null)

  // Load plants once
  useEffect(() => {
    fetch('/api/dashboard/main', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setPlants((d.plants || []).map((p: any) => ({ id: p.id, plant_name: p.plant_name }))))
      .catch(() => {})
  }, [])

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedPlant) params.set('plant_id', selectedPlant)
      const res = await fetch(`/api/alerts/summary?${params}`, { credentials: 'include' })
      if (res.ok) setSummary(await res.json())
    } finally {
      setSummaryLoading(false)
    }
  }, [selectedPlant])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const fetchAlerts = useCallback(async (append = false) => {
    if (!append) setListLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (selectedPlant) params.set('plant_id', selectedPlant)
      if (severity !== 'ALL') params.set('severity', severity)
      if (status === 'active') params.set('resolved', 'false')
      else if (status === 'resolved') params.set('resolved', 'true')
      else params.set('resolved', 'all')
      const res = await fetch(`/api/alerts?${params}`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setAlerts(prev => append ? [...prev, ...data.alerts] : data.alerts)
      setPagination(data.pagination)
    } finally {
      setListLoading(false)
    }
  }, [selectedPlant, severity, status, page])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  const applyStatus = (s: StatusFilter) => { setStatus(s); setSeverity('ALL'); setPage(1) }
  const applySeverity = (s: SeverityFilter) => { setSeverity(s); setPage(1) }
  const applyPlant = (id: string) => { setSelectedPlant(id); setPage(1) }
  const applyKpi = (sev: SeverityFilter) => { setStatus('active'); setSeverity(sev); setPage(1) }

  const handleResolve = async (id: number) => {
    setResolvingId(id)
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ resolve: true }),
      })
      if (res.ok) {
        setAlerts(prev => prev.map(a =>
          a.id === id ? { ...a, resolved_at: new Date().toISOString() } : a
        ))
        fetchSummary()
      }
    } finally { setResolvingId(null) }
  }

  const refresh = () => { setPage(1); fetchSummary(); fetchAlerts() }
  const loadMore = () => { const next = pagination.page + 1; setPage(next); fetchAlerts(true) }
  const grouped = groupAlertsByDate(alerts)

  return (
    <PageWrapper title="Alerts" loading={false}>
      <div className="space-y-5">

        {/* ── Tab bar ─────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-slate-200 -mx-6 px-6">
          {([
            { id: 'string',   label: 'String Alerts',   icon: Bell,  available: true  },
            { id: 'hardware', label: 'Hardware Faults',  icon: Clock, available: true  },
          ] as const).map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => tab.available && setActiveTab(tab.id)}
                disabled={!tab.available}
                className={cn(
                  'relative flex items-center gap-1.5 px-5 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors select-none',
                  isActive
                    ? 'text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-solar-gold after:rounded-t-full'
                    : tab.available
                      ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      : 'text-slate-300 cursor-not-allowed',
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                {tab.label}
                {!tab.available && (
                  <span className="text-[8px] font-bold uppercase text-slate-400 border border-slate-200 px-1 py-0.5 rounded-sm">
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── String Alerts ──────────────────────────────────── */}
        {activeTab === 'string' && (
          <div className="space-y-4">

            {/* KPI cards — use existing KpiCard component */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                title="Critical"
                value={summaryLoading ? '—' : String(summary?.active.critical ?? 0)}
                subtitle="active alerts"
                icon={XCircle}
                accent="red"
                onClick={() => applyKpi('CRITICAL')}
              />
              <KpiCard
                title="Warning"
                value={summaryLoading ? '—' : String(summary?.active.warning ?? 0)}
                subtitle="active alerts"
                icon={AlertTriangle}
                accent="amber"
                onClick={() => applyKpi('WARNING')}
              />
              <KpiCard
                title="Info"
                value={summaryLoading ? '—' : String(summary?.active.info ?? 0)}
                subtitle="active alerts"
                icon={Info}
                accent="blue"
                onClick={() => applyKpi('INFO')}
              />
              <KpiCard
                title="Resolved Today"
                value={summaryLoading ? '—' : String(summary?.resolvedToday ?? 0)}
                subtitle="cleared today"
                icon={CheckCircle}
                accent="green"
                onClick={() => applyStatus('resolved')}
              />
            </div>

            {/* ── Filter bar — one row, labeled groups ──────── */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">

              {/* Status group */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">Status</span>
                {([
                  ['active',   'Unresolved'],
                  ['resolved', 'Resolved'],
                  ['all',      'All'],
                ] as [StatusFilter, string][]).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => applyStatus(v)}
                    className={cn(PILL_BASE, status === v ? PILL_ACTIVE : PILL_IDLE)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Severity group */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">Severity</span>
                {([
                  ['ALL',      null,           'All'],
                  ['CRITICAL', 'bg-red-500',   'Critical'],
                  ['WARNING',  'bg-amber-500', 'Warning'],
                  ['INFO',     'bg-blue-500',  'Info'],
                ] as [SeverityFilter, string | null, string][]).map(([v, dot, label]) => (
                  <button
                    key={v}
                    onClick={() => applySeverity(v)}
                    className={cn(PILL_BASE, 'flex items-center gap-1', severity === v ? PILL_ACTIVE : PILL_IDLE)}
                  >
                    {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />}
                    {label}
                  </button>
                ))}
              </div>

              {/* Right side: plant select + refresh + count */}
              <div className="flex items-center gap-2 ml-auto">
                {plants.length > 1 && (
                  <select
                    value={selectedPlant}
                    onChange={e => applyPlant(e.target.value)}
                    className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none"
                  >
                    <option value="">All Plants</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.plant_name}</option>)}
                  </select>
                )}
                <button
                  onClick={refresh}
                  disabled={listLoading}
                  className="flex items-center justify-center w-7 h-7 rounded-sm border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', listLoading && 'animate-spin')} strokeWidth={2} />
                </button>
                {pagination.total > 0 && (
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {pagination.total} alert{pagination.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* ── Alert list ────────────────────────────────── */}
            <div className="space-y-5">
              {listLoading && alerts.length === 0 ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-sm" />)}
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-emerald-50/40 rounded-md border border-emerald-100">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mb-2" strokeWidth={1.5} />
                  <p className="text-sm font-bold text-emerald-700">No alerts found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">for the selected filters</p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([dateKey, dayAlerts]) => (
                  <div key={dateKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                      <span className="text-[12px] font-bold text-slate-700">{formatDateHeader(dateKey)}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        · {dayAlerts.length} alert{dayAlerts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayAlerts.map(alert => (
                        <AlertRow
                          key={alert.id}
                          alert={alert}
                          showResolve={status !== 'resolved'}
                          resolving={resolvingId === alert.id}
                          onResolve={handleResolve}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Load more */}
            {!listLoading && pagination.page < pagination.totalPages && (
              <div className="text-center pt-1">
                <button
                  onClick={loadMore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-sm text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
                  Load more · {pagination.total - alerts.length} remaining
                </button>
              </div>
            )}

          </div>
        )}

        {/* ── Hardware Faults tab ───────────────────────────── */}
        {activeTab === 'hardware' && (
          <HardwareFaultsTab plants={plants} />
        )}

      </div>
    </PageWrapper>
  )
}

// ── Alert Row ───────────────────────────────────────────────────────────
function AlertRow({
  alert, showResolve, resolving, onResolve,
}: {
  alert: AlertData
  showResolve: boolean
  resolving: boolean
  onResolve: (id: number) => void
}) {
  const isResolved = !!alert.resolved_at
  const key = statusKeyFromSeverity(alert.severity)
  const style = STATUS_STYLES[key]
  const Icon = SEVERITY_ICON[key] ?? Info
  const leftBorder = LEFT_BORDER[key]

  return (
    <div className={cn(
      'border border-l-[3px] rounded-sm px-3 py-2.5 transition-colors',
      leftBorder,
      isResolved ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-200 hover:bg-slate-50',
    )}>

      {/* Row 1: icon · severity · device›string · gap · [status] · time · duration · action */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', isResolved ? 'text-slate-400' : style.fg)} strokeWidth={2} />

        <span className={cn(
          'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0',
          isResolved ? 'bg-slate-100 text-slate-500' : cn(style.bg, style.fg),
        )}>
          {alert.severity}
        </span>

        <span className={cn('text-[13px] font-bold shrink-0', isResolved ? 'text-slate-500' : 'text-slate-900')}>
          {alert.device_name ? `${alert.device_name} › PV${alert.string_number}` : `PV${alert.string_number}`}
        </span>

        {alert.gap_percent != null && (
          <span className="text-[10px] font-mono text-slate-500 shrink-0">
            {Number(alert.gap_percent).toFixed(1)}% below avg
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Active / Resolved badge */}
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border shrink-0',
            isResolved
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200',
          )}>
            {isResolved ? 'Resolved' : 'Active'}
          </span>

          <span className="text-[10px] font-mono text-slate-400 tabular-nums shrink-0">
            {formatAlertTime(alert.created_at)}
          </span>

          {!isResolved && (
            <span className="text-[10px] font-bold font-mono text-slate-700 tabular-nums shrink-0">
              {calculateDuration(new Date(alert.created_at))}
            </span>
          )}

          {showResolve && !isResolved && (
            <button
              onClick={() => onResolve(alert.id)}
              disabled={resolving}
              title="Mark resolved"
              className="shrink-0 flex items-center justify-center w-5 h-5 rounded-sm border border-solar-gold/40 text-solar-gold-700 hover:bg-solar-gold hover:text-white hover:border-solar-gold transition-colors disabled:opacity-50"
            >
              {resolving
                ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                : <Check className="w-3 h-3" strokeWidth={2.5} />
              }
            </button>
          )}
        </div>
      </div>

      {/* Row 2: message */}
      {alert.message && (
        <p className={cn('text-[11px] mt-1 ml-[1.5rem] truncate', isResolved ? 'text-slate-400' : 'text-slate-600')}>
          {alert.message}
        </p>
      )}

      {/* Row 3: expected · actual */}
      {(alert.expected_value != null || alert.actual_value != null) && (
        <div className="flex gap-3 mt-0.5 ml-[1.5rem] text-[10px] font-mono text-slate-400">
          {alert.expected_value != null && (
            <span>Expected <span className="text-slate-600">{Number(alert.expected_value).toFixed(2)} A</span></span>
          )}
          {alert.actual_value != null && (
            <span>Actual <span className="text-slate-600">{Number(alert.actual_value).toFixed(2)} A</span></span>
          )}
        </div>
      )}

      {/* Row 4: resolved timeline */}
      {isResolved && alert.resolved_at && (
        <div className="flex flex-wrap items-center gap-2 mt-0.5 ml-[1.5rem] text-[10px] text-slate-400">
          <span>
            Created <span className="font-mono font-semibold text-slate-500">{formatAlertTime(alert.created_at)}</span>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            Resolved <span className="font-mono font-semibold text-slate-500">{formatAlertTime(alert.resolved_at)}</span>
            {alert.resolved_by_name && <span> by {alert.resolved_by_name}</span>}
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-slate-500">
            Duration {calculateDuration(new Date(alert.created_at), new Date(alert.resolved_at))}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Hardware Faults Tab ─────────────────────────────────────────────
interface VendorAlarm {
  id: string
  device_id: string
  device_name: string
  plant_id: string
  plant_name: string
  provider: string
  alarm_code: string | null
  severity: string
  message: string
  advice: string | null
  started_at: string
  resolved_at: string | null
}

const PROVIDER_BADGE: Record<string, string> = {
  solis:   'bg-blue-50 text-blue-700 border-blue-200',
  growatt: 'bg-orange-50 text-orange-700 border-orange-200',
  huawei:  'bg-red-50 text-red-700 border-red-200',
  sungrow: 'bg-violet-50 text-violet-700 border-violet-200',
}

type HwStatus = 'active' | 'resolved' | 'all'
type HwSeverity = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'

function HardwareFaultsTab({ plants }: { plants: PlantOption[] }) {
  const [alarms, setAlarms] = useState<VendorAlarm[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [status, setStatus]   = useState<HwStatus>('active')
  const [severity, setSeverity] = useState<HwSeverity>('ALL')
  const [provider, setProvider] = useState('')
  const [selectedPlant, setSelectedPlant] = useState('')
  const [page, setPage] = useState(1)

  const fetchAlarms = useCallback(async (append = false) => {
    if (!append) setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (selectedPlant) params.set('plant_id', selectedPlant)
      if (provider)      params.set('provider', provider)
      if (severity !== 'ALL') params.set('severity', severity)
      if (status === 'active')   params.set('resolved', 'false')
      else if (status === 'resolved') params.set('resolved', 'true')
      else params.set('resolved', 'all')

      const res = await fetch(`/api/vendor-alarms?${params}`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setAlarms(prev => append ? [...prev, ...data.alarms] : data.alarms)
      setPagination(data.pagination)
    } finally { setLoading(false) }
  }, [selectedPlant, provider, severity, status, page])

  useEffect(() => { fetchAlarms() }, [fetchAlarms])

  const applyStatus   = (s: HwStatus)   => { setStatus(s);   setSeverity('ALL'); setPage(1) }
  const applySeverity = (s: HwSeverity) => { setSeverity(s); setPage(1) }

  // Group alarms by date (keyed by started_at date)
  const grouped = new Map<string, VendorAlarm[]>()
  for (const a of alarms) {
    const dk = new Date(a.started_at).toISOString().split('T')[0]
    if (!grouped.has(dk)) grouped.set(dk, [])
    grouped.get(dk)!.push(a)
  }
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">Status</span>
          {([ ['active','Active'], ['resolved','Resolved'], ['all','All'] ] as [HwStatus, string][]).map(([v, label]) => (
            <button key={v} onClick={() => applyStatus(v)}
              className={cn(PILL_BASE, status === v ? PILL_ACTIVE : PILL_IDLE)}>{label}</button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">Severity</span>
          {([ ['ALL',null,'All'], ['CRITICAL','bg-red-500','Critical'], ['WARNING','bg-amber-500','Warning'], ['INFO','bg-blue-500','Info'] ] as [HwSeverity, string|null, string][]).map(([v, dot, label]) => (
            <button key={v} onClick={() => applySeverity(v)}
              className={cn(PILL_BASE, 'flex items-center gap-1', severity === v ? PILL_ACTIVE : PILL_IDLE)}>
              {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />}{label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <select value={provider} onChange={e => { setProvider(e.target.value); setPage(1) }}
            className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none">
            <option value="">All Providers</option>
            <option value="solis">Solis</option>
            <option value="growatt">Growatt</option>
            <option value="huawei">Huawei</option>
          </select>
          {plants.length > 1 && (
            <select value={selectedPlant} onChange={e => { setSelectedPlant(e.target.value); setPage(1) }}
              className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none">
              <option value="">All Plants</option>
              {plants.map(p => <option key={p.id} value={p.id}>{p.plant_name}</option>)}
            </select>
          )}
          <button onClick={() => fetchAlarms()} disabled={loading}
            className="flex items-center justify-center w-7 h-7 rounded-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={2} />
          </button>
          {pagination.total > 0 && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {pagination.total} fault{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-5">
        {loading && alarms.length === 0 ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-sm" />)}
          </div>
        ) : alarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-md border border-slate-200">
            <CheckCircle className="w-6 h-6 text-slate-300 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-bold text-slate-500">No hardware faults found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">for the selected filters</p>
          </div>
        ) : (
          sortedGroups.map(([dateKey, dayAlarms]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                <span className="text-[12px] font-bold text-slate-700">{formatDateHeader(dateKey)}</span>
                <span className="text-[10px] font-mono text-slate-400">· {dayAlarms.length} fault{dayAlarms.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1">
                {dayAlarms.map(alarm => <HardwareFaultRow key={alarm.id} alarm={alarm} />)}
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && pagination.page < pagination.totalPages && (
        <div className="text-center pt-1">
          <button onClick={() => { setPage(p => p + 1); fetchAlarms(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-sm text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
            Load more · {pagination.total - alarms.length} remaining
          </button>
        </div>
      )}
    </div>
  )
}

function HardwareFaultRow({ alarm }: { alarm: VendorAlarm }) {
  const isResolved = !!alarm.resolved_at
  const key = statusKeyFromSeverity(alarm.severity)
  const style = STATUS_STYLES[key]
  const Icon = SEVERITY_ICON[key] ?? Info
  const leftBorder = LEFT_BORDER[key]
  const providerBadge = PROVIDER_BADGE[alarm.provider] || 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <div className={cn(
      'border border-l-[3px] rounded-sm px-3 py-2.5 transition-colors',
      leftBorder,
      isResolved ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-200 hover:bg-slate-50',
    )}>
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', isResolved ? 'text-slate-400' : style.fg)} strokeWidth={2} />

        <span className={cn('text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0',
          isResolved ? 'bg-slate-100 text-slate-500' : cn(style.bg, style.fg))}>
          {alarm.severity}
        </span>

        <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border shrink-0', providerBadge)}>
          {alarm.provider}
        </span>

        <span className={cn('text-[13px] font-bold shrink-0', isResolved ? 'text-slate-500' : 'text-slate-900')}>
          {alarm.device_name}
        </span>

        {alarm.alarm_code && (
          <span className="text-[10px] font-mono text-slate-500 shrink-0">
            Code {alarm.alarm_code}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border',
            isResolved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')}>
            {isResolved ? 'Resolved' : 'Active'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
            {formatAlertTime(alarm.started_at)}
          </span>
          {!isResolved && (
            <span className="text-[10px] font-bold font-mono text-slate-700 tabular-nums">
              {calculateDuration(new Date(alarm.started_at))}
            </span>
          )}
        </div>
      </div>

      <p className={cn('text-[11px] mt-1 ml-[1.5rem]', isResolved ? 'text-slate-400' : 'text-slate-700')}>
        {alarm.message}
      </p>

      {alarm.advice && (
        <p className="text-[10px] mt-0.5 ml-[1.5rem] text-slate-400 italic">{alarm.advice}</p>
      )}

      {isResolved && alarm.resolved_at && (
        <div className="flex flex-wrap items-center gap-2 mt-0.5 ml-[1.5rem] text-[10px] text-slate-400">
          <span>Started <span className="font-mono font-semibold text-slate-500">{formatAlertTime(alarm.started_at)}</span></span>
          <span className="text-slate-300">·</span>
          <span>Resolved <span className="font-mono font-semibold text-slate-500">{formatAlertTime(alarm.resolved_at)}</span></span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-slate-500">Duration {calculateDuration(new Date(alarm.started_at), new Date(alarm.resolved_at))}</span>
        </div>
      )}
    </div>
  )
}
