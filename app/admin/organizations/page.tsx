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
  Search, Loader2, Trash2, ArrowLeft, Plus, CheckCircle,
} from 'lucide-react'

interface Organization {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  status: string
  created_at: string
  _count: { users: number; plant_assignments: number }
}

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' })
  const [formLoading, setFormLoading] = useState(false)

  // Delete state
  const [deleteModal, setDeleteModal] = useState<Organization | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Messages
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchOrgs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: '1', limit: '50' })
      if (search) params.set('search', search)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/admin/organizations?${params}`, { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch organizations')
      }
      const data = await res.json()
      setOrgs(data.organizations)
    } catch (err) {
      console.error('Error fetching organizations:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      if (err instanceof Error && err.message.includes('403')) {
        router.push('/dashboard')
      }
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, router])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormLoading(true)
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to create organization')
      setFormData({ name: '', email: '', phone: '', address: '' })
      setShowCreateModal(false)
      setSuccessMsg('Organization created successfully')
      setTimeout(() => setSuccessMsg(''), 4000)
      await fetchOrgs()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create organization')
      setTimeout(() => setErrorMsg(''), 4000)
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteModal || deleteConfirmText !== 'DELETE') return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/organizations/${deleteModal.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to delete organization')
      setDeleteModal(null)
      setDeleteConfirmText('')
      setSuccessMsg('Organization deleted successfully')
      setTimeout(() => setSuccessMsg(''), 4000)
      await fetchOrgs()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete organization')
    } finally {
      setDeleteLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '\u2014'
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return '\u2014'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Stats
  const stats = {
    total: orgs.length,
    active: orgs.filter(o => o.status === 'ACTIVE').length,
    inactive: orgs.filter(o => o.status !== 'ACTIVE').length,
    totalUsers: orgs.reduce((sum, o) => sum + o._count.users, 0),
    totalPlants: orgs.reduce((sum, o) => sum + o._count.plant_assignments, 0),
  }

  if (loading && orgs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error && orgs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchOrgs}>Retry</Button>
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
              <h1 className="text-lg font-semibold text-gray-900">Organizations</h1>
              <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-gray-500">{stats.total} total</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-gray-500">{stats.active} active</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-gray-500">{stats.inactive} inactive</span>
                </div>
                <span className="text-gray-600 hidden sm:inline">|</span>
                <span className="text-gray-500 whitespace-nowrap">{stats.totalUsers} users</span>
                <span className="text-gray-500 whitespace-nowrap">{stats.totalPlants} plants</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
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
                <TableHead className="whitespace-nowrap">Organization</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Contact</TableHead>
                <TableHead className="whitespace-nowrap text-center">Plants</TableHead>
                <TableHead className="whitespace-nowrap text-center">Users</TableHead>
                <TableHead className="whitespace-nowrap text-center">Status</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Created</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-12 text-sm">
                    No organizations found
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <span className="font-medium text-gray-900 text-sm">{org.name}</span>
                      <div className="sm:hidden text-xs text-gray-500 mt-0.5">{org.email || '\u2014'}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm text-gray-500">{org.email || '\u2014'}</div>
                      {org.phone && <div className="text-xs text-gray-500">{org.phone}</div>}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-mono ${org._count.plant_assignments > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                        {org._count.plant_assignments}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-mono ${org._count.users > 0 ? 'text-blue-500' : 'text-gray-600'}`}>
                        {org._count.users}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={org.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {org.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-gray-500">{formatDate(org.created_at)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/admin/organizations/${org.id}`)}
                          className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm mr-1 sm:mr-2 font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            setDeleteModal(org)
                            setDeleteConfirmText('')
                            setDeleteError(null)
                          }}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete organization"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateModal} onOpenChange={(open) => { if (!open && !formLoading) setShowCreateModal(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>Create a new organization to manage users and plants.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Organization name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="contact@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={2}
                placeholder="Street address"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={formLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {formLoading ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={!!deleteModal} onOpenChange={(open) => { if (!open && !deleteLoading) { setDeleteModal(null); setDeleteConfirmText(''); setDeleteError(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-gray-900">{deleteModal?.name}</span> and all data?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {deleteModal && deleteModal._count.users > 0 && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                {deleteModal._count.users} user{deleteModal._count.users !== 1 ? 's' : ''} must be removed first
              </div>
            )}
            {deleteModal && deleteModal._count.plant_assignments > 0 && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                {deleteModal._count.plant_assignments} plant{deleteModal._count.plant_assignments !== 1 ? 's' : ''} must be unassigned first
              </div>
            )}
            {deleteError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {deleteError}
              </div>
            )}

            {deleteModal && deleteModal._count.users === 0 && deleteModal._count.plant_assignments === 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Type DELETE to confirm</Label>
                <Input
                  autoFocus
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirmText === 'DELETE' && !deleteLoading) handleDelete() }}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteModal(null); setDeleteConfirmText(''); setDeleteError(null) }}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleteLoading ||
                deleteConfirmText !== 'DELETE' ||
                (deleteModal ? deleteModal._count.users > 0 || deleteModal._count.plant_assignments > 0 : true)
              }
            >
              {deleteLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
