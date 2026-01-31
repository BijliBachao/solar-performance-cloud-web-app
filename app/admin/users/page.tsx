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
  Search, Building2, Shield, Loader2, ArrowLeft, UserPlus, CheckCircle, ChevronLeft, ChevronRight,
} from 'lucide-react'

interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string
  status: string
  created_at: string
  last_login_at: string | null
  organizations: { id: string; name: string } | null
}

interface Organization {
  id: string
  name: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'PENDING_ASSIGNMENT' | 'ACTIVE'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Assign modal
  const [assignUser, setAssignUser] = useState<User | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedRole, setSelectedRole] = useState('ORG_USER')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState(false)

  // Inline role editing
  const [editingRole, setEditingRole] = useState<string | null>(null)

  // Messages
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: currentPage.toString(), limit: '50' })
      if (search) params.set('search', search)
      if (filter !== 'all') params.set('status', filter)

      const res = await fetch(`/api/admin/users?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users)
      setTotalPages(data.pagination.totalPages)
      setTotalCount(data.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [search, filter, currentPage])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/admin/organizations?limit=100', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setOrgs(data.organizations)
    } catch { /* silent */ }
  }

  const openAssignModal = (user: User) => {
    setAssignUser(user)
    setSelectedOrgId(user.organizations?.id || '')
    setSelectedRole(user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ORG_USER')
    setAssignLoading(false)
    setAssignSuccess(false)
    fetchOrgs()
  }

  const handleAssign = async () => {
    if (!assignUser || !selectedOrgId) return
    setAssignLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${assignUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organization_id: selectedOrgId, role: selectedRole, status: 'ACTIVE' }),
      })
      if (!res.ok) throw new Error('Failed to assign user')

      setAssignLoading(false)
      setAssignSuccess(true)
      setTimeout(() => {
        setAssignUser(null)
        setAssignSuccess(false)
        setSuccessMsg('User assigned successfully')
        fetchUsers()
        setTimeout(() => setSuccessMsg(''), 4000)
      }, 1500)
    } catch (err) {
      setAssignLoading(false)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    setEditingRole(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      setSuccessMsg('Role updated')
      fetchUsers()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch {
      setErrorMsg('Failed to update role')
      setTimeout(() => setErrorMsg(''), 3000)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '\u2014'
    const date = new Date(d)
    if (isNaN(date.getTime())) return '\u2014'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const userName = (u: User) => [u.first_name, u.last_name].filter(Boolean).join(' ') || null

  // Stats from loaded data
  const stats = {
    total: totalCount,
    active: users.filter(u => u.status === 'ACTIVE').length,
    pending: users.filter(u => u.status === 'PENDING_ASSIGNMENT').length,
    inactive: users.filter(u => u.status === 'INACTIVE').length,
  }

  const getStatusBadge = (status: string): 'success' | 'warning' | 'secondary' => {
    switch (status) {
      case 'ACTIVE': return 'success'
      case 'PENDING_ASSIGNMENT': return 'warning'
      default: return 'secondary'
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'Active'
      case 'PENDING_ASSIGNMENT': return 'Pending'
      case 'INACTIVE': return 'Inactive'
      default: return s
    }
  }

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchUsers}>Retry</Button>
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
              <h1 className="text-lg font-semibold text-gray-900">Users</h1>
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
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span className="text-gray-500">{stats.pending} pending</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span className="text-gray-500">{stats.inactive} inactive</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            {/* Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {([
                { key: 'all', label: 'All Users' },
                { key: 'PENDING_ASSIGNMENT', label: 'Pending' },
                { key: 'ACTIVE', label: 'Active' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setFilter(tab.key); setCurrentPage(1) }}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                    filter === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9 h-9"
              />
            </div>
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
                <TableHead className="whitespace-nowrap">User</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Organization</TableHead>
                <TableHead className="whitespace-nowrap">Role</TableHead>
                <TableHead className="whitespace-nowrap text-center">Status</TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Last Login</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-12 text-sm">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900 text-sm">{user.email}</div>
                      {userName(user) && (
                        <div className="text-xs text-gray-500 mt-0.5">{userName(user)}</div>
                      )}
                      {/* Mobile: show org below */}
                      <div className="sm:hidden text-xs text-gray-400 mt-0.5">
                        {user.organizations?.name || 'Unassigned'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {user.organizations ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700">{user.organizations.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingRole === user.id ? (
                        <select
                          defaultValue={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          onBlur={() => setEditingRole(null)}
                          autoFocus
                          className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500"
                        >
                          <option value="ORG_USER">ORG_USER</option>
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        </select>
                      ) : (
                        <Badge
                          variant={user.role === 'SUPER_ADMIN' ? 'default' : 'secondary'}
                          className={`cursor-pointer ${user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700 border-transparent' : ''}`}
                          onClick={() => user.role !== 'SUPER_ADMIN' && setEditingRole(user.id)}
                        >
                          {user.role === 'SUPER_ADMIN' && <Shield className="w-3 h-3 mr-1" />}
                          {user.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusBadge(user.status)}>
                        {statusLabel(user.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-gray-500">
                        {user.last_login_at ? formatDate(user.last_login_at) : 'Never'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => openAssignModal(user)}
                          className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium"
                        >
                          {user.status === 'PENDING_ASSIGNMENT' ? 'Assign' : 'Edit'}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-xs text-gray-500">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4 sm:ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Assign User Dialog */}
      <Dialog open={!!assignUser} onOpenChange={(open) => { if (!open && !assignLoading) { setAssignUser(null); setAssignSuccess(false) } }}>
        <DialogContent className="sm:max-w-md">
          {assignSuccess ? (
            <div className="text-center py-8">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Assignment Complete</h3>
              <p className="text-sm text-gray-500">User has been assigned to the organization.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {assignUser?.status === 'PENDING_ASSIGNMENT' ? 'Assign User' : 'Edit User Assignment'}
                </DialogTitle>
                <DialogDescription>
                  {assignUser?.status === 'PENDING_ASSIGNMENT'
                    ? <>Assign <span className="font-medium text-gray-900">{assignUser?.email}</span> to an organization.</>
                    : <>Update assignment for <span className="font-medium text-gray-900">{assignUser?.email}</span>.</>
                  }
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
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORG_USER">Org User</SelectItem>
                      <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignUser(null)} disabled={assignLoading}>
                  Cancel
                </Button>
                <Button onClick={handleAssign} disabled={!selectedOrgId || assignLoading}>
                  {assignLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {assignLoading ? 'Saving...' : assignUser?.status === 'PENDING_ASSIGNMENT' ? 'Assign' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
