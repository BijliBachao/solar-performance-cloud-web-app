'use client'

import { useState, useEffect } from 'react'
import { StringLevelTable } from '@/components/shared/StringLevelTable'
import { HEALTH_HEALTHY, HEALTH_CAUTION, HEALTH_WARNING, HEALTH_SEVERE, MAX_DATE_RANGE_DAYS } from '@/lib/string-health'
import { InverterLevelTable } from '@/components/shared/InverterLevelTable'
import { ExportButton } from '@/components/shared/ExportButton'
import { cn } from '@/lib/utils'
import { BarChart3, CheckCircle, AlertTriangle, XCircle, CircleDashed } from 'lucide-react'

type Tab = 'string' | 'inverter'

interface PlantOption {
  id: string
  plant_name: string
  capacity_kw: number | null
}

interface DeviceOption {
  id: string
  device_name: string
  plant_id: string
}

function getDefaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().split('T')[0]
}

function getDefaultTo(): string {
  return new Date().toISOString().split('T')[0]
}

export default function DashboardAnalysisPage() {
  const [tab, setTab] = useState<Tab>('string')
  const [from, setFrom] = useState(getDefaultFrom)
  const [to, setTo] = useState(getDefaultTo)
  const [plantId, setPlantId] = useState('')
  const [deviceId, setDeviceId] = useState('')

  // Data
  const [stringData, setStringData] = useState<{ dates: string[]; rows: any[]; summary?: any } | null>(null)
  const [inverterData, setInverterData] = useState<{ dates: string[]; rows: any[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filter options
  const [plants, setPlants] = useState<PlantOption[]>([])
  const [devices, setDevices] = useState<DeviceOption[]>([])

  // Load user's assigned plants
  useEffect(() => {
    fetch('/api/dashboard/main', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const pl = (data.plants || []).map((p: any) => ({
          id: p.id,
          plant_name: p.plant_name,
          capacity_kw: p.capacity_kw != null ? Number(p.capacity_kw) : null,
        }))
        setPlants(pl)
      })
      .catch(() => {})
  }, [])

  // Load device list when plant changes
  useEffect(() => {
    if (!plantId) {
      setDevices([])
      setDeviceId('')
      return
    }
    fetch(`/api/plants/${plantId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const devs = (data.devices || []).map((d: any) => ({
          id: d.id,
          device_name: d.device_name || d.id,
          plant_id: d.plant_id,
        }))
        setDevices(devs)
      })
      .catch(() => setDevices([]))
  }, [plantId])

  // Validation
  function validate(): string | null {
    if (!from) return 'Please select a start date.'
    if (!to) return 'Please select an end date.'

    const fromDate = new Date(from)
    const toDate = new Date(to)
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    if (isNaN(fromDate.getTime())) return 'Invalid start date.'
    if (isNaN(toDate.getTime())) return 'Invalid end date.'
    if (fromDate > toDate) return 'Start date cannot be after end date.'
    if (toDate > today) return 'End date cannot be in the future.'

    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > MAX_DATE_RANGE_DAYS) return `Date range too large (${diffDays} days). Maximum is ${MAX_DATE_RANGE_DAYS} days.`

    return null
  }

  const validationError = validate()

  async function fetchData() {
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ from, to })
      if (plantId) params.set('plant_id', plantId)

      if (tab === 'string') {
        if (deviceId) params.set('device_id', deviceId)
        const res = await fetch(`/api/dashboard/analysis/string-level?${params}`, { credentials: 'include' })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to fetch')
        }
        setStringData(await res.json())
      } else {
        const res = await fetch(`/api/dashboard/analysis/inverter-level?${params}`, { credentials: 'include' })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to fetch')
        }
        setInverterData(await res.json())
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const [autoFetchKey, setAutoFetchKey] = useState(0)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchKey])

  useEffect(() => { setAutoFetchKey(k => k + 1) }, [plantId, deviceId, tab])

  function setPreset(days: number) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (days - 1))
    setFrom(start.toISOString().split('T')[0])
    setTo(end.toISOString().split('T')[0])
    setTimeout(() => setAutoFetchKey(k => k + 1), 0)
  }

  function setThisMonth() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    setFrom(start.toISOString().split('T')[0])
    setTo(now.toISOString().split('T')[0])
    setTimeout(() => setAutoFetchKey(k => k + 1), 0)
  }

  const currentData = tab === 'string' ? stringData : inverterData
  const summary = tab === 'string' ? stringData?.summary : null

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 leading-tight">Performance Analysis</h1>
        <div className="text-[11px] font-semibold text-slate-500">
          Health Score = Performance × Availability
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab('string')}
          className={cn(
            'px-4 py-1.5 text-xs font-semibold rounded-sm transition-colors',
            tab === 'string'
              ? 'bg-solar-gold/10 text-solar-gold-700 border border-solar-gold/30'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
          )}
        >
          String Level
        </button>
        <button
          onClick={() => setTab('inverter')}
          className={cn(
            'px-4 py-1.5 text-xs font-semibold rounded-sm transition-colors',
            tab === 'inverter'
              ? 'bg-solar-gold/10 text-solar-gold-700 border border-solar-gold/30'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
          )}
        >
          Inverter Level
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Plant filter */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Plant</label>
          <select
            value={plantId}
            onChange={(e) => { setPlantId(e.target.value); setDeviceId('') }}
            className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 min-w-[180px] focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none"
          >
            <option value="">All Plants</option>
            {plants.map(p => (
              <option key={p.id} value={p.id}>{p.plant_name}</option>
            ))}
          </select>
        </div>

        {/* Inverter filter (string tab only) */}
        {tab === 'string' && plantId && devices.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Inverter</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 min-w-[160px] focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none"
            >
              <option value="">All Inverters</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.device_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date range */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-xs font-semibold border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:border-solar-gold focus:ring-1 focus:ring-solar-gold/20 outline-none"
          />
        </div>

        {/* Quick presets */}
        <div className="flex gap-1">
          {[
            { label: '7D', days: 7 },
            { label: '14D', days: 14 },
            { label: '30D', days: 30 },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => setPreset(p.days)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-sm hover:bg-slate-200 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={setThisMonth}
            className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Month
          </button>
        </div>

        {/* Generate */}
        <button
          onClick={fetchData}
          disabled={loading || !!validationError}
          className="px-4 py-1.5 text-xs font-bold text-solar-gold-700 border-2 border-solar-gold rounded-sm hover:bg-solar-gold hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading...' : 'Generate'}
        </button>

        {/* Export */}
        {currentData && (
          <ExportButton
            dates={currentData.dates}
            rows={currentData.rows}
            type={tab}
          />
        )}
      </div>

      {/* Validation warning */}
      {validationError && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {validationError}
        </div>
      )}

      {/* Nominal DC capacity card — shown when a specific plant is selected.
          IEC 62446-1 documents the plant's nominal DC array power; IEC 61724-1
          uses it as the denominator for Performance Ratio. */}
      {plantId && !loading && tab === 'string' && (() => {
        const selected = plants.find(p => p.id === plantId)
        if (!selected) return null
        const activeStrings = summary?.active_strings ?? null
        const nominalPerString =
          selected.capacity_kw && activeStrings && activeStrings > 0
            ? Math.round((selected.capacity_kw / activeStrings) * 100) / 100
            : null
        return (
          <div className="bg-white border border-slate-200 rounded-md shadow-card overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-solar-gold-400 via-solar-gold-500 to-solar-gold-600" />
            <div className="px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Plant
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {selected.plant_name}
                </div>
              </div>
              <div>
                <div
                  className="text-[9px] font-bold uppercase tracking-widest text-slate-400"
                  title="IEC 62446-1: Nominal DC array power (plant nameplate)"
                >
                  Nominal DC Capacity
                </div>
                <div className="text-lg font-mono font-bold text-slate-900 leading-none">
                  {selected.capacity_kw != null ? selected.capacity_kw.toFixed(1) : '—'}
                  <span className="text-[10px] font-mono font-semibold text-slate-500 ml-1">
                    kWp
                  </span>
                </div>
              </div>
              {activeStrings !== null && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Active Strings
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-900 leading-none">
                    {activeStrings}
                  </div>
                </div>
              )}
              {nominalPerString !== null && (
                <div>
                  <div
                    className="text-[9px] font-bold uppercase tracking-widest text-slate-400"
                    title="Plant nominal ÷ active strings. Derived plant-average, not a per-string spec."
                  >
                    Nominal per String (avg)
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-900 leading-none">
                    {nominalPerString.toFixed(2)}
                    <span className="text-[10px] font-mono font-semibold text-slate-500 ml-1">
                      kWp
                    </span>
                  </div>
                </div>
              )}
              <div className="ml-auto text-[10px] text-slate-400 font-mono">
                Reference: IEC 62446-1 § nominal DC array power
              </div>
            </div>
          </div>
        )
      })()}

      {/* Summary bar (string level only) */}
      {summary && !loading && (
        <div className="flex items-center gap-6 text-xs px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-gray-500 font-medium">
            {summary.active_strings} active strings
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-gray-600">{summary.healthy} Healthy</span>
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-gray-600">{summary.warning} Warning</span>
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-gray-600">{summary.critical} Critical</span>
          </span>
          {summary.no_data > 0 && (
            <span className="flex items-center gap-1">
              <CircleDashed className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">{summary.no_data} No Data</span>
            </span>
          )}
          {(summary.inactive_strings > 0 || summary.unused_strings > 0) && (
            <span className="flex items-center gap-4 ml-2 pl-2 border-l border-gray-300">
              {summary.inactive_strings > 0 && (
                <span className="text-amber-600">{summary.inactive_strings} Stopped</span>
              )}
              {summary.unused_strings > 0 && (
                <span className="text-gray-400">{summary.unused_strings} Unused</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
          <button onClick={fetchData} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Color legend + Column guide */}
      <div className="space-y-1">
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
          <span>Color guide:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200" /> {HEALTH_CAUTION}%-{HEALTH_HEALTHY - 1}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 border border-orange-300" /> {HEALTH_WARNING}%-{HEALTH_CAUTION - 1}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300" /> {HEALTH_SEVERE}%-{HEALTH_WARNING - 1}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> &lt;{HEALTH_SEVERE}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> No data</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
          <span>Column guide:</span>
          <span><strong className="text-blue-700">Perf</strong> — Performance: how well the string produces when working (low = shading / dirty panels)</span>
          <span><strong className="text-violet-700">Avail</strong> — Availability: % of daylight hours the string was active (low = loose cable / connection fault)</span>
          <span><strong className="text-emerald-700">kWh</strong> — Total energy produced in the selected date range (trapezoidal integration, ±1.3% accuracy)</span>
          <span><strong className="text-gray-600">Daily cells</strong> — Health Score: Perf × Avail combined</span>
        </div>
      </div>

      {/* Table */}
      {tab === 'string' ? (
        <StringLevelTable
          dates={stringData?.dates || []}
          rows={stringData?.rows || []}
          loading={loading}
        />
      ) : (
        <InverterLevelTable
          dates={inverterData?.dates || []}
          rows={inverterData?.rows || []}
          loading={loading}
        />
      )}
    </div>
  )
}
