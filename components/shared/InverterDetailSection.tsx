'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  ACTIVE_CURRENT_THRESHOLD,
  type StringStatus,
  classifyPlantLive,
  MAX_STRING_CURRENT_A,
  MAX_STRING_POWER_W,
} from '@/lib/string-health'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkline } from '@/components/shared/Sparkline'
import { StringHealthMatrix } from '@/components/shared/StringHealthMatrix'
import { CurrentDeviationChart } from '@/components/shared/CurrentDeviationChart'
import { StringComparisonTable } from '@/components/shared/StringComparisonTable'
import { StringTrendChart } from '@/components/shared/StringTrendChart'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { MonthlyHealthReport, MonthlyHealthData } from '@/components/shared/MonthlyHealthReport'
import { FaultDiagnosisPanel } from '@/components/shared/FaultDiagnosisPanel'
import {
  TrendingUp, TrendingDown, CalendarDays,
  ChevronDown, ChevronRight, Cpu, AlertTriangle, Table2, Stethoscope,
} from 'lucide-react'
import { STATUS_STYLES, providerBadge } from '@/lib/design-tokens'

// ─── Types ──────────────────────────────────────────────────────

interface StringInfo {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: StringStatus
  energy_kwh?: number
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
  /** Average current from the API (single source of truth). Falls back to local calc if not provided. */
  apiAvgCurrent?: number
  /** Plant provider code (for the header pill). Optional. */
  provider?: string
}

// Format a Date into "HH:00 PKT" (assumes PKT offset = +5)
function formatPktHour(d: Date): string {
  const utcH = d.getUTCHours()
  const pktH = (utcH + 5) % 24
  return `${String(pktH).padStart(2, '0')}:00 PKT`
}

type TrendPeriod = '24h' | '7d' | '30d'

// ─── Per-inverter accent palette ────────────────────────────────
// Used to distinguish multiple inverters on the same plant (top border
// accent + icon chip). All colors are light Tailwind tints compatible with
// the slate/white theme. Brand green is reserved for status, not used here.

