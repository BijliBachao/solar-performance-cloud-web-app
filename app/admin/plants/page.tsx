'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Search, Loader2, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { providerBadge, statusKeyFromPlantOp, STATUS_STYLES } from '@/lib/design-tokens'
import { PLANT_OP_LABEL, type PlantOpStatus } from '@/lib/string-health'

interface AlertCounts { critical: number; warning: number; info: number; total: number }

interface Plant {
  id: string
  plant_name: string
  capacity_kw: number | null
  health_state: number | null
  provider?: string
  last_synced: string | null
  last_reading_at: string | null
  assigned_org: { id: string; name: string } | null
  device_count: number
  string_count: number
  alerts_today: AlertCounts
  alerts_unresolved: AlertCounts
  /** Unified operational status (Status Unification 2026-06-05) — the ONLY
   *  status word this page renders. Same engine as the NOC. */
  op_status: PlantOpStatus
}

interface Organization { id: string; name: string; status: string }

interface PlantStats {
  total: number
  assigned: number
  unassigned: number
  live: number
  idle: number
  frozen: number
  offline: number
  faulty: number
  plants_with_alerts: number
}

type SortKey = 'name' | 'last_reading' | 'capacity' | 'assigned' | 'provider'
type SortDir = 'asc' | 'desc'

