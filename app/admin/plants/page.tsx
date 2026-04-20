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
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-3 sm:gap-6">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Plants</h1>
              <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="font-mono font-semibold text-slate-500">{stats.total}</span>
                  <span className="text-slate-500">total</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.healthy.dot}`} />
                  <span className="font-mono font-semibold text-slate-700">{stats.assigned}</span>
                  <span className="text-slate-500">assigned</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.warning.dot}`} />
                  <span className="font-mono font-semibold text-slate-700">{stats.unassigned}</span>
                  <span className="text-slate-500">unassigned</span>
                </div>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.healthy.dot}`} />
                  <span className="font-mono font-semibold text-slate-700">{stats.healthy}</span>
                  <span className="text-slate-500">healthy</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.critical.dot}`} />
                  <span className="font-mono font-semibold text-slate-700">{stats.faulty}</span>
                  <span className="text-slate-500">faulty</span>
                </div>
                {stats.plants_with_alerts > 0 && (
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.warning.dot}`} />
                    <span className="font-mono font-semibold text-slate-700">{stats.plants_with_alerts}</span>
                    <span className="text-slate-500">with alerts</span>
                  </div>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-1" strokeWidth={2} /> Back
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" strokeWidth={2} />
              <Input
                placeholder="Search plants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Providers</SelectItem>
                {providers.map(({ provider, count }) => {
                  const badge = providerBadge(provider)
                  return (
                    <SelectItem key={provider} value={provider}>
                      {badge?.label || provider} ({count})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
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

      {/* Table */}
      <div className="px-4 sm:px-6 py-4">
        <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="whitespace-nowrap">Plant</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Capacity</TableHead>
                <TableHead className="whitespace-nowrap text-center">Health</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Issues</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Organization</TableHead>
                <TableHead className="whitespace-nowrap text-center hidden md:table-cell">Devices</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Last Synced</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-12 text-sm">
                    No plants found
                  </TableCell>
                </TableRow>
              ) : (
                plants.map((plant) => {
                  const badge = providerBadge(plant.provider)
                  return (
                    <TableRow
                      key={plant.id}
                      className={!plant.assigned_org ? 'bg-amber-50/40' : ''}
                    >
                      <TableCell>
                        <div
                          className="cursor-pointer group"
                          onClick={() => router.push(`/admin/plants/${plant.id}`)}
                        >
                          <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 group-hover:text-spc-green transition-colors">
                            <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                            {plant.plant_name}
                            {badge && (
                              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${badge.bg} ${badge.fg} ${badge.border}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <div className="sm:hidden text-xs text-slate-500 font-mono mt-0.5">
                            {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm font-mono text-slate-700">
                          {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={healthBadgeVariant(plant.health_state)}>
                          {plantHealthLabel(plant.health_state)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {plant.alerts_unresolved.total === 0 && plant.alerts_today.total === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex items-center gap-2 text-xs">
                            {plant.alerts_today.critical > 0 && (
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.critical.dot}`} />
                                <span className="font-mono text-slate-700">{plant.alerts_today.critical}</span>
                              </span>
                            )}
                            {plant.alerts_today.warning > 0 && (
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.warning.dot}`} />
                                <span className="font-mono text-slate-700">{plant.alerts_today.warning}</span>
                              </span>
                            )}
                            {plant.alerts_today.info > 0 && (
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${STATUS_STYLES.info.dot}`} />
                                <span className="font-mono text-slate-700">{plant.alerts_today.info}</span>
                              </span>
                            )}
                            {plant.alerts_unresolved.total > 0 && (
                              <>
                                {plant.alerts_today.total > 0 && <span className="text-slate-300">·</span>}
                                <span className="text-slate-500 font-mono">{plant.alerts_unresolved.total} open</span>
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {plant.assigned_org ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                            <span className="text-sm text-slate-700">{plant.assigned_org.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-amber-700 font-semibold">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <span className="text-sm font-mono text-slate-600">{plant.device_count}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-slate-500">{formatDate(plant.last_synced)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {plant.assigned_org ? (
                            <button
                              onClick={() => handleUnassign(plant)}
                              disabled={quickAssignLoading === plant.id}
                              className="text-amber-600 hover:text-amber-700 text-xs sm:text-sm font-semibold disabled:opacity-50 transition-colors"
                            >
                              {quickAssignLoading === plant.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                              ) : (
                                'Unassign'
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => openAssignModal(plant)}
                              className="text-spc-green hover:text-spc-green-dark text-xs sm:text-sm font-semibold transition-colors"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/admin/plants/${plant.id}`)}
                            className="text-slate-600 hover:text-slate-900 text-xs sm:text-sm font-semibold ml-2 sm:ml-3 flex items-center gap-0.5 transition-colors"
                          >
                            View <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
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
