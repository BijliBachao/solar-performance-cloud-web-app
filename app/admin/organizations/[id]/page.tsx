'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

interface OrgDetail {
  id: string; name: string; email: string | null; phone: string | null; address: string | null; status: string
  users: Array<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string; status: string }>
  plant_assignments: Array<{ id: string; plant_id: string; plants: { id: string; plant_name: string; capacity_kw: number | null; health_state: number | null } }>
}

export default function AdminOrgDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [allPlants, setAllPlants] = useState<any[]>([])

  async function fetchOrg() {
    try {
      const res = await fetch(`/api/admin/organizations/${params.id}`)
      if (!res.ok) throw new Error('Organization not found')
      setOrg(await res.json())
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }
  useEffect(() => { fetchOrg() }, [params.id])

  async function handleAssignPlant(plantId: string) {
    await fetch('/api/admin/plants/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plant_id: plantId, organization_id: params.id }) })
    setAssignDialogOpen(false); fetchOrg()
  }
  async function handleRemovePlant(plantId: string) {
    await fetch('/api/admin/plants/assign', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plant_id: plantId, organization_id: params.id }) })
    fetchOrg()
  }
  async function openAssignDialog() {
    const res = await fetch('/api/admin/plants')
    if (res.ok) { const data = await res.json(); setAllPlants(data.plants) }
    setAssignDialogOpen(true)
  }

  const assignedPlantIds = new Set(org?.plant_assignments.map((pa) => pa.plant_id) || [])
  const unassignedPlants = allPlants.filter((p: any) => !assignedPlantIds.has(p.id))

  return (
    <PageWrapper title={org?.name || 'Organization'} loading={loading} error={error || undefined}
      action={<Button variant="outline" onClick={() => router.push('/admin/organizations')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>}>
      {org && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Organization Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Email:</span> <span className="text-gray-900">{org.email || 'N/A'}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="text-gray-900">{org.phone || 'N/A'}</span></div>
              <div><span className="text-gray-500">Address:</span> <span className="text-gray-900">{org.address || 'N/A'}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant={org.status === 'ACTIVE' ? 'success' : 'secondary'}>{org.status}</Badge></div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Assigned Plants</h3>
              <Button size="sm" onClick={openAssignDialog}><Plus className="h-4 w-4 mr-1" />Assign Plant</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Capacity</TableHead><TableHead>Health</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {org.plant_assignments.map((pa) => (
                  <TableRow key={pa.id}>
                    <TableCell className="font-medium">{pa.plants.plant_name}</TableCell>
                    <TableCell>{pa.plants.capacity_kw ? `${Number(pa.plants.capacity_kw).toFixed(1)} kW` : 'N/A'}</TableCell>
                    <TableCell><Badge variant={pa.plants.health_state === 3 ? 'success' : pa.plants.health_state === 2 ? 'destructive' : 'secondary'}>{pa.plants.health_state === 3 ? 'Healthy' : pa.plants.health_state === 2 ? 'Faulty' : 'Disconnected'}</Badge></TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => handleRemovePlant(pa.plant_id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                  </TableRow>
                ))}
                {org.plant_assignments.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">No plants assigned</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Users</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {org.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A'}</TableCell>
                    <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                    <TableCell><Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Plant</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {unassignedPlants.map((plant: any) => (
              <button key={plant.id} onClick={() => handleAssignPlant(plant.id)} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <p className="font-medium text-sm">{plant.plant_name}</p>
                <p className="text-xs text-gray-500">{plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'Capacity N/A'}</p>
              </button>
            ))}
            {unassignedPlants.length === 0 && (<p className="text-center text-gray-500 py-4">No unassigned plants available</p>)}
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
