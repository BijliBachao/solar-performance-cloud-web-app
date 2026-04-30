'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Save, Loader2, Check, X, Cpu, Zap, RotateCcw, Layers, AlertCircle,
} from 'lucide-react'
import { providerBadge, STATUS_STYLES } from '@/lib/design-tokens'

interface StringConfig {
  panel_count: number | null
  panel_make: string | null
  panel_rating_w: number | null
  notes: string | null
  is_used: boolean
  exclude_from_peer_comparison: boolean
  updated_at: string
  updated_by: string | null
}

interface StringRow {
  string_number: number
  status: 'active' | 'unused'
  unused_source: 'admin' | 'auto' | null
  config: StringConfig | null
  nameplate_w: number | null
}

interface DeviceWithStrings {
  device_id: string
  device_name: string | null
  provider: string
  model: string | null
  max_strings: number | null
  strings: StringRow[]
}

interface ApiResponse {
  plant: { id: string; plant_name: string; capacity_kw: number | null }
  devices: DeviceWithStrings[]
}

// Per-row local edit state
interface EditState {
  panel_count: string
  panel_make: string
  panel_rating_w: string
  notes: string
  is_used: boolean
  exclude_from_peer_comparison: boolean
}

const emptyEdit: EditState = {
  panel_count: '', panel_make: '', panel_rating_w: '', notes: '',
  is_used: true, exclude_from_peer_comparison: false,
}

const fromConfig = (c: StringConfig | null): EditState =>
  c
    ? {
        panel_count: c.panel_count != null ? String(c.panel_count) : '',
        panel_make: c.panel_make ?? '',
        panel_rating_w: c.panel_rating_w != null ? String(c.panel_rating_w) : '',
        notes: c.notes ?? '',
        is_used: c.is_used,
        exclude_from_peer_comparison: c.exclude_from_peer_comparison,
      }
    : { ...emptyEdit }

