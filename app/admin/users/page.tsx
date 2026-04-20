'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
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
  Search, Building2, Shield, Loader2, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { STATUS_STYLES } from '@/lib/design-tokens'

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
  const [statusCounts, setStatusCounts] = useState({ active: 0, pending: 0, inactive: 0 })

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
      if (data.statusCounts) setStatusCounts(data.statusCounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [search, filter, currentPage])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/admin/organizations?limit=100&status=ACTIVE', { credentials: 'include' })
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

  // Stats from API (global counts, not page-scoped)
  const stats = {
    total: totalCount,
    active: statusCounts.active,
    pending: statusCounts.pending,
    inactive: statusCounts.inactive,
  }

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'secondary' => {
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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-spc-green border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading...</span>
        </div>
      </div>
    )
  }

  if (error && users.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-700 mb-4 text-sm font-semibold">{error}</p>
          <Button variant="outline" onClick={fetchUsers}>Retry</Button>
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
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Users</h1>
              <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="font-mono font-semibold text-slate-500">{stats.total}</span>
                  <span className="text-slate-500">total</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.healthy.dot)} />
                  <span className="font-mono font-semibold text-slate-700">{stats.active}</span>
                  <span className="text-slate-500">active</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.warning.dot)} />
                  <span className="font-mono font-semibold text-slate-700">{stats.pending}</span>
                  <span className="text-slate-500">pending</span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_STYLES.offline.dot)} />
                  <span className="font-mono font-semibold text-slate-700">{stats.inactive}</span>
                  <span className="text-slate-500">inactive</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-1" strokeWidth={2} /> Back
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
                  className={cn(
                    'px-3 py-1.5 rounded-sm text-xs font-bold transition-colors whitespace-nowrap border',
                    filter === tab.key
                      ? 'bg-spc-green/10 text-spc-green border-spc-green/30'
                      : 'bg-slate-50 text-slate-600 border-transparent hover:bg-slate-100',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" strokeWidth={2} />
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
        <div className={cn(
          'mx-4 sm:mx-6 mt-4 p-3 rounded-sm text-sm font-medium flex items-center gap-2 border',
          STATUS_STYLES.healthy.bg, STATUS_STYLES.healthy.border, STATUS_STYLES.healthy.fg,
        )}>
          <CheckCircle className="w-4 h-4" strokeWidth={2} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className={cn(
          'mx-4 sm:mx-6 mt-4 p-3 rounded-sm text-sm font-medium border',
          STATUS_STYLES.critical.bg, STATUS_STYLES.critical.border, STATUS_STYLES.critical.fg,
        )}>
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="px-4 sm:px-6 py-4">
        <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
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
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12 text-sm">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900 text-sm">{user.email}</div>
                      {userName(user) && (
                        <div className="text-xs text-slate-500 mt-0.5">{userName(user)}</div>
                      )}
                      {/* Mobile: show org below */}
                      <div className="sm:hidden text-xs text-slate-400 mt-0.5">
                        {user.organizations?.name || 'Unassigned'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {user.organizations ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                          <span className="text-sm text-slate-700">{user.organizations.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingRole === user.id ? (
                        <select
                          defaultValue={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          onBlur={() => setEditingRole(null)}
                          autoFocus
                          className="px-2 py-1 border border-slate-200 rounded-sm text-xs text-slate-900 focus:outline-none focus:border-spc-green focus:ring-2 focus:ring-spc-green/20"
                        >
                          <option value="ORG_USER">ORG_USER</option>
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        </select>
                      ) : user.role === 'SUPER_ADMIN' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border bg-violet-50 text-violet-700 border-violet-200">
                          <Shield className="w-3 h-3" strokeWidth={2} />
                          {user.role}
                        </span>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setEditingRole(user.id)}
                        >
                          {user.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusBadgeVariant(user.status)}>
                        {statusLabel(user.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-slate-500">
                        {user.last_login_at ? formatDate(user.last_login_at) : 'Never'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => openAssignModal(user)}
                          className="text-spc-green hover:text-spc-green-dark text-xs sm:text-sm font-semibold transition-colors"
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
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 sm:mr-1" strokeWidth={2} />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-xs font-mono text-slate-500">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4 sm:ml-1" strokeWidth={2} />
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
              <div className={cn(
                'mx-auto flex items-center justify-center h-14 w-14 rounded-full mb-4',
                STATUS_STYLES.healthy.bg,
              )}>
                <CheckCircle className={cn('h-7 w-7', STATUS_STYLES.healthy.fg)} strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Assignment Complete</h3>
              <p className="text-sm text-slate-500">User has been assigned to the organization.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {assignUser?.status === 'PENDING_ASSIGNMENT' ? 'Assign User' : 'Edit User Assignment'}
                </DialogTitle>
                <DialogDescription>
                  {assignUser?.status === 'PENDING_ASSIGNMENT'
                    ? <>Assign <span className="font-semibold text-slate-900">{assignUser?.email}</span> to an organization.</>
                    : <>Update assignment for <span className="font-semibold text-slate-900">{assignUser?.email}</span>.</>}
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
                  {assignLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" strokeWidth={2} />}
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