const INVERTER_COLORS = [
  { accent: '#3b82f6', iconBg: 'bg-blue-100',    iconText: 'text-blue-600' },
  { accent: '#8b5cf6', iconBg: 'bg-violet-100',  iconText: 'text-violet-600' },
  { accent: '#10b981', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
  { accent: '#f59e0b', iconBg: 'bg-amber-100',   iconText: 'text-amber-600' },
  { accent: '#ec4899', iconBg: 'bg-pink-100',    iconText: 'text-pink-600' },
  { accent: '#06b6d4', iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600' },
  { accent: '#f97316', iconBg: 'bg-orange-100',  iconText: 'text-orange-600' },
  { accent: '#6366f1', iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600' },
  { accent: '#14b8a6', iconBg: 'bg-teal-100',    iconText: 'text-teal-600' },
  { accent: '#e11d48', iconBg: 'bg-rose-100',    iconText: 'text-rose-600' },
  { accent: '#0ea5e9', iconBg: 'bg-sky-100',     iconText: 'text-sky-600' },
  { accent: '#a855f7', iconBg: 'bg-purple-100',  iconText: 'text-purple-600' },
  { accent: '#84cc16', iconBg: 'bg-lime-100',    iconText: 'text-lime-600' },
  { accent: '#ef4444', iconBg: 'bg-red-100',     iconText: 'text-red-600' },
  { accent: '#22d3ee', iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600' },
  { accent: '#d946ef', iconBg: 'bg-fuchsia-100', iconText: 'text-fuchsia-600' },
  { accent: '#16a34a', iconBg: 'bg-green-100',   iconText: 'text-green-600' },
  { accent: '#ca8a04', iconBg: 'bg-yellow-100',  iconText: 'text-yellow-600' },
  { accent: '#7c3aed', iconBg: 'bg-violet-100',  iconText: 'text-violet-600' },
  { accent: '#0891b2', iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600' },
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
    <div className="border-t border-slate-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-3 text-left group"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
        )}
        <Icon className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 group-hover:text-slate-900 transition-colors">
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

// ─── Section Label (reusable) ───────────────────────────────────

function SectionLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2} />}
      {children}
    </h4>
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
  apiAvgCurrent,
  provider,
}: InverterDetailSectionProps) {
  const color = INVERTER_COLORS[colorIndex % INVERTER_COLORS.length]
  const providerMeta = providerBadge(provider)

  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('24h')
  const [trendData, setTrendData] = useState<any[]>(dummyTrendData || [])
  const [monthlyHealth, setMonthlyHealth] = useState<MonthlyHealthResponse | null>(null)

  // 24h hourly power for this inverter (sum of avg_power per hour across strings,
  // with sensor-fault rows filtered out). Drives the header sparkline + peak caption.
  const [power24h, setPower24h] = useState<Array<{ hour: Date; powerW: number }>>([])

  // ─── Derived Data ──────────────────────────────────────────

  const producingStrings = strings.filter(
    s => s.status === 'NORMAL' || s.status === 'WARNING' || s.status === 'CRITICAL',
  )
  const deadStrings = strings.filter(
    s => s.status === 'OPEN_CIRCUIT' || s.status === 'DISCONNECTED',
  )
  const summary = {
    normal: strings.filter(s => s.status === 'NORMAL').length,
    warning: strings.filter(s => s.status === 'WARNING').length,
    critical: strings.filter(s => s.status === 'CRITICAL').length,
    openCircuit: strings.filter(s => s.status === 'OPEN_CIRCUIT').length,
    disconnected: strings.filter(s => s.status === 'DISCONNECTED').length,
  }
  const totalStrings = strings.length
  const totalPower = producingStrings.reduce((sum, s) => sum + s.power, 0)
  // Use API's computed average (single source of truth from string-health.ts)
  // Falls back to local calc only for preview pages without API data
  const avgCurrent = apiAvgCurrent ?? (
    strings.filter(s => s.current > ACTIVE_CURRENT_THRESHOLD).length > 0
      ? strings.filter(s => s.current > ACTIVE_CURRENT_THRESHOLD).reduce((sum, s) => sum + s.current, 0)
        / strings.filter(s => s.current > ACTIVE_CURRENT_THRESHOLD).length
      : 0
  )
  // Health % includes ALL strings in denominator
  const healthPct = totalStrings > 0 ? Math.round((summary.normal / totalStrings) * 100) : 0

  const formatPower = (watts: number) => {
    if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`
    if (watts > 0) return `${watts.toFixed(0)} W`
    return '—'
  }

  // ─── Fetch trend data ─────────────────────────────────────

  const fetchTrend = useCallback(async (period: TrendPeriod) => {
    if (dummyTrendData) return
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
        { credentials: 'include' },
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
    } catch {
      /* silent */
    }
  }, [plantCode, device.id, dummyTrendData])

  useEffect(() => { fetchTrend(trendPeriod) }, [fetchTrend, trendPeriod])

  // ─── Fetch 24h power (for header sparkline) ───────────────
  // Uses the same hourly history endpoint but aggregates avg_power per hour
  // so the header is independent of whatever period the user picks below.
  // Sensor-fault rows (current >= MAX_STRING_CURRENT_A or power >= MAX_STRING_POWER_W)
  // are dropped client-side so the peak isn't polluted by broken CTs.
  const fetch24hPower = useCallback(async () => {
    if (dummyTrendData) return
    try {
      const now = new Date()
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const res = await fetch(
        `/api/plants/${plantCode}/history?period=hourly&from=${from.toISOString()}&to=${now.toISOString()}&device_id=${device.id}`,
        { credentials: 'include' },
      )
      if (!res.ok) return
      const history = await res.json()

      // Group by hour, sum avg_power across strings, filter sensor faults
      const byHour = new Map<string, number>()
      ;(history.data || []).forEach((d: any) => {
        const curr = Number(d.avg_current)
        const pw = Number(d.avg_power)
        if (!isNaN(curr) && curr >= MAX_STRING_CURRENT_A) return
        if (!isNaN(pw) && pw >= MAX_STRING_POWER_W) return
        const key = String(d.hour)
        byHour.set(key, (byHour.get(key) || 0) + (isFinite(pw) ? pw : 0))
      })

      const series = Array.from(byHour.entries())
        .map(([k, v]) => ({ hour: new Date(k), powerW: v }))
        .sort((a, b) => a.hour.getTime() - b.hour.getTime())
      setPower24h(series)
    } catch {
      /* silent */
    }
  }, [plantCode, device.id, dummyTrendData])

  useEffect(() => { fetch24hPower() }, [fetch24hPower])

  // Peak detection + current-vs-peak delta, all from already-fetched data
  const peak = power24h.reduce<{ powerW: number; hour: Date | null }>(
    (best, p) => (p.powerW > best.powerW ? { powerW: p.powerW, hour: p.hour } : best),
    { powerW: 0, hour: null },
  )
  const peakW = peak.hour ? peak.powerW : null
  const peakHourLabel = peak.hour ? formatPktHour(peak.hour) : null
  const nowVsPeakPct =
    peakW !== null && peakW > 0 ? ((totalPower - peakW) / peakW) * 100 : null

  // Live status (tri-state — same classifier as plant/dashboard)
  const isReporting = strings.length > 0
  const totalPowerKw = totalPower / 1000
  const liveStatus = classifyPlantLive(isReporting, totalPowerKw)

  // Convenience: sparkline data array (48-slot kW values)
  const sparklineKwValues = power24h.map(p => p.powerW / 1000)

  // ─── Fetch monthly health ─────────────────────────────────

  const fetchMonthly = useCallback(async () => {
    if (dummyTrendData) return
    try {
      const res = await fetch(
        `/api/plants/${plantCode}/monthly-health?device_id=${device.id}`,
        { credentials: 'include' },
      )
      if (!res.ok) return

      const data: MonthlyHealthResponse = await res.json()
      setMonthlyHealth(data)
    } catch {
      /* silent */
    }
  }, [plantCode, device.id, dummyTrendData])

  // ─── Render ───────────────────────────────────────────────

  return (
    <div
      className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-card"
      style={{ borderTopWidth: 3, borderTopColor: color.accent }}
    >
      {/* ── Inverter Mini-Hero Header (4 zones) ────────────────── */}
      <div className="px-4 sm:px-5 pt-4 pb-4 space-y-3">

        {/* ZONE 1 — Identity row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={cn('w-9 h-9 rounded-md flex items-center justify-center shrink-0', color.iconBg)}>
              <Cpu className={cn('w-4 h-4', color.iconText)} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 font-mono truncate">
                  {device.device_name || device.id}
                </h3>
                {liveStatus === 'PRODUCING' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 shrink-0">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE
                  </span>
                ) : liveStatus === 'IDLE' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    STANDBY
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    OFFLINE
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>{device.model || 'Inverter'}</span>
                {providerMeta && (
                  <span
                    className={cn(
                      'inline-flex items-center text-[9px] font-bold uppercase tracking-widest px-1 py-0 rounded-sm border',
                      providerMeta.bg,
                      providerMeta.fg,
                      providerMeta.border,
                    )}
                  >
                    {providerMeta.label}
                  </span>
                )}
                {totalStrings > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>
                      <span className="font-mono font-semibold text-slate-700">{producingStrings.length}</span>
                      <span> of </span>
                      <span className="font-mono font-semibold text-slate-700">{totalStrings}</span>
                      <span> strings producing</span>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-sm px-2 py-1 shrink-0 uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
              <span className="font-mono">{alerts.length}</span>
              <span>alert{alerts.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* ZONE 2 — 3-cell KPI strip (Power · Today · Avg I) */}
        <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden">
          <div className="bg-white px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Power</div>
            <div className="text-sm font-mono font-bold text-slate-900 leading-tight mt-0.5">
              {formatPower(totalPower)}
            </div>
          </div>
          <div className="bg-white px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Today</div>
            <div className="text-sm font-mono font-bold text-slate-900 leading-tight mt-0.5">
              {strings.some(s => s.energy_kwh != null) ? (
                <>
                  {strings.reduce((sum, s) => sum + (s.energy_kwh || 0), 0).toFixed(1)}
                  <span className="text-[10px] text-slate-500 ml-1">kWh</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className="bg-white px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Avg I</div>
            <div className="text-sm font-mono font-bold text-slate-900 leading-tight mt-0.5">
              {avgCurrent > 0 ? (
                <>
                  {avgCurrent.toFixed(2)}
                  <span className="text-[10px] text-slate-500 ml-1">A</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>

        {/* ZONE 3 — String health proportion bar + inline legend */}
        {totalStrings > 0 && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="font-bold uppercase tracking-widest text-slate-400">String Health</span>
              <span className="font-mono font-semibold text-slate-700">
                {healthPct}% healthy
              </span>
            </div>
            <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-slate-100">
              {summary.normal > 0 && (
                <div
                  className={cn(STATUS_STYLES.healthy.dot, 'transition-all')}
                  style={{ width: `${(summary.normal / totalStrings) * 100}%` }}
                />
              )}
              {summary.warning > 0 && (
                <div
                  className={cn(STATUS_STYLES.warning.dot, 'transition-all')}
                  style={{ width: `${(summary.warning / totalStrings) * 100}%` }}
                />
              )}
              {summary.critical > 0 && (
                <div
                  className={cn(STATUS_STYLES.critical.dot, 'transition-all')}
                  style={{ width: `${(summary.critical / totalStrings) * 100}%` }}
                />
              )}
              {summary.openCircuit > 0 && (
                <div
                  className={cn(STATUS_STYLES['open-circuit'].dot, 'transition-all')}
                  style={{ width: `${(summary.openCircuit / totalStrings) * 100}%` }}
                />
              )}
              {summary.disconnected > 0 && (
                <div
                  className={cn(STATUS_STYLES.offline.dot, 'transition-all')}
                  style={{ width: `${(summary.disconnected / totalStrings) * 100}%` }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-600">
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES.healthy.dot)} />
                <span className="font-mono font-semibold">{summary.normal}</span>
                <span>Normal</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES.warning.dot)} />
                <span className="font-mono font-semibold">{summary.warning}</span>
                <span>Warning</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES.critical.dot)} />
                <span className="font-mono font-semibold">{summary.critical}</span>
                <span>Critical</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES['open-circuit'].dot)} />
                <span className="font-mono font-semibold">{summary.openCircuit}</span>
                <span>Open</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_STYLES.offline.dot)} />
                <span className="font-mono font-semibold">{summary.disconnected}</span>
                <span>Disconnected</span>
              </span>
            </div>
          </div>
        )}

        {/* ZONE 4 — 24h power sparkline + peak annotation */}
        {power24h.length > 0 && peakW !== null && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="font-bold uppercase tracking-widest text-slate-400">24h Power</span>
              <span className="font-mono text-slate-500">
                Peak{' '}
                <span className="font-semibold text-slate-900">{formatPower(peakW)}</span>
                {peakHourLabel && (
                  <>
                    {' at '}
                    <span className="font-semibold text-slate-900">{peakHourLabel}</span>
                  </>
                )}
                {nowVsPeakPct !== null && (
                  <>
                    <span className="text-slate-300 mx-1.5">·</span>
                    Now
                    <span
                      className={cn(
                        'font-bold ml-1 inline-flex items-center gap-0.5',
                        nowVsPeakPct >= 0 ? 'text-emerald-700' : 'text-red-700',
                      )}
                    >
                      {nowVsPeakPct >= 0 ? (
                        <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                      ) : (
                        <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
                      )}
                      {nowVsPeakPct >= 0 ? '+' : ''}
                      {nowVsPeakPct.toFixed(0)}%
                    </span>
                    <span className="ml-1">from peak</span>
                  </>
                )}
              </span>
            </div>
            <div className="-mx-1">
              <Sparkline data={sparklineKwValues} variant="area" color="#F59E0B" height={48} />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 px-1">
              <span>24h ago</span>
              <span>NOW</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-4 space-y-0">
        {/* ── String Health Matrix ──────────────────────────────── */}
        {strings.length > 0 && (
          <div className="py-4 border-t border-slate-200">
            <div className="mb-3">
              <SectionLabel>String Health Map</SectionLabel>
            </div>
            <StringHealthMatrix strings={strings} avgCurrent={avgCurrent} />
          </div>
        )}

        {/* ── String Comparison Table (primary data view) ────── */}
        {strings.length > 0 && (
          <div className="py-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel icon={Table2}>String Comparison</SectionLabel>
              {avgCurrent > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  Avg: {avgCurrent.toFixed(2)}A
                </span>
              )}
            </div>
            {/* Status Legend */}
            <div className="mb-3 p-2.5 rounded-sm border border-slate-200 bg-slate-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Status Guide (IEC 62446)
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
                <span className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.healthy.dot)} />
                  <span><strong>Normal</strong> — Within 10% of avg</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.warning.dot)} />
                  <span><strong>Warning</strong> — 10-50% below avg</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.critical.dot)} />
                  <span><strong>Critical</strong> — &gt;50% below avg</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES['open-circuit'].dot)} />
                  <span><strong>Open Circuit</strong> — Voltage but 0A (wiring)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.offline.dot)} />
                  <span><strong>Disconnected</strong> — 0V 0A (total loss)</span>
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
          <div className="py-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>String Current Comparison</SectionLabel>
              <span className="text-[10px] text-slate-400 font-mono">
                Green line = Avg: {avgCurrent.toFixed(2)}A (all strings)
              </span>
            </div>
            <CurrentDeviationChart strings={strings} avgCurrent={avgCurrent} />
          </div>
        )}

        {/* ── Active Alerts ────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="py-4 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <SectionLabel>Active Alerts</SectionLabel>
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
        <div className="py-4 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>String Current Trend</SectionLabel>
            <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as TrendPeriod)}>
              <SelectTrigger className="w-[120px] h-7 text-[11px]">
                <CalendarDays className="w-3 h-3 mr-1 text-slate-400" strokeWidth={2} />
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
            <div className="text-center py-10 text-slate-400">
              <TrendingUp className="w-5 h-5 mx-auto mb-1.5 text-slate-300" strokeWidth={2} />
              <p className="text-xs font-semibold">No trend data for this period</p>
            </div>
          )}
        </div>

        {/* ── Collapsible: Fault Diagnosis ─────────────────────── */}
        {strings.length > 0 && (summary.warning > 0 || summary.critical > 0 || summary.openCircuit > 0 || summary.disconnected > 0) && (
          <CollapsibleSection
            title="Fault Diagnosis"
            icon={Stethoscope}
            defaultOpen={summary.critical > 0 || summary.openCircuit > 0}
            badge={
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                {summary.warning + summary.critical + summary.openCircuit + summary.disconnected} issue
                {summary.warning + summary.critical + summary.openCircuit + summary.disconnected !== 1 ? 's' : ''}
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
            <div className="text-center py-6 text-slate-400">
              <CalendarDays className="w-5 h-5 mx-auto mb-1.5 text-slate-300" strokeWidth={2} />
              <p className="text-xs font-semibold">Not enough historical data yet</p>
              <button
                onClick={fetchMonthly}
                className="text-[11px] font-bold text-solar-gold-600 hover:text-solar-gold-700 mt-2 uppercase tracking-wider transition-colors"
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