export default function AdminStringsConfigPage() {
  const params = useParams()
  const router = useRouter()
  const plantCode = params.plantCode as string

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  // Bulk dialog supports three independent sections, each opt-in via its own
  // "Apply" checkbox. Admin can: (a) push panel info, (b) flip used/unused,
  // (c) flip peer-comp standard/non-standard — any combination in one call.
  // Only sections with `applyX === true` are sent to the API; the others are
  // omitted entirely (server-side schema fields are optional → no overwrite).
  const [bulkForm, setBulkForm] = useState<{
    applyPanels: boolean
    panel_count: string
    panel_make: string
    panel_rating_w: string
    applyUsed: boolean
    is_used: boolean
    applyPeerComp: boolean
    exclude_from_peer_comparison: boolean
    only_unconfigured: boolean
  }>({
    applyPanels: false,
    panel_count: '',
    panel_make: '',
    panel_rating_w: '',
    applyUsed: false,
    is_used: true,
    applyPeerComp: false,
    exclude_from_peer_comparison: false,
    only_unconfigured: true,
  })
  const [bulkSaving, setBulkSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/plants/${plantCode}/strings-config`, {
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) router.push('/admin')
        const err = await res.json().catch(() => ({}))
        setErrorMsg(err.error || `Failed to load (${res.status})`)
        return
      }
      const json: ApiResponse = await res.json()
      setData(json)
      // Initialize edit state from server data
      const initial: Record<string, EditState> = {}
      for (const d of json.devices) {
        for (const s of d.strings) {
          initial[`${d.device_id}:${s.string_number}`] = fromConfig(s.config)
        }
      }
      setEdits(initial)
    } catch (e) {
      setErrorMsg('Network error')
    } finally {
      setLoading(false)
    }
  }, [plantCode, router])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-clear messages
  useEffect(() => {
    if (errorMsg) { const t = setTimeout(() => setErrorMsg(''), 4000); return () => clearTimeout(t) }
  }, [errorMsg])
  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 4000); return () => clearTimeout(t) }
  }, [successMsg])

  const isDirty = (deviceId: string, sn: number) => {
    if (!data) return false
    const dev = data.devices.find(d => d.device_id === deviceId)
    const row = dev?.strings.find(s => s.string_number === sn)
    if (!row) return false
    const a = fromConfig(row.config)
    const b = edits[`${deviceId}:${sn}`] ?? emptyEdit
    return a.panel_count !== b.panel_count ||
      a.panel_make !== b.panel_make ||
      a.panel_rating_w !== b.panel_rating_w ||
      a.notes !== b.notes ||
      a.is_used !== b.is_used ||
      a.exclude_from_peer_comparison !== b.exclude_from_peer_comparison
  }

  const handleSave = async (deviceId: string, sn: number) => {
    const key = `${deviceId}:${sn}`
    const e = edits[key]
    if (!e) return

    // Panel count is OPTIONAL when the only change is is_used.
    // Empty string = no panel info on this row (typical for empty PV ports).
    let panel_count: number | null = null
    if (e.panel_count !== '') {
      const n = Number(e.panel_count)
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        setErrorMsg('Panel count must be a whole number 1–100 (or leave blank)')
        return
      }
      panel_count = n
    }
    const ratingNum = e.panel_rating_w === '' ? null : Number(e.panel_rating_w)
    if (ratingNum !== null && (!Number.isInteger(ratingNum) || ratingNum < 50 || ratingNum > 1000)) {
      setErrorMsg('Panel rating must be 50–1000 W')
      return
    }

    setSavingKey(key)
    try {
      const res = await fetch(`/api/admin/string-config/${deviceId}/${sn}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          panel_count,
          panel_make: e.panel_make.trim() || null,
          panel_rating_w: ratingNum,
          notes: e.notes.trim() || null,
          is_used: e.is_used,
          exclude_from_peer_comparison: e.exclude_from_peer_comparison,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErrorMsg(err.error || 'Save failed')
        return
      }
      const saved = await res.json()
      // Patch the data locally
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          devices: prev.devices.map(d => d.device_id === deviceId ? {
            ...d,
            strings: d.strings.map(s => s.string_number === sn ? {
              ...s,
              status: saved.is_used === false ? 'unused' : s.status,
              unused_source: saved.is_used === false ? 'admin' : s.unused_source,
              config: {
                panel_count: saved.panel_count,
                panel_make: saved.panel_make,
                panel_rating_w: saved.panel_rating_w,
                notes: saved.notes,
                is_used: saved.is_used,
                exclude_from_peer_comparison: saved.exclude_from_peer_comparison,
                updated_at: saved.updated_at,
                updated_by: saved.updated_by,
              },
              nameplate_w: saved.nameplate_w,
            } : s),
          } : d),
        }
      })
      setSuccessMsg(saved.is_used === false ? `PV${sn} marked unused` : `Saved PV${sn}`)
    } catch (e) {
      setErrorMsg('Network error during save')
    } finally {
      setSavingKey(null)
    }
  }

  const handleClear = async (deviceId: string, sn: number) => {
    if (!confirm(`Clear panel config for PV${sn}?`)) return
    const key = `${deviceId}:${sn}`
    setSavingKey(key)
    try {
      const res = await fetch(`/api/admin/string-config/${deviceId}/${sn}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        setErrorMsg('Failed to clear')
        return
      }
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          devices: prev.devices.map(d => d.device_id === deviceId ? {
            ...d,
            strings: d.strings.map(s => s.string_number === sn ? {
              ...s, config: null, nameplate_w: null,
            } : s),
          } : d),
        }
      })
      setEdits(prev => ({ ...prev, [key]: { ...emptyEdit } }))
      setSuccessMsg(`Cleared PV${sn}`)
    } finally {
      setSavingKey(null)
    }
  }

  const handleBulkApply = async () => {
    // At least one section must be opted into.
    if (!bulkForm.applyPanels && !bulkForm.applyUsed && !bulkForm.applyPeerComp) {
      setErrorMsg('Pick at least one section to apply (panel info, used flag, or peer-comp flag)')
      return
    }

    // Build payload — only include fields from sections that are opted in.
    // Backend schema treats every field as optional: omitting them means
    // "leave that field untouched on existing rows."
    const payload: Record<string, unknown> = {
      only_unconfigured: bulkForm.only_unconfigured,
    }

    if (bulkForm.applyPanels) {
      const panel_count = Number(bulkForm.panel_count)
      if (!Number.isInteger(panel_count) || panel_count < 1) {
        setErrorMsg('Panel count must be a whole number ≥ 1')
        return
      }
      const ratingNum = bulkForm.panel_rating_w === '' ? null : Number(bulkForm.panel_rating_w)
      if (ratingNum !== null && (!Number.isInteger(ratingNum) || ratingNum < 50 || ratingNum > 1000)) {
        setErrorMsg('Panel rating must be 50–1000 W')
        return
      }
      payload.panel_count = panel_count
      payload.panel_make = bulkForm.panel_make.trim() || null
      payload.panel_rating_w = ratingNum
    }

    if (bulkForm.applyUsed) {
      payload.is_used = bulkForm.is_used
    }
    if (bulkForm.applyPeerComp) {
      payload.exclude_from_peer_comparison = bulkForm.exclude_from_peer_comparison
    }

    setBulkSaving(true)
    try {
      const res = await fetch(`/api/admin/plants/${plantCode}/strings-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErrorMsg(err.error || 'Bulk apply failed')
        return
      }
      const result = await res.json()
      if (result.failed && result.failed > 0) {
        setErrorMsg(`${result.failed} string${result.failed === 1 ? '' : 's'} failed to save — see logs`)
      } else {
        setSuccessMsg(result.message || `Applied to ${result.updated} strings`)
      }
      setBulkOpen(false)
      // Reload to reflect changes
      await fetchData()
    } finally {
      setBulkSaving(false)
    }
  }

  const summary = useMemo(() => {
    if (!data) return null
    let total = 0, configured = 0, totalKwp = 0
    for (const d of data.devices) {
      for (const s of d.strings) {
        total++
        if (s.config) {
          configured++
          if (s.nameplate_w) totalKwp += s.nameplate_w / 1000
        }
      }
    }
    return { total, configured, totalKwp }
  }, [data])

  return (
    <PageWrapper title={data?.plant ? `Strings · ${data.plant.plant_name}` : 'Strings'} loading={false}>
      <div className="space-y-5">

        {/* Back link + page title */}
        <div className="flex items-center justify-between">
          <Link
            href={`/admin/plants/${plantCode}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
            Back to plant
          </Link>
          <Button
            onClick={() => setBulkOpen(true)}
            className="bg-solar-gold hover:bg-solar-gold-600 text-white text-xs h-8"
          >
            <Layers className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} />
            Apply to all strings
          </Button>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
            {successMsg}
          </div>
        )}

        {/* Summary KPIs */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Strings</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">{summary.total}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Configured</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
                {summary.configured}
                <span className="text-xs font-semibold text-slate-400 ml-1">
                  / {summary.total}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DC Nameplate</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
                {summary.totalKwp.toFixed(2)}
                <span className="text-xs font-semibold text-slate-400 ml-1">kWp</span>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-md" />)}
          </div>
        )}

        {/* Inverters → strings tables */}
        {!loading && data && data.devices.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-md border border-slate-200">
            <Cpu className="w-6 h-6 mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-bold text-slate-500">No inverters found on this plant</p>
          </div>
        )}

        {!loading && data && data.devices.map(device => {
          const providerMeta = providerBadge(device.provider)
          return (
            <div key={device.device_id} className="bg-white rounded-md border border-slate-200 overflow-hidden">

              {/* Inverter header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-100">
                    <Cpu className="w-3.5 h-3.5 text-slate-600" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 font-mono truncate">
                      {device.device_name || device.device_id}
                    </h3>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <span>{device.model || 'Inverter'}</span>
                      {providerMeta && (
                        <span
                          className={cn(
                            'inline-flex items-center text-[9px] font-bold uppercase tracking-widest px-1 py-0 rounded-sm border',
                            providerMeta.bg, providerMeta.fg, providerMeta.border,
                          )}
                        >
                          {providerMeta.label}
                        </span>
                      )}
                      <span className="text-slate-300">·</span>
                      {(() => {
                        const total = device.strings.length
                        const usedCount = device.strings.filter(s => {
                          const cfg = s.config
                          return cfg?.is_used !== false
                        }).length
                        const unusedCount = total - usedCount
                        return (
                          <span>
                            <span className="font-mono font-semibold text-slate-700">{usedCount}</span> used
                            {unusedCount > 0 && (
                              <>
                                {' · '}
                                <span className="font-mono font-semibold text-amber-700">{unusedCount}</span> unused
                              </>
                            )}
                          </span>
                        )
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* String rows */}
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">String</div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Used</div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div
                          className="text-[10px] font-bold uppercase tracking-widest text-slate-500"
                          title="Peer-comparison eligibility. Off = string is producing energy but has non-standard orientation/tilt or is shaded; remove from peer pool so south-facing siblings aren't unfairly compared. Hardware alarms and dead-string detection still active."
                        >
                          Peer-comp
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Panel Count</div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Make</div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Rating (W)</div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nameplate</div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actions</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {device.strings.map(row => {
                      const key = `${device.device_id}:${row.string_number}`
                      const e = edits[key] ?? { ...emptyEdit }
                      const dirty = isDirty(device.device_id, row.string_number)
                      const isSaving = savingKey === key
                      const computedKwp = e.panel_count && e.panel_rating_w
                        ? (Number(e.panel_count) * Number(e.panel_rating_w)) / 1000
                        : null
                      const isUnusedRow = e.is_used === false

                      return (
                        <tr
                          key={key}
                          className={cn(
                            dirty && 'bg-solar-gold/5',
                            isUnusedRow && 'bg-slate-50/80',
                          )}
                        >
                          <td className={cn(
                            'px-3 py-2 font-mono font-bold',
                            isUnusedRow ? 'text-slate-400' : 'text-slate-900',
                          )}>
                            PV{row.string_number}
                          </td>
                          {/* Used toggle — flips is_used boolean */}
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setEdits(p => ({ ...p, [key]: { ...e, is_used: !e.is_used } }))}
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                                e.is_used ? 'bg-emerald-500' : 'bg-slate-300',
                              )}
                              aria-label={e.is_used ? 'Mark unused' : 'Mark used'}
                              title={e.is_used ? 'Used (click to mark unused)' : 'Unused (click to mark used)'}
                            >
                              <span
                                className={cn(
                                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                                  e.is_used ? 'translate-x-5' : 'translate-x-1',
                                )}
                              />
                            </button>
                          </td>
                          {/* Peer-comp toggle — flips exclude_from_peer_comparison.
                              ON = in peer pool (south-facing standard install).
                              OFF = removed from peer pool (wall/east/west/shaded).
                              Disabled for unused rows (peer comparison is moot). */}
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setEdits(p => ({
                                ...p,
                                [key]: { ...e, exclude_from_peer_comparison: !e.exclude_from_peer_comparison },
                              }))}
                              disabled={isUnusedRow}
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                                isUnusedRow
                                  ? 'bg-slate-200 cursor-not-allowed opacity-50'
                                  : e.exclude_from_peer_comparison
                                    ? 'bg-slate-300'
                                    : 'bg-emerald-500',
                              )}
                              aria-label={
                                e.exclude_from_peer_comparison
                                  ? 'Mark peer-comparable'
                                  : 'Mark non-standard (exclude from peer comparison)'
                              }
                              title={
                                e.exclude_from_peer_comparison
                                  ? 'Excluded from peer comparison (click to include)'
                                  : 'In peer pool (click to exclude — non-standard orientation/shaded)'
                              }
                            >
                              <span
                                className={cn(
                                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                                  e.exclude_from_peer_comparison ? 'translate-x-1' : 'translate-x-5',
                                )}
                              />
                            </button>
                          </td>
                          {/* Status pill — distinguishes admin-flagged vs auto-detected unused.
                              Non-standard (peer-excluded but used) gets its own pill. Wording
                              stays consistent across edit-state and saved-state so the pill
                              doesn't change when admin saves the row. */}
                          <td className="px-3 py-2">
                            {isUnusedRow ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200">
                                unused · admin
                              </span>
                            ) : e.exclude_from_peer_comparison ? (
                              <span className={cn(
                                'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border',
                                STATUS_STYLES['peer-excluded'].bg,
                                STATUS_STYLES['peer-excluded'].fg,
                                STATUS_STYLES['peer-excluded'].border,
                              )}>
                                <Zap className="w-2.5 h-2.5" strokeWidth={2.5} />
                                {STATUS_STYLES['peer-excluded'].label.toLowerCase()}
                              </span>
                            ) : row.status === 'active' ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Zap className="w-2.5 h-2.5" strokeWidth={2.5} />
                                active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 border border-slate-200">
                                {row.unused_source === 'admin' ? 'unused · admin' : 'unused · auto'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={e.panel_count}
                              onChange={ev => setEdits(p => ({ ...p, [key]: { ...e, panel_count: ev.target.value } }))}
                              className={cn('h-7 w-20 text-[12px]', isUnusedRow && 'opacity-50')}
                              placeholder="—"
                              disabled={isUnusedRow}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={e.panel_make}
                              onChange={ev => setEdits(p => ({ ...p, [key]: { ...e, panel_make: ev.target.value } }))}
                              className={cn('h-7 w-32 text-[12px]', isUnusedRow && 'opacity-50')}
                              placeholder="optional"
                              maxLength={100}
                              disabled={isUnusedRow}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={50}
                              max={1000}
                              value={e.panel_rating_w}
                              onChange={ev => setEdits(p => ({ ...p, [key]: { ...e, panel_rating_w: ev.target.value } }))}
                              className={cn('h-7 w-20 text-[12px]', isUnusedRow && 'opacity-50')}
                              placeholder="optional"
                              disabled={isUnusedRow}
                            />
                          </td>
                          <td className={cn(
                            'px-3 py-2 text-right font-mono',
                            isUnusedRow ? 'text-slate-400' : 'text-slate-700',
                          )}>
                            {computedKwp != null ? `${computedKwp.toFixed(2)} kWp` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleSave(device.device_id, row.string_number)}
                                disabled={!dirty || isSaving}
                                className={cn(
                                  'h-7 text-[11px]',
                                  dirty
                                    ? 'bg-solar-gold hover:bg-solar-gold-600 text-white'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                                )}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />
                                  : <><Save className="w-3 h-3 mr-1" strokeWidth={2.5} /> Save</>
                                }
                              </Button>
                              {row.config && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleClear(device.device_id, row.string_number)}
                                  disabled={isSaving}
                                  className="h-7 text-[11px] text-slate-400 hover:text-red-700"
                                  title="Clear configuration"
                                >
                                  <X className="w-3 h-3" strokeWidth={2.5} />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

      </div>

      {/* ── Bulk apply dialog ─────────────────────────────────────────── */}
      {/* Three independent sections, each guarded by an "Apply" checkbox.
          Admin can push any combination in a single POST. Each section maps
          1:1 to fields on StringConfigBulkSchema (lib/api-validation.ts) —
          unchecked sections are omitted from the payload, so the server
          treats them as "leave that field alone on existing rows." */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to all strings</DialogTitle>
            <DialogDescription>
              Push panel info, mark strings unused, or flag non-standard installs across every string under this plant. Pick the sections you want to apply.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Section 1: Panel info ───────────────────────────────── */}
            <div className="border border-slate-200 rounded-md p-3 space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkForm.applyPanels}
                  onChange={e => setBulkForm({ ...bulkForm, applyPanels: e.target.checked })}
                  className="accent-solar-gold w-4 h-4"
                />
                Apply panel info
              </label>
              <div className={cn('space-y-3', !bulkForm.applyPanels && 'opacity-50 pointer-events-none')}>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Panel count *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={bulkForm.panel_count}
                    onChange={e => setBulkForm({ ...bulkForm, panel_count: e.target.value })}
                    placeholder="e.g. 8"
                    className="mt-1"
                    disabled={!bulkForm.applyPanels}
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Panel make</Label>
                  <Input
                    type="text"
                    value={bulkForm.panel_make}
                    onChange={e => setBulkForm({ ...bulkForm, panel_make: e.target.value })}
                    placeholder="e.g. Longi, Jinko, Canadian Solar"
                    maxLength={100}
                    className="mt-1"
                    disabled={!bulkForm.applyPanels}
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Panel rating (W)</Label>
                  <Input
                    type="number"
                    min={50}
                    max={1000}
                    value={bulkForm.panel_rating_w}
                    onChange={e => setBulkForm({ ...bulkForm, panel_rating_w: e.target.value })}
                    placeholder="e.g. 550"
                    className="mt-1"
                    disabled={!bulkForm.applyPanels}
                  />
                </div>
              </div>
            </div>

            {/* ── Section 2: Used / Unused flag (Phase A) ─────────────── */}
            <div className="border border-slate-200 rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkForm.applyUsed}
                  onChange={e => setBulkForm({ ...bulkForm, applyUsed: e.target.checked })}
                  className="accent-solar-gold w-4 h-4"
                />
                Apply used / unused flag
              </label>
              <div className={cn('flex gap-4 text-xs font-semibold text-slate-700', !bulkForm.applyUsed && 'opacity-50 pointer-events-none')}>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulk-is-used"
                    checked={bulkForm.is_used === true}
                    onChange={() => setBulkForm({ ...bulkForm, is_used: true })}
                    disabled={!bulkForm.applyUsed}
                    className="accent-emerald-600 w-3.5 h-3.5"
                  />
                  Mark used
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulk-is-used"
                    checked={bulkForm.is_used === false}
                    onChange={() => setBulkForm({ ...bulkForm, is_used: false })}
                    disabled={!bulkForm.applyUsed}
                    className="accent-amber-600 w-3.5 h-3.5"
                  />
                  Mark unused (empty PV port)
                </label>
              </div>
            </div>

            {/* ── Section 3: Peer-comp flag (Phase B) ─────────────────── */}
            <div className="border border-slate-200 rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkForm.applyPeerComp}
                  onChange={e => setBulkForm({ ...bulkForm, applyPeerComp: e.target.checked })}
                  className="accent-solar-gold w-4 h-4"
                />
                Apply peer-comparison flag
              </label>
              <div className={cn('flex gap-4 text-xs font-semibold text-slate-700', !bulkForm.applyPeerComp && 'opacity-50 pointer-events-none')}>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulk-peer-comp"
                    checked={bulkForm.exclude_from_peer_comparison === false}
                    onChange={() => setBulkForm({ ...bulkForm, exclude_from_peer_comparison: false })}
                    disabled={!bulkForm.applyPeerComp}
                    className="accent-emerald-600 w-3.5 h-3.5"
                  />
                  Standard install (in peer pool)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulk-peer-comp"
                    checked={bulkForm.exclude_from_peer_comparison === true}
                    onChange={() => setBulkForm({ ...bulkForm, exclude_from_peer_comparison: true })}
                    disabled={!bulkForm.applyPeerComp}
                    className="accent-indigo-600 w-3.5 h-3.5"
                  />
                  Non-standard (wall, east/west, shaded)
                </label>
              </div>
            </div>

            {/* Global "skip already-configured" guard */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={bulkForm.only_unconfigured}
                onChange={e => setBulkForm({ ...bulkForm, only_unconfigured: e.target.checked })}
                className="accent-solar-gold w-4 h-4"
              />
              Only fill strings that are not yet configured (skip existing)
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkApply}
              disabled={
                bulkSaving ||
                (!bulkForm.applyPanels && !bulkForm.applyUsed && !bulkForm.applyPeerComp) ||
                (bulkForm.applyPanels && !bulkForm.panel_count)
              }
              className="bg-solar-gold hover:bg-solar-gold-600 text-white"
            >
              {bulkSaving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Applying...</>
                : <><Layers className="w-3.5 h-3.5 mr-1.5" /> Apply</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