export default function AdminPlantsPage() {
  const router = useRouter()
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [providerFilter, setProviderFilter] = useState('ALL')
  const [providers, setProviders] = useState<Array<{ provider: string; count: number }>>([])
  const [stats, setStats] = useState<PlantStats>({ total: 0, assigned: 0, unassigned: 0, live: 0, idle: 0, frozen: 0, offline: 0, faulty: 0, plants_with_alerts: 0 })

  const [assignPlant, setAssignPlant] = useState<Plant | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  const [unassignConfirm, setUnassignConfirm] = useState<Plant | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchPlants = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (providerFilter !== 'ALL') params.set('provider', providerFilter)

      const res = await fetch(`/api/admin/plants?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch plants')
      const data = await res.json()
      setPlants(data.plants)
      setStats(data.stats)
      if (data.providers) setProviders(data.providers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, providerFilter])

  useEffect(() => { fetchPlants() }, [fetchPlants])

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/admin/organizations?limit=100&status=ACTIVE', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setOrgs(data.organizations)
    } catch { /* silent */ }
  }

  const openAssignModal = (plant: Plant) => {
    setAssignPlant(plant)
    setSelectedOrgId(plant.assigned_org?.id || '')
    setAssignLoading(false)
    fetchOrgs()
  }

  const handleAssign = async () => {
    if (!assignPlant || !selectedOrgId) return
    setAssignLoading(true)
    try {
      if (assignPlant.assigned_org && assignPlant.assigned_org.id !== selectedOrgId) {
        const delRes = await fetch('/api/admin/plants/assign', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plant_id: assignPlant.id, organization_id: assignPlant.assigned_org.id }),
        })
        if (!delRes.ok && delRes.status !== 404) throw new Error('Failed to unassign from previous organization')
      }

      const res = await fetch('/api/admin/plants/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_id: assignPlant.id, organization_id: selectedOrgId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to assign plant')
      }

      setAssignPlant(null)
      flashSuccess('Plant assigned')
      fetchPlants()
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setAssignLoading(false)
    }
  }

  const handleUnassign = async (plant: Plant) => {
    if (!plant.assigned_org) return
    setRowBusy(plant.id)
    try {
      const res = await fetch('/api/admin/plants/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_id: plant.id, organization_id: plant.assigned_org.id }),
      })
      if (!res.ok) throw new Error('Failed to unassign plant')
      flashSuccess('Plant unassigned')
      fetchPlants()
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Failed to unassign')
    } finally {
      setRowBusy(null)
    }
  }

  const flashSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(''), 4000) }
  const flashError   = (m: string) => { setErrorMsg(m);   setTimeout(() => setErrorMsg(''),   4000) }

  // Compact relative time. "<1m" for very fresh, "Xm" / "Xh" / date for older.
  const relativeTime = (d: string | null): string => {
    if (!d) return '—'
    const date = new Date(d); if (isNaN(date.getTime())) return '—'
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
    if (diffMin < 1) return '<1m'
    if (diffMin < 60) return `${diffMin}m`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`
    const days = Math.floor(diffMin / 1440)
    if (days < 30) return `${days}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Status Unification (2026-06-05): the old page-local recipe (reading age
  // 5/15/60 min, sun-blind — it marked the whole sleeping fleet "Offline"
  // every night) is GONE. The server computes op_status from the same
  // connectivity engine the NOC uses; this page only renders it.
  const plantStatus = (plant: Plant): { label: string; cls: string; relative: string } => ({
    label: PLANT_OP_LABEL[plant.op_status],
    cls: STATUS_STYLES[statusKeyFromPlantOp(plant.op_status)].fg,
    relative: relativeTime(plant.last_reading_at),
  })

  const issueColor = (counts: AlertCounts): string => {
    if (counts.critical > 0) return 'text-rose-600'
    if (counts.warning  > 0) return 'text-amber-600'
    if (counts.info     > 0) return 'text-blue-600'
    return 'text-slate-300'
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedPlants = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const nullsLast = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      return null
    }
    return [...plants].sort((a, b) => {
      if (sortKey === 'name')     return a.plant_name.localeCompare(b.plant_name) * dir
      if (sortKey === 'capacity') {
        const av = a.capacity_kw == null ? null : Number(a.capacity_kw)
        const bv = b.capacity_kw == null ? null : Number(b.capacity_kw)
        const n = nullsLast(av, bv); return n !== null ? n : (av! - bv!) * dir
      }
      if (sortKey === 'last_reading') {
        const av = a.last_reading_at ? new Date(a.last_reading_at).getTime() : null
        const bv = b.last_reading_at ? new Date(b.last_reading_at).getTime() : null
        const n = nullsLast(av, bv); return n !== null ? n : (av! - bv!) * dir
      }
      if (sortKey === 'assigned') {
        const av = a.assigned_org ? 0 : 1
        const bv = b.assigned_org ? 0 : 1
        if (av !== bv) return (av - bv) * dir
        return a.plant_name.localeCompare(b.plant_name)
      }
      if (sortKey === 'provider') {
        const av = a.provider || ''; const bv = b.provider || ''
        if (av !== bv) return av.localeCompare(bv) * dir
        return a.plant_name.localeCompare(b.plant_name)
      }
      return 0
    })
  }, [plants, sortKey, sortDir])

  // Active-sort always visible at full opacity; inactive columns reveal the
  // chevron at low opacity on hover, full on focus. Screen readers get
  // aria-sort on the parent <th> (threaded via SortableHead) and an explicit
  // aria-label on the button announcing what the click does.
  const SortButton = ({ k, label }: { k: SortKey; label: string }) => {
    const active = sortKey === k
    const nextDir = active && sortDir === 'asc' ? 'descending' : 'ascending'
    return (
      <button
        onClick={() => toggleSort(k)}
        aria-label={`Sort by ${label.toLowerCase()} ${nextDir}`}
        className="group inline-flex items-center gap-1 select-none"
      >
        <span className="text-slate-600 group-hover:text-slate-900 transition-colors">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 transition-all ${
            active
              ? 'text-slate-700 opacity-100'
              : 'text-slate-400 opacity-30 group-hover:opacity-70 group-focus-visible:opacity-100'
          } ${active && sortDir === 'asc' ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
        />
      </button>
    )
  }

  // <th> with aria-sort threaded through, so screen readers announce
  // "ascending" / "descending" / "none" per WAI-ARIA grid pattern.
  const SortableHead = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => {
    const active = sortKey === k
    const ariaSort: 'ascending' | 'descending' | 'none' = active
      ? (sortDir === 'asc' ? 'ascending' : 'descending')
      : 'none'
    return (
      <TableHead className={`px-4 py-2.5 ${className}`} aria-sort={ariaSort}>
        <SortButton k={k} label={label} />
      </TableHead>
    )
  }

  if (loading && plants.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" strokeWidth={2} />
      </div>
    )
  }

  if (error && plants.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-rose-600 mb-3 text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchPlants}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white">
      {/* Header — title, inline counters, filters. No pill chrome. */}
      <div className="border-b border-slate-200">
        <div className="px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Plants</h1>
              <span className="text-xs text-slate-400 font-mono">
                {sortedPlants.length}{sortedPlants.length !== stats.total ? ` of ${stats.total}` : ''}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" strokeWidth={2} /> Back
            </Button>
          </div>

          {/* Inline counters — Stripe/Linear style. Numbers carry semantic
              colour, labels are muted. Status counts use the SAME unified
              op_status as the table rows below — they agree by construction. */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4 text-sm">
            <Counter n={stats.total}                label="total"        color="text-slate-900" />
            {stats.live > 0 && (
              <Counter n={stats.live}               label="live"         color="text-emerald-600" />
            )}
            {stats.idle > 0 && (
              <Counter n={stats.idle}               label="idle · night" color="text-slate-500" />
            )}
            {stats.frozen > 0 && (
              <Counter n={stats.frozen}             label="frozen feed"  color="text-orange-600" />
            )}
            {stats.offline > 0 && (
              <Counter n={stats.offline}            label="offline"      color="text-slate-400" />
            )}
            {stats.faulty > 0 && (
              <Counter n={stats.faulty}             label="faulty"       color="text-rose-600" />
            )}
            {stats.unassigned > 0 && (
              <Counter n={stats.unassigned}         label="unassigned"   color="text-amber-600" />
            )}
            {stats.plants_with_alerts > 0 && (
              <Counter n={stats.plants_with_alerts} label="with issues"  color="text-rose-600" />
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
              <Input
                placeholder="Search plants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full sm:w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All providers</SelectItem>
                {providers.map(({ provider, count }) => {
                  const badge = providerBadge(provider)
                  return (
                    <SelectItem key={provider} value={provider}>
                      {badge?.label || provider}
                      <span className="text-slate-400 ml-1.5 font-mono text-xs">{count}</span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All assignment</SelectItem>
                <SelectItem value="ASSIGNED">Assigned</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Toast banners — single line, muted, dismiss on timeout */}
      {(successMsg || errorMsg) && (
        <div className="px-4 sm:px-6 pt-3">
          {successMsg && (
            <div className="text-sm py-1.5 px-3 border-l-2 border-emerald-500 bg-emerald-50/50 text-emerald-800 inline-block">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="text-sm py-1.5 px-3 border-l-2 border-rose-500 bg-rose-50/50 text-rose-800 inline-block">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Table — dense rows, hover-revealed actions, no row tinting */}
      <div className="px-4 sm:px-6 py-4">
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <SortableHead k="name"         label="Plant" />
                <SortableHead k="last_reading" label="Status" />
                <TableHead className="px-4 py-2.5 hidden md:table-cell">Issues</TableHead>
                <SortableHead k="capacity"     label="Devices · Strings · Capacity" className="hidden md:table-cell" />
                <SortableHead k="assigned"     label="Organization"       className="hidden lg:table-cell" />
                <SortableHead k="provider"     label="Provider"           className="hidden md:table-cell" />
                <TableHead className="px-4 py-2.5 w-px">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-12 text-sm">
                    No plants match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                sortedPlants.map((plant) => {
                  const badge = providerBadge(plant.provider)
                  const status = plantStatus(plant)
                  const tooltipBreakdown = plant.alerts_unresolved.total > 0
                    ? `${plant.alerts_unresolved.critical} critical · ${plant.alerts_unresolved.warning} warning · ${plant.alerts_unresolved.info} info`
                    : 'No open issues'
                  return (
                    <TableRow key={plant.id} className="group">
                      {/* Plant name — single line, no icon. Click → drill-in. */}
                      <TableCell
                        className="px-4 py-2.5 cursor-pointer"
                        onClick={() => router.push(`/admin/plants/${plant.id}`)}
                      >
                        <div className="font-medium text-sm text-slate-900 group-hover:text-slate-950 truncate max-w-[220px] sm:max-w-[280px] lg:max-w-[360px]">
                          {plant.plant_name}
                        </div>
                        {/* Mobile-only meta line — capacity/devices on first
                             row, assignment on second so a long org name
                             wraps cleanly rather than truncating off-screen. */}
                        <div className="md:hidden mt-0.5 text-xs text-slate-500 leading-tight">
                          <div className="truncate">
                            {badge?.label && (
                              <>
                                {badge.label}
                                <span className="mx-1 text-slate-300">·</span>
                              </>
                            )}
                            {plant.device_count} dev
                            <span className="mx-1 text-slate-300">·</span>
                            {plant.string_count} str
                            {plant.capacity_kw && (
                              <>
                                <span className="mx-1 text-slate-300">·</span>
                                {Number(plant.capacity_kw).toFixed(1)} kW
                              </>
                            )}
                          </div>
                          <div className="truncate">
                            {plant.assigned_org ? (
                              <span className="text-slate-600">{plant.assigned_org.name}</span>
                            ) : (
                              <span className="text-amber-600 font-medium">Unassigned</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Status — log-line: word in colour, time-ago in mono slate */}
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className={`font-medium ${status.cls}`}>{status.label}</span>
                          <span className="text-xs text-slate-400 font-mono tabular-nums">{status.relative}</span>
                        </div>
                      </TableCell>

                      {/* Issues — colored count, font-weight encodes severity
                           (critical=bold, warning/info=normal) so the cell is
                           legible to red-green-deficient users too. Click drills
                           into the plant detail (where the alerts list lives). */}
                      <TableCell className="px-4 py-2.5 hidden md:table-cell">
                        {plant.alerts_unresolved.total === 0 ? (
                          <span className="text-slate-300 font-mono text-sm">—</span>
                        ) : (
                          <button
                            title={tooltipBreakdown}
                            onClick={() => router.push(`/admin/plants/${plant.id}`)}
                            className={`text-sm font-mono tabular-nums hover:underline underline-offset-2 ${
                              plant.alerts_unresolved.critical > 0 ? 'font-semibold' : 'font-normal'
                            } ${issueColor(plant.alerts_unresolved)}`}
                          >
                            {plant.alerts_unresolved.total} open
                          </button>
                        )}
                      </TableCell>

                      {/* Capacity — mono, right-aligned-feeling via tabular-nums */}
                      <TableCell className="px-4 py-2.5 hidden md:table-cell text-sm text-slate-600 font-mono tabular-nums whitespace-nowrap">
                        {plant.device_count} <span className="text-slate-400">dev</span>
                        <span className="text-slate-300 mx-1.5">·</span>
                        {plant.string_count} <span className="text-slate-400">str</span>
                        {plant.capacity_kw && (
                          <>
                            <span className="text-slate-300 mx-1.5">·</span>
                            {Number(plant.capacity_kw).toFixed(1)} <span className="text-slate-400">kW</span>
                          </>
                        )}
                      </TableCell>

                      {/* Organization — name OR muted "Unassigned" tag */}
                      <TableCell className="px-4 py-2.5 hidden lg:table-cell">
                        {plant.assigned_org ? (
                          <span className="text-sm text-slate-700 truncate block max-w-[200px]">
                            {plant.assigned_org.name}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Unassigned</span>
                        )}
                      </TableCell>

                      {/* Provider — quiet semantic-colour text, no pill */}
                      <TableCell className="px-4 py-2.5 hidden md:table-cell">
                        {badge ? (
                          <span className={`text-xs ${badge.fg}`}>{badge.label}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Actions — hidden on idle, revealed on row hover/focus.
                           hover-capable media-query keeps actions always visible
                           on touch devices that have no hover state. */}
                      <TableCell className="px-4 py-2.5 text-right">
                        <div className="
                          flex items-center justify-end gap-1
                          opacity-100 [@media(hover:hover)]:opacity-0
                          [@media(hover:hover)]:group-hover:opacity-100
                          [@media(hover:hover)]:group-focus-within:opacity-100
                          transition-opacity duration-150
                        ">
                          {plant.assigned_org ? (
                            <button
                              onClick={() => setUnassignConfirm(plant)}
                              disabled={rowBusy === plant.id}
                              className="px-2 h-7 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-40"
                            >
                              {rowBusy === plant.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Unassign'}
                            </button>
                          ) : (
                            <button
                              onClick={() => openAssignModal(plant)}
                              className="px-2 h-7 text-xs text-spc-green hover:bg-spc-green/10 rounded transition-colors"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/admin/plants/${plant.id}`)}
                            className="px-2 h-7 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-0.5"
                          >
                            View
                            <ChevronRight className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Unassign confirm — lean modal: no icon, definition list, red CTA. */}
      <Dialog
        open={!!unassignConfirm}
        onOpenChange={(open) => { if (!open && !rowBusy) setUnassignConfirm(null) }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Unassign plant from organization?</DialogTitle>
            <DialogDescription className="text-sm">
              The organization will lose access immediately. To restore access you&rsquo;ll need to assign the plant back manually.
            </DialogDescription>
          </DialogHeader>

          <div className="border border-slate-200 rounded-md divide-y divide-slate-100 my-2">
            <div className="grid grid-cols-[100px_1fr] px-3 py-2 text-sm">
              <span className="text-slate-500">Plant</span>
              <span className="text-slate-900 font-medium truncate">{unassignConfirm?.plant_name}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] px-3 py-2 text-sm">
              <span className="text-slate-500">Organization</span>
              <span className="text-slate-900 font-medium truncate">{unassignConfirm?.assigned_org?.name}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] px-3 py-2 text-sm">
              <span className="text-slate-500">Losing access to</span>
              <span className="text-slate-900 font-mono tabular-nums">
                {unassignConfirm?.device_count ?? 0} device{unassignConfirm?.device_count === 1 ? '' : 's'}
                {unassignConfirm?.capacity_kw && (
                  <span className="text-slate-500"> · {Number(unassignConfirm.capacity_kw).toFixed(1)} kW</span>
                )}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignConfirm(null)} disabled={!!rowBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!unassignConfirm) return
                const plant = unassignConfirm
                setUnassignConfirm(null)
                await handleUnassign(plant)
              }}
              disabled={!!rowBusy}
            >
              {rowBusy === unassignConfirm?.id && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" strokeWidth={2} />}
              Unassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Plant Dialog */}
      <Dialog open={!!assignPlant} onOpenChange={(open) => { if (!open && !assignLoading) setAssignPlant(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Assign plant</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-slate-900">{assignPlant?.plant_name}</span>
              {assignPlant?.assigned_org && (
                <> &middot; currently assigned to <span className="text-slate-700">{assignPlant.assigned_org.name}</span></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Organization</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assignPlant?.assigned_org && selectedOrgId && selectedOrgId !== assignPlant.assigned_org.id && (
              <p className="text-xs text-amber-600">
                This will move the plant from {assignPlant.assigned_org.name} to the selected organization.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignPlant(null)} disabled={assignLoading}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!selectedOrgId || assignLoading}>
              {assignLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" strokeWidth={2} />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// Inline counter — number in semantic colour, label muted slate. The visual
// rhythm comes from the bold number + thin label pairing, not pill chrome.
function Counter({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-mono tabular-nums font-semibold ${color}`}>{n}</span>
      <span className="text-slate-500 text-xs">{label}</span>
    </span>
  )
}
