'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import {
  statusKeyFromPlantHealth,
  plantHealthLabel,
} from '@/lib/design-tokens'

interface OrgDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  status: string
  users: Array<{
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    role: string
    status: string
  }>
  plant_assignments: Array<{
    id: string
    plant_id: string
    plants: {
      id: string
      plant_name: string
      capacity_kw: number | null
      health_state: number | null
    }
  }>
}

function plantHealthBadgeVariant(state: number | null): 'success' | 'destructive' | 'secondary' {
  const key = statusKeyFromPlantHealth(state)
  if (key === 'healthy') return 'success'
  if (key === 'critical') return 'destructive'
  return 'secondary'
}

export default function AdminOrgDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [allPlants, setAllPlants] = useState<any[]>([])
  const [assignLoading, setAssignLoading] = useState(false)

  async function fetchOrg() {
    try {
      const res = await fetch(`/api/admin/organizations/${params.id}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Organization not found')
      setOrg(await res.json())
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchOrg() }, [params.id])

  async function handleAssignPlant(plantId: string) {
    setAssignLoading(true)
    try {
      const res = await fetch('/api/admin/plants/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_id: plantId, organization_id: params.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to assign plant')
      }
      setAssignDialogOpen(false)
      fetchOrg()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAssignLoading(false)
    }
  }

  async function handleRemovePlant(plantId: string) {
    setAssignLoading(true)
    try {
      const res = await fetch('/api/admin/plants/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_id: plantId, organization_id: params.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove plant')
      }
      fetchOrg()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAssignLoading(false)
    }
  }

  async function openAssignDialog() {
    try {
      const res = await fetch('/api/admin/plants', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load plants')
      const data = await res.json()
      setAllPlants(data.plants)
    } catch (err: any) {
      setError(err.message)
      return
    }
    setAssignDialogOpen(true)
  }

  const assignedPlantIds = new Set(org?.plant_assignments.map((pa) => pa.plant_id) || [])
  const unassignedPlants = allPlants.filter((p: any) => !assignedPlantIds.has(p.id))

  return (
    <PageWrapper
      title={org?.name || 'Organization'}
      loading={loading}
      error={error || undefined}
      action={
        <Button variant="outline" onClick={() => router.push('/admin/organizations')}>
          <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={2} />Back
        </Button>
      }
    >
      {org && (
        <div className="space-y-4">
          {/* Organization Info */}
          <div className="bg-white rounded-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 leading-tight mb-4">Organization Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Email</span>
                <span className="text-slate-900">{org.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Phone</span>
                <span className="text-slate-900 font-mono">{org.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Address</span>
                <span className="text-slate-900">{org.address || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Status</span>
                <Badge variant={org.status === 'ACTIVE' ? 'success' : 'secondary'}>{org.status}</Badge>
              </div>
            </div>
          </div>

          {/* Assigned Plants */}
          <div className="bg-white rounded-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Assigned Plants</h3>
              <Button size="sm" disabled={assignLoading} onClick={openAssignDialog}>
                <Plus className="h-4 w-4 mr-1" strokeWidth={2} />Assign Plant
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Name</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.plant_assignments.map((pa) => (
                  <TableRow key={pa.id}>
                    <TableCell className="font-semibold text-slate-900">{pa.plants.plant_name}</TableCell>
                    <TableCell className="font-mono text-slate-700">
                      {pa.plants.capacity_kw ? `${Number(pa.plants.capacity_kw).toFixed(1)} kW` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plantHealthBadgeVariant(pa.plants.health_state)}>
                        {plantHealthLabel(pa.plants.health_state)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        disabled={assignLoading}
                        onClick={() => handleRemovePlant(pa.plant_id)}
                        className="p-1.5 rounded-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Remove plant from organization"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {org.plant_assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-400 py-8 text-sm">
                      No plants assigned
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Users */}
          <div className="bg-white rounded-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 leading-tight mb-4">Users</h3>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="text-slate-900">{user.email}</TableCell>
                    <TableCell className="text-slate-700">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {org.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-400 py-8 text-sm">
                      No users
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Assign Plant Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Plant</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {unassignedPlants.map((plant: any) => (
              <button
                key={plant.id}
                disabled={assignLoading}
                onClick={() => handleAssignPlant(plant.id)}
                className={cn(
                  'w-full text-left p-3 rounded-sm border border-slate-200',
                  'hover:border-spc-green hover:bg-spc-green/5 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <p className="font-semibold text-sm text-slate-900">{plant.plant_name}</p>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'Capacity N/A'}
                </p>
              </button>
            ))}
            {unassignedPlants.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">No unassigned plants available</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
