'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import {
  Search, Loader2, ArrowLeft, CheckCircle, Building2, Zap, ChevronRight,
} from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromSeverity,
  statusKeyFromPlantHealth,
  plantHealthLabel,
  providerBadge,
} from '@/lib/design-tokens'

interface AlertCounts {
  critical: number
  warning: number
  info: number
  total: number
}

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
  alerts_today: AlertCounts
  alerts_unresolved: AlertCounts
}

interface Organization {
  id: string
  name: string
  status: string
}

interface PlantStats {
  total: number
  assigned: number
  unassigned: number
  healthy: number
  faulty: number
  disconnected: number
  plants_with_alerts: number
}

export default function AdminPlantsPage() {
  const router = useRouter()
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [providerFilter, setProviderFilter] = useState('ALL')
  const [providers, setProviders] = useState<Array<{ provider: string; count: number }>>([])
  const [stats, setStats] = useState<PlantStats>({ total: 0, assigned: 0, unassigned: 0, healthy: 0, faulty: 0, disconnected: 0, plants_with_alerts: 0 })

  // Assign modal
  const [assignPlant, setAssignPlant] = useState<Plant | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState(false)

  // Quick assign
  const [quickAssignLoading, setQuickAssignLoading] = useState<string | null>(null)

  // Messages
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
    setAssignSuccess(false)
    fetchOrgs()
  }

  const handleAssign = async () => {
    if (!assignPlant || !selectedOrgId) return
    setAssignLoading(true)
    try {
      // If plant is currently assigned to a different org, unassign first
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

      setAssignLoading(false)
      setAssignSuccess(true)
      setTimeout(() => {
        setAssignPlant(null)
        setAssignSuccess(false)
        setSuccessMsg('Plant assigned successfully')
        fetchPlants()
        setTimeout(() => setSuccessMsg(''), 4000)
      }, 1500)
    } catch (err) {
      setAssignLoading(false)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  const handleUnassign = async (plant: Plant) => {
    if (!plant.assigned_org) return
    setQuickAssignLoading(plant.id)
    try {
      const res = await fetch('/api/admin/plants/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_id: plant.id, organization_id: plant.assigned_org.id }),
      })
      if (!res.ok) throw new Error('Failed to unassign plant')
      setSuccessMsg('Plant unassigned successfully')
      fetchPlants()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to unassign')
      setTimeout(() => setErrorMsg(''), 4000)
    } finally {
      setQuickAssignLoading(null)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return 'Never'
    const date = new Date(d)
    if (isNaN(date.getTime())) return 'Never'
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const healthBadgeVariant = (state: number | null): 'success' | 'destructive' | 'secondary' => {
    const key = statusKeyFromPlantHealth(state)
    if (key === 'healthy') return 'success'
    if (key === 'critical') return 'destructive'
    return 'secondary'
  }

  // Combined plant status: takes the WORST of (health_state, reading
  // freshness). A "healthy" plant whose last reading was 4 hours ago is
  // operationally offline regardless of the cached health flag.
  const plantStatus = (plant: Plant): {
    key: 'healthy' | 'idle' | 'stale' | 'offline' | 'faulty'
    label: string
    relative: string
  } => {
    const healthKey = statusKeyFromPlantHealth(plant.health_state)
    const lastReading = plant.last_reading_at ? new Date(plant.last_reading_at) : null
    const ageMin = lastReading ? Math.floor((Date.now() - lastReading.getTime()) / 60000) : Infinity
    const relative = lastReading ? formatDate(plant.last_reading_at) : '—'

    // Reading-age severity (a plant must report every ~5 min — 15 min stale,
    // >1h offline). Worst-of with health flag.
    type ReadingKey = 'healthy' | 'idle' | 'stale' | 'offline'
    let readingKey: ReadingKey = 'healthy'
    if (!lastReading) readingKey = 'offline'
    else if (ageMin > 60) readingKey = 'offline'
    else if (ageMin > 15) readingKey = 'stale'
    else if (ageMin > 5) readingKey = 'idle'

    if (healthKey === 'critical') return { key: 'faulty', label: 'Faulty', relative }
    if (readingKey === 'offline') return { key: 'offline', label: 'Offline', relative }
    if (readingKey === 'stale') return { key: 'stale', label: 'Stale', relative }
    if (readingKey === 'idle') return { key: 'idle', label: 'Idle', relative }
    return { key: 'healthy', label: 'Healthy', relative }
  }

  const statusDot = (key: 'healthy' | 'idle' | 'stale' | 'offline' | 'faulty') => {
    if (key === 'healthy') return STATUS_STYLES.healthy.dot
    if (key === 'idle') return STATUS_STYLES.healthy.dot  // green still — slightly behind but fine
    if (key === 'stale') return STATUS_STYLES.warning.dot
    if (key === 'offline') return STATUS_STYLES.offline.dot
    return STATUS_STYLES.critical.dot
  }
  const statusFg = (key: 'healthy' | 'idle' | 'stale' | 'offline' | 'faulty') => {
    if (key === 'healthy' || key === 'idle') return 'text-slate-700'
    if (key === 'stale') return STATUS_STYLES.warning.fg
    if (key === 'offline') return 'text-slate-400'
    return STATUS_STYLES.critical.fg
  }

  // Issues column: single colored count of unresolved alerts. Tooltip on
  // hover gives the breakdown. Replaces the cryptic 142/6/10/138 number salad.
  const issueSeverityKey = (counts: AlertCounts): 'critical' | 'warning' | 'info' | 'none' => {
    if (counts.critical > 0) return 'critical'
    if (counts.warning > 0) return 'warning'
    if (counts.info > 0) return 'info'
    return 'none'
  }

  if (loading && plants.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-spc-green border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading...</span>
        </div>
      </div>
    )
  }

  if (error && plants.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-700 mb-4 text-sm font-semibold">{error}</p>
          <Button variant="outline" onClick={fetchPlants}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header — stats bar + filters */}
      <div className="border-b border-slate-200 bg-white">
        <div className="px-4 sm:px-6 py-5">
          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Plants</h1>
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-1" strokeWidth={2} /> Back
            </Button>
          </div>

          {/* Stats — compact pill row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
              <span className="font-mono font-semibold text-slate-900 text-sm">{stats.total}</span>
              <span className="text-slate-600 text-xs">plants</span>
            </div>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${STATUS_STYLES.healthy.bg}`}>
              <span className={`font-mono font-semibold text-sm ${STATUS_STYLES.healthy.fg}`}>{stats.healthy}</span>
              <span className={`text-xs ${STATUS_STYLES.healthy.fg} opacity-80`}>healthy</span>
            </div>
            {stats.faulty > 0 && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${STATUS_STYLES.critical.bg}`}>
                <span className={`font-mono font-semibold text-sm ${STATUS_STYLES.critical.fg}`}>{stats.faulty}</span>
                <span className={`text-xs ${STATUS_STYLES.critical.fg} opacity-80`}>faulty</span>
              </div>
            )}
            {stats.unassigned > 0 && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${STATUS_STYLES.warning.bg}`}>
                <span className={`font-mono font-semibold text-sm ${STATUS_STYLES.warning.fg}`}>{stats.unassigned}</span>
                <span className={`text-xs ${STATUS_STYLES.warning.fg} opacity-80`}>unassigned</span>
              </div>
            )}
            {stats.plants_with_alerts > 0 && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${STATUS_STYLES.warning.bg}`}>
                <span className={`font-mono font-semibold text-sm ${STATUS_STYLES.warning.fg}`}>{stats.plants_with_alerts}</span>
                <span className={`text-xs ${STATUS_STYLES.warning.fg} opacity-80`}>with open issues</span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" strokeWidth={2} />
              <Input
                placeholder="Search plants by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full sm:w-[170px] h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Providers</SelectItem>
                {providers.map(({ provider, count }) => {
                  const badge = providerBadge(provider)
                  return (
                    <SelectItem key={provider} value={provider}>
                      {badge?.label || provider} · {count}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All assignment</SelectItem>
                <SelectItem value="ASSIGNED">Assigned</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className={`mx-4 sm:mx-6 mt-4 p-3 rounded-sm text-sm font-medium flex items-center gap-2 border ${STATUS_STYLES.healthy.bg} ${STATUS_STYLES.healthy.border} ${STATUS_STYLES.healthy.fg}`}>
          <CheckCircle className="w-4 h-4" strokeWidth={2} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className={`mx-4 sm:mx-6 mt-4 p-3 rounded-sm text-sm font-medium border ${STATUS_STYLES.critical.bg} ${STATUS_STYLES.critical.border} ${STATUS_STYLES.critical.fg}`}>
          {errorMsg}
        </div>
      )}

      {/* Table — 6 cols max, no horizontal scroll. Columns drop progressively
           on smaller viewports; mobile collapses meta into the Plant cell. */}
      <div className="px-4 sm:px-6 py-4">
        <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="whitespace-nowrap">Plant</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Issues</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Devices · Capacity</TableHead>
                <TableHead className="whitespace-nowrap hidden lg:table-cell">Organization</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12 text-sm">
                    No plants found
                  </TableCell>
                </TableRow>
              ) : (
                plants.map((plant) => {
                  const badge = providerBadge(plant.provider)
                  const status = plantStatus(plant)
                  const issueKey = issueSeverityKey(plant.alerts_unresolved)
                  const tooltipBreakdown = plant.alerts_unresolved.total > 0
                    ? `${plant.alerts_unresolved.critical} critical · ${plant.alerts_unresolved.warning} warning · ${plant.alerts_unresolved.info} info`
                    : 'No open issues'
                  return (
                    <TableRow
                      key={plant.id}
                      className={!plant.assigned_org ? 'bg-amber-50/30' : ''}
                    >
                      {/* Plant: name + provider badge; on mobile, capacity + devices fold under */}
                      <TableCell>
                        <div
                          className="cursor-pointer group"
                          onClick={() => router.push(`/admin/plants/${plant.id}`)}
                        >
                          <div className="font-semibold text-slate-900 text-sm flex items-center gap-2 group-hover:text-spc-green transition-colors flex-wrap">
                            <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                            <span className="truncate max-w-[180px] sm:max-w-none">{plant.plant_name}</span>
                            {badge && (
                              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.bg} ${badge.fg} ${badge.border} border whitespace-nowrap`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          {/* Mobile-only meta line: capacity · devices · org */}
                          <div className="md:hidden text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-mono">
                              {plant.device_count} dev · {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                            </span>
                            {plant.assigned_org ? (
                              <span className="text-slate-500">· {plant.assigned_org.name}</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">· Unassigned</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Status: combined health + last reading. Two-line cell */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(status.key)}`} />
                          <div className="flex flex-col">
                            <span className={`text-sm font-semibold leading-tight ${statusFg(status.key)}`}>
                              {status.label}
                            </span>
                            <span className="text-xs text-slate-500 leading-tight">{status.relative}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Issues: single colored count + tooltip with breakdown */}
                      <TableCell className="hidden md:table-cell">
                        {issueKey === 'none' ? (
                          <span className="text-slate-300 text-sm">—</span>
                        ) : (
                          <span
                            title={tooltipBreakdown}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold cursor-help ${
                              issueKey === 'critical' ? STATUS_STYLES.critical.bg + ' ' + STATUS_STYLES.critical.fg :
                              issueKey === 'warning'  ? STATUS_STYLES.warning.bg  + ' ' + STATUS_STYLES.warning.fg  :
                                                        STATUS_STYLES.info.bg     + ' ' + STATUS_STYLES.info.fg
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              issueKey === 'critical' ? STATUS_STYLES.critical.dot :
                              issueKey === 'warning'  ? STATUS_STYLES.warning.dot  :
                                                        STATUS_STYLES.info.dot
                            }`} />
                            {plant.alerts_unresolved.total} open
                          </span>
                        )}
                      </TableCell>

                      {/* Devices · Capacity (combined to save a column) */}
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm font-mono text-slate-600 whitespace-nowrap">
                          {plant.device_count} dev · {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                        </span>
                      </TableCell>

                      {/* Organization (desktop only) */}
                      <TableCell className="hidden lg:table-cell">
                        {plant.assigned_org ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                            <span className="text-sm text-slate-700 truncate max-w-[180px]">{plant.assigned_org.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Unassigned</span>
                        )}
                      </TableCell>

                      {/* Actions: 2 distinct buttons, never wrapped */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {plant.assigned_org ? (
                            <button
                              onClick={() => handleUnassign(plant)}
                              disabled={quickAssignLoading === plant.id}
                              className="px-2 py-1 text-xs font-semibold rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {quickAssignLoading === plant.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                              ) : (
                                'Unassign'
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => openAssignModal(plant)}
                              className="px-2 py-1 text-xs font-semibold rounded border border-spc-green/30 bg-spc-green/10 text-spc-green hover:bg-spc-green/20 transition-colors whitespace-nowrap"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/admin/plants/${plant.id}`)}
                            className="px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap inline-flex items-center gap-0.5"
                          >
                            View <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
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

      {/* Assign Plant Dialog */}
      <Dialog open={!!assignPlant} onOpenChange={(open) => { if (!open && !assignLoading) { setAssignPlant(null); setAssignSuccess(false) } }}>
        <DialogContent className="sm:max-w-md">
          {assignSuccess ? (
            <div className="text-center py-8">
              <div className={`mx-auto flex items-center justify-center h-14 w-14 rounded-full mb-4 ${STATUS_STYLES.healthy.bg}`}>
                <CheckCircle className={`h-7 w-7 ${STATUS_STYLES.healthy.fg}`} strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Assignment Complete</h3>
              <p className="text-sm text-slate-500">Plant has been assigned to the organization.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Assign Plant</DialogTitle>
                <DialogDescription>
                  Assign <span className="font-semibold text-slate-900">{assignPlant?.plant_name}</span> to an organization.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Organization *</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map(org => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {assignPlant?.assigned_org && selectedOrgId && selectedOrgId !== assignPlant.assigned_org.id && (
                  <div className={`p-2 rounded-sm text-xs font-medium border ${STATUS_STYLES.warning.bg} ${STATUS_STYLES.warning.border} ${STATUS_STYLES.warning.fg}`}>
                    This will reassign the plant from <span className="font-semibold">{assignPlant.assigned_org.name}</span> to the selected organization.
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignPlant(null)} disabled={assignLoading}>
                  Cancel
                </Button>
                <Button onClick={handleAssign} disabled={!selectedOrgId || assignLoading}>
                  {assignLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" strokeWidth={2} />}
                  {assignLoading ? 'Assigning...' : 'Assign'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
