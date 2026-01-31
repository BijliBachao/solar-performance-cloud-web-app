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

interface Plant {
  id: string
  plant_name: string
  capacity_kw: number | null
  health_state: number | null
  last_synced: string | null
  assigned_org: { id: string; name: string } | null
  device_count: number
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
}

export default function AdminPlantsPage() {
  const router = useRouter()
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [stats, setStats] = useState<PlantStats>({ total: 0, assigned: 0, unassigned: 0, healthy: 0, faulty: 0, disconnected: 0 })

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

      const res = await fetch(`/api/admin/plants?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch plants')
      const data = await res.json()
      setPlants(data.plants)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

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
        await fetch('/api/admin/plants/assign', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plant_id: assignPlant.id, organization_id: assignPlant.assigned_org.id }),
        })
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

  const healthBadge = (state: number | null): { label: string; variant: 'success' | 'destructive' | 'secondary' } => {
    if (state === 3) return { label: 'Healthy', variant: 'success' }
    if (state === 2) return { label: 'Faulty', variant: 'destructive' }
    return { label: 'Disconnected', variant: 'secondary' }
  }

  if (loading && plants.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error && plants.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchPlants}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <h1 className="text-lg font-semibold text-gray-900">Plants</h1>
              <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-gray-500">{stats.total} total</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-gray-500">{stats.assigned} assigned</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span className="text-gray-500">{stats.unassigned} unassigned</span>
                </div>
                <span className="text-gray-600 hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-gray-500">{stats.healthy} healthy</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-gray-500">{stats.faulty} faulty</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search plants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plants</SelectItem>
                <SelectItem value="ASSIGNED">Assigned</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="mx-4 sm:mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mx-4 sm:mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="px-4 sm:px-6 py-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="whitespace-nowrap">Plant</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Capacity</TableHead>
                <TableHead className="whitespace-nowrap text-center">Health</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Organization</TableHead>
                <TableHead className="whitespace-nowrap text-center hidden md:table-cell">Devices</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Last Synced</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-12 text-sm">
                    No plants found
                  </TableCell>
                </TableRow>
              ) : (
                plants.map((plant) => {
                  const health = healthBadge(plant.health_state)
                  return (
                    <TableRow
                      key={plant.id}
                      className={!plant.assigned_org ? 'bg-yellow-50/50' : ''}
                    >
                      <TableCell>
                        <div
                          className="cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => router.push(`/admin/plants/${plant.id}`)}
                        >
                          <div className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                            {plant.plant_name}
                          </div>
                          <div className="sm:hidden text-xs text-gray-500 mt-0.5">
                            {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-gray-700">
                          {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={health.variant}>{health.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {plant.assigned_org ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-700">{plant.assigned_org.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-orange-600 font-medium">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <span className="text-sm font-mono text-gray-600">{plant.device_count}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-gray-500">{formatDate(plant.last_synced)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {plant.assigned_org ? (
                            <button
                              onClick={() => handleUnassign(plant)}
                              disabled={quickAssignLoading === plant.id}
                              className="text-orange-600 hover:text-orange-700 text-xs sm:text-sm font-medium disabled:opacity-50"
                            >
                              {quickAssignLoading === plant.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                'Unassign'
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => openAssignModal(plant)}
                              className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/admin/plants/${plant.id}`)}
                            className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium ml-2 sm:ml-3 flex items-center gap-0.5"
                          >
                            View <ChevronRight className="w-3.5 h-3.5" />
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
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Assignment Complete</h3>
              <p className="text-sm text-gray-500">Plant has been assigned to the organization.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Assign Plant</DialogTitle>
                <DialogDescription>
                  Assign <span className="font-medium text-gray-900">{assignPlant?.plant_name}</span> to an organization.
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
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                    This will reassign the plant from <span className="font-medium">{assignPlant.assigned_org.name}</span> to the selected organization.
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignPlant(null)} disabled={assignLoading}>
                  Cancel
                </Button>
                <Button onClick={handleAssign} disabled={!selectedOrgId || assignLoading}>
                  {assignLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
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
