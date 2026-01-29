'use client'
import { useEffect, useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search } from 'lucide-react'

interface User {
  id: string; email: string; first_name: string | null; last_name: string | null
  role: string; status: string; created_at: string
  organizations: { id: string; name: string } | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [approveDialog, setApproveDialog] = useState<User | null>(null)
  const [orgs, setOrgs] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedRole, setSelectedRole] = useState('ORG_USER')

  async function fetchUsers() {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/users?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setUsers(data.users)
    } catch { /* handle */ } finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [search, statusFilter])

  async function handleApprove() {
    if (!approveDialog || !selectedOrgId) return
    await fetch(`/api/admin/users/${approveDialog.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: selectedOrgId, role: selectedRole, status: 'ACTIVE' }),
    })
    setApproveDialog(null); setSelectedOrgId(''); fetchUsers()
  }

  function openApproveDialog(user: User) {
    setApproveDialog(user)
    fetch('/api/admin/organizations').then(r => r.json()).then(d => setOrgs(d.organizations)).catch(() => {})
  }

  return (
    <PageWrapper title="Users" loading={loading}>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="PENDING_ASSIGNMENT">Pending</TabsTrigger>
              <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead>
              <TableHead>Organization</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A'}</TableCell>
                <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                <TableCell>{user.organizations?.name || 'Unassigned'}</TableCell>
                <TableCell><Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'PENDING_ASSIGNMENT' ? 'warning' : 'secondary'}>{user.status}</Badge></TableCell>
                <TableCell>{user.status === 'PENDING_ASSIGNMENT' && (<Button size="sm" onClick={() => openApproveDialog(user)}>Approve</Button>)}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !loading && (<TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No users found</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve User</DialogTitle></DialogHeader>
          {approveDialog && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Assign <strong>{approveDialog.email}</strong> to an organization.</p>
              <div>
                <label className="text-sm font-medium">Organization</label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                  <SelectContent>{orgs.map((org: any) => (<SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORG_USER">Org User</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={!selectedOrgId}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
