'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search } from 'lucide-react'
import { format } from 'date-fns'

interface Organization {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
  _count: { users: number; plant_assignments: number }
}

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' })
  const [creating, setCreating] = useState(false)

  async function fetchOrgs() {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/admin/organizations${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setOrgs(data.organizations)
    } catch { /* handle */ } finally { setLoading(false) }
  }

  useEffect(() => { fetchOrgs() }, [search])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error('Failed to create')
      setDialogOpen(false)
      setFormData({ name: '', email: '', phone: '', address: '' })
      fetchOrgs()
    } catch { /* handle */ } finally { setCreating(false) }
  }

  return (
    <PageWrapper title="Organizations" loading={loading}
      action={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Organization</Button>}>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search organizations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Plants</TableHead><TableHead>Users</TableHead><TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id} className="cursor-pointer" onClick={() => router.push(`/admin/organizations/${org.id}`)}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell><Badge variant={org.status === 'ACTIVE' ? 'success' : 'secondary'}>{org.status}</Badge></TableCell>
                <TableCell>{org._count.plant_assignments}</TableCell>
                <TableCell>{org._count.users}</TableCell>
                <TableCell className="text-gray-500">{format(new Date(org.created_at), 'MMM d, yyyy')}</TableCell>
              </TableRow>
            ))}
            {orgs.length === 0 && !loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">No organizations found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Organization</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="name">Name *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Organization name" /></div>
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="contact@example.com" /></div>
            <div><Label htmlFor="phone">Phone</Label><Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+92..." /></div>
            <div><Label htmlFor="address">Address</Label><Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Address" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name || creating}>{creating ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
