'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StringHealthMatrix } from '@/components/shared/StringHealthMatrix'
import { CurrentDeviationChart } from '@/components/shared/CurrentDeviationChart'
import { StringComparisonTable } from '@/components/shared/StringComparisonTable'
import { StringTrendChart } from '@/components/shared/StringTrendChart'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { MonthlyHealthReport, MonthlyHealthData } from '@/components/shared/MonthlyHealthReport'
import { FaultDiagnosisPanel } from '@/components/shared/FaultDiagnosisPanel'
import {
  Activity, AlertTriangle, TrendingUp, CalendarDays,
  ChevronDown, ChevronRight, Cpu, Zap, Table2, Stethoscope,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

interface StringInfo {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE'
}

interface AlertData {
  id: number
  severity: string
  message: string
  device_name?: string
  string_number: number
  created_at: string
  gap_percent?: number | null
}

interface MonthlyHealthResponse {
  month: string
  device_id: string
  inverter_avg_current: number
  data: MonthlyHealthData[]
  summary: {
    healthy_strings: number
    warning_strings: number
    critical_strings: number
    offline_strings: number
  }
}

interface DeviceInfo {
  id: string
  device_name: string | null
  model: string | null
  max_strings: number | null
}

interface InverterDetailSectionProps {
  device: DeviceInfo
  strings: StringInfo[]
  alerts: AlertData[]
  plantCode: string
  showResolveAlerts: boolean
  onResolveAlert: (id: number) => void
  /** Pass dummy trend data for preview pages; if provided, trend API won't be called */
  dummyTrendData?: any[]
  /** Index for color coding (0-based). Each inverter gets a distinct accent color. */
  colorIndex?: number
}

type TrendPeriod = '24h' | '7d' | '30d'

// ─── Color Palette (supports 20+ inverters) ─────────────────────

const INVERTER_COLORS = [
  { accent: '#3b82f6', bg: 'bg-blue-50',    iconBg: 'bg-blue-100',    iconText: 'text-blue-600',    label: 'Inverter' },
  { accent: '#8b5cf6', bg: 'bg-violet-50',  iconBg: 'bg-violet-100',  iconText: 'text-violet-600',  label: 'Inverter' },
  { accent: '#10b981', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', label: 'Inverter' },
  { accent: '#f59e0b', bg: 'bg-amber-50',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   label: 'Inverter' },
  { accent: '#ec4899', bg: 'bg-pink-50',    iconBg: 'bg-pink-100',    iconText: 'text-pink-600',    label: 'Inverter' },
  { accent: '#06b6d4', bg: 'bg-cyan-50',    iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600',    label: 'Inverter' },
  { accent: '#f97316', bg: 'bg-orange-50',  iconBg: 'bg-orange-100',  iconText: 'text-orange-600',  label: 'Inverter' },
  { accent: '#6366f1', bg: 'bg-indigo-50',  iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600',  label: 'Inverter' },
  { accent: '#14b8a6', bg: 'bg-teal-50',    iconBg: 'bg-teal-100',    iconText: 'text-teal-600',    label: 'Inverter' },
  { accent: '#e11d48', bg: 'bg-rose-50',    iconBg: 'bg-rose-100',    iconText: 'text-rose-600',    label: 'Inverter' },
  { accent: '#0ea5e9', bg: 'bg-sky-50',     iconBg: 'bg-sky-100',     iconText: 'text-sky-600',     label: 'Inverter' },
  { accent: '#a855f7', bg: 'bg-purple-50',  iconBg: 'bg-purple-100',  iconText: 'text-purple-600',  label: 'Inverter' },
  { accent: '#84cc16', bg: 'bg-lime-50',    iconBg: 'bg-lime-100',    iconText: 'text-lime-600',    label: 'Inverter' },
  { accent: '#ef4444', bg: 'bg-red-50',     iconBg: 'bg-red-100',     iconText: 'text-red-600',     label: 'Inverter' },
  { accent: '#22d3ee', bg: 'bg-cyan-50',    iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600',    label: 'Inverter' },
  { accent: '#d946ef', bg: 'bg-fuchsia-50', iconBg: 'bg-fuchsia-100', iconText: 'text-fuchsia-600', label: 'Inverter' },
  { accent: '#16a34a', bg: 'bg-green-50',   iconBg: 'bg-green-100',   iconText: 'text-green-600',   label: 'Inverter' },
  { accent: '#ca8a04', bg: 'bg-yellow-50',  iconBg: 'bg-yellow-100',  iconText: 'text-yellow-600',  label: 'Inverter' },
  { accent: '#7c3aed', bg: 'bg-violet-50',  iconBg: 'bg-violet-100',  iconText: 'text-violet-600',  label: 'Inverter' },
  { accent: '#0891b2', bg: 'bg-cyan-50',    iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600',    label: 'Inverter' },
]

// ─── Collapsible Section ────────────────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string
  icon: any
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-3 text-left group"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        }
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────

export function InverterDetailSection({
  device,
  strings,
  alerts,
  plantCode,
  showResolveAlerts,
  onResolveAlert,
  dummyTrendData,
  colorIndex = 0,
}: InverterDetailSectionProps) {
  const color = INVERTER_COLORS[colorIndex % INVERTER_COLORS.length]

  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('24h')
  const [trendData, setTrendData] = useState<any[]>(dummyTrendData || [])
  const [monthlyHealth, setMonthlyHealth] = useState<MonthlyHealthResponse | null>(null)

  // ─── Derived Data ──────────────────────────────────────────

  const activeStrings = strings.filter(s => s.status !== 'OFFLINE')
  const offlineStrings = strings.filter(s => s.status === 'OFFLINE')
  const summary = {
    ok: strings.filter(s => s.status === 'OK').length,
    warning: strings.filter(s => s.status === 'WARNING').length,
    critical: strings.filter(s => s.status === 'CRITICAL').length,
    offline: offlineStrings.length,
  }
  const totalStrings = strings.length
  const liveCount = activeStrings.length
  const totalPower = activeStrings.reduce((sum, s) => sum + s.power, 0)
  const avgCurrent = activeStrings.length > 0
    ? activeStrings.reduce((sum, s) => sum + s.current, 0) / activeStrings.length
    : 0
  // Health % based only on live (non-offline) strings
  const healthPct = liveCount > 0
    ? Math.round((summary.ok / liveCount) * 100)
    : 0

  const formatPower = (watts: number) => {
    if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`
    if (watts > 0) return `${watts.toFixed(0)} W`
    return '—'
  }

  // ─── Fetch trend data ─────────────────────────────────────

  const fetchTrend = useCallback(async (period: TrendPeriod) => {
    if (dummyTrendData) return // skip API for preview
    try {
      const now = new Date()
      let from: Date
      let apiPeriod: string

      if (period === '24h') {
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        apiPeriod = 'hourly'
      } else if (period === '7d') {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        apiPeriod = 'hourly'
      } else {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        apiPeriod = 'daily'
      }

      const res = await fetch(
        `/api/plants/${plantCode}/history?period=${apiPeriod}&from=${from.toISOString()}&to=${now.toISOString()}&device_id=${device.id}`,
        { credentials: 'include' }
      )
      if (!res.ok) return

      const history = await res.json()
      const grouped = (history.data || []).reduce((acc: any[], d: any) => {
        const ts = d.hour || d.date
        let point = acc.find((p: any) => p.timestamp === ts)
        if (!point) {
          point = { timestamp: ts, strings: [] }
          acc.push(point)
        }
        point.strings.push({
          string_number: d.string_number,
          current: Number(d.avg_current),
        })
        return acc
      }, [])

      setTrendData(grouped)
    } catch { /* silent */ }
  }, [plantCode, device.id, dummyTrendData])

  useEffect(() => { fetchTrend(trendPeriod) }, [fetchTrend, trendPeriod])

  // ─── Fetch monthly health ─────────────────────────────────

  const fetchMonthly = useCallback(async () => {
    if (dummyTrendData) return
    try {
      const res = await fetch(
        `/api/plants/${plantCode}/monthly-health?device_id=${device.id}`,
        { credentials: 'include' }
      )
      if (!res.ok) return

      const data: MonthlyHealthResponse = await res.json()
      setMonthlyHealth(data)
    } catch { /* silent */ }
  }, [plantCode, device.id, dummyTrendData])

  // ─── Render ───────────────────────────────────────────────

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      style={{ borderTopWidth: 3, borderTopColor: color.accent }}
    >
      {/* ── Inverter KPI Header ────────────────────────────────── */}
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color.iconBg)}>
              <Cpu className={cn('w-4 h-4', color.iconText)} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {device.device_name || device.id}
              </h3>
              {device.model && (
                <p className="text-[11px] text-gray-400">{device.model}</p>
              )}
            </div>
          </div>

          {/* KPI pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-gray-50 text-gray-600">
              <Zap className="w-3 h-3 text-amber-500" />
              {formatPower(totalPower)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-gray-50 text-gray-600">
              <Activity className="w-3 h-3 text-blue-500" />
              {avgCurrent > 0 ? `${avgCurrent.toFixed(2)}A avg` : '—'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-gray-50 text-gray-600">
              {liveCount} active{summary.offline > 0 ? ` / ${totalStrings} total` : ''} strings
            </span>
            {alerts.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Status bar — based on live (non-offline) strings */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-gray-100">
            {summary.ok > 0 && (
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(summary.ok / totalStrings) * 100}%` }}
              />
            )}
            {summary.warning > 0 && (
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${(summary.warning / totalStrings) * 100}%` }}
              />
            )}
            {summary.critical > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(summary.critical / totalStrings) * 100}%` }}
              />
            )}
            {summary.offline > 0 && (
              <div
                className="bg-gray-300 transition-all"
                style={{ width: `${(summary.offline / totalStrings) * 100}%` }}
              />
            )}
          </div>
          <span className="text-[11px] font-medium text-gray-500">
            {healthPct}% healthy
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4 space-y-0">
        {/* ── String Health Matrix ──────────────────────────────── */}
        {strings.length > 0 && (
          <div className="py-4 border-t border-gray-100">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
              String Health Map
            </h4>
            <StringHealthMatrix strings={strings} avgCurrent={avgCurrent} />
          </div>
        )}

        {/* ── String Comparison Table (primary data view) ────── */}
        {strings.length > 0 && (
          <div className="py-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Table2 className="w-3.5 h-3.5" /> String Comparison
              </h4>
              {avgCurrent > 0 && (
                <span className="text-[10px] text-gray-400">
                  Avg: {avgCurrent.toFixed(2)}A
                </span>
              )}
            </div>
            {/* Status Legend */}
            <div className="mb-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[10px] font-medium text-gray-500 mb-1.5">Status Guide</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span><strong>OK</strong> — Normal</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span><strong>Warning</strong> — 25-50% below avg</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span><strong>Critical</strong> — &gt;50% below avg</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                  <span><strong>Offline</strong> — No current (&lt;0.1A)</span>
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <StringComparisonTable strings={strings} />
            </div>
          </div>
        )}

        {/* ── Performance vs Average Chart ─────────────────────── */}
        {strings.length > 0 && (
          <div className="py-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Performance vs Average
              </h4>
              <span className="text-[10px] text-gray-400">
                Avg: {avgCurrent.toFixed(2)}A
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">
              Positive (+) = above average, Negative (-) = below average
            </p>
            <CurrentDeviationChart strings={strings} avgCurrent={avgCurrent} />
          </div>
        )}

        {/* ── Active Alerts ────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="py-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Active Alerts
              </h4>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {alerts.length}
              </Badge>
            </div>
            <AlertPanel
              alerts={alerts}
              onResolve={showResolveAlerts ? onResolveAlert : undefined}
            />
          </div>
        )}

        {/* ── String Trend Chart ───────────────────────────────── */}
        <div className="py-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              String Current Trend
            </h4>
            <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as TrendPeriod)}>
              <SelectTrigger className="w-[120px] h-7 text-[11px]">
                <CalendarDays className="w-3 h-3 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {trendData.length > 0 ? (
            <StringTrendChart data={trendData} />
          ) : (
            <div className="text-center py-10 text-gray-400">
              <TrendingUp className="w-5 h-5 mx-auto mb-1.5 text-gray-300" />
              <p className="text-xs">No trend data for this period</p>
            </div>
          )}
        </div>

        {/* ── Collapsible: Fault Diagnosis ─────────────────────── */}
        {strings.length > 0 && (summary.warning > 0 || summary.critical > 0) && (
          <CollapsibleSection
            title="Fault Diagnosis"
            icon={Stethoscope}
            defaultOpen={summary.critical > 0}
            badge={
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                {summary.warning + summary.critical} issue{summary.warning + summary.critical !== 1 ? 's' : ''}
              </Badge>
            }
          >
            <FaultDiagnosisPanel strings={strings} avgCurrent={avgCurrent} />
          </CollapsibleSection>
        )}

        {/* ── Collapsible: Monthly Health Report ───────────────── */}
        <CollapsibleSection
          title="Monthly Health Report"
          icon={CalendarDays}
        >
          {monthlyHealth && monthlyHealth.data.length > 0 ? (
            <MonthlyHealthReport
              data={monthlyHealth.data}
              inverterAvgCurrent={monthlyHealth.inverter_avg_current}
            />
          ) : (
            <div className="text-center py-6 text-gray-400">
              <CalendarDays className="w-5 h-5 mx-auto mb-1.5 text-gray-300" />
              <p className="text-xs">Not enough historical data yet</p>
              <button
                onClick={fetchMonthly}
                className="text-[11px] text-blue-500 hover:text-blue-700 mt-2"
              >
                Load report
              </button>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}
