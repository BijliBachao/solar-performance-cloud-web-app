'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Plant {
  id: string; plant_name: string; capacity_kw: number | null; health_state: number | null
  last_synced: string | null; assigned_org: { id: string; name: string } | null; device_count: number
}

export default function AdminPlantsPage() {
  const router = useRouter()
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const [assignDialog, setAssignDialog] = useState<Plant | null>(null)
  const [orgs, setOrgs] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')

  async function fetchPlants() {
    try {
      const res = await fetch('/api/admin/plants')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setPlants(data.plants)
    } catch { /* handle */ } finally { setLoading(false) }
  }
  useEffect(() => { fetchPlants() }, [])

  async function handleAssign() {
    if (!assignDialog || !selectedOrgId) return
    await fetch('/api/admin/plants/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plant_id: assignDialog.id, organization_id: selectedOrgId }) })
    setAssignDialog(null); setSelectedOrgId(''); fetchPlants()
  }
  async function openAssignDialog(plant: Plant) {
    setAssignDialog(plant)
    const res = await fetch('/api/admin/organizations')
    if (res.ok) { const data = await res.json(); setOrgs(data.organizations) }
  }

  const healthLabel = (state: number | null) => {
    if (state === 3) return { label: 'Healthy', variant: 'success' as const }
    if (state === 2) return { label: 'Faulty', variant: 'destructive' as const }
    return { label: 'Disconnected', variant: 'secondary' as const }
  }

  return (
    <PageWrapper title="Plants" loading={loading}>
      <div className="bg-white rounded-xl border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Capacity</TableHead><TableHead>Health</TableHead><TableHead>Assigned Org</TableHead><TableHead>Devices</TableHead><TableHead>Last Synced</TableHead><TableHead>Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {plants.map((plant) => {
              const health = healthLabel(plant.health_state)
              return (
                <TableRow key={plant.id} className={cn(!plant.assigned_org && 'bg-yellow-50')}>
                  <TableCell className="font-medium cursor-pointer hover:text-primary-600" onClick={() => router.push(`/admin/plants/${plant.id}`)}>{plant.plant_name}</TableCell>
                  <TableCell>{plant.capacity_kw ? `${Number(plant.capacity_kw).toFixed(1)} kW` : 'N/A'}</TableCell>
                  <TableCell><Badge variant={health.variant}>{health.label}</Badge></TableCell>
                  <TableCell>{plant.assigned_org?.name || <span className="text-yellow-600 font-medium">Unassigned</span>}</TableCell>
                  <TableCell>{plant.device_count}</TableCell>
                  <TableCell className="text-gray-500">{plant.last_synced ? format(new Date(plant.last_synced), 'MMM d, HH:mm') : 'Never'}</TableCell>
                  <TableCell>{!plant.assigned_org && (<Button size="sm" variant="outline" onClick={() => openAssignDialog(plant)}>Assign</Button>)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Plant: {assignDialog?.plant_name}</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium">Organization</label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
              <SelectContent>{orgs.map((org: any) => (<SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!selectedOrgId}>Assign</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
