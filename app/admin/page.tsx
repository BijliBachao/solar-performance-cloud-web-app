'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Building2, Zap, Users, AlertTriangle, Activity, Clock, ChevronRight,
} from 'lucide-react'
import {
  STATUS_STYLES,
  statusKeyFromSeverity,
} from '@/lib/design-tokens'

interface DashboardData {
  stats: {
    totalPlants: number
    totalDevices: number
    organizations: { total: number; active: number; inactive: number }
    users: { total: number; active: number; pending: number }
    plants: { total: number; assigned: number; unassigned: number }
    activeAlerts: { CRITICAL: number; WARNING: number; INFO: number }
  }
  plantHealth: { healthy: number; faulty: number; disconnected: number }
  plantsByOrganization: Array<{ organization: string; plantCount: number }>
  recentActivity: Array<{ type: string; message: string; timestamp: string; status: string }>
  recentAlerts: Array<{
    id: string; severity: string; message: string; created_at: string
    plant_id: string; device_id: string; string_number: number
  }>
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 403) { router.push('/dashboard'); return }
        throw new Error('Failed to fetch dashboard')
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (ts: string) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return `${Math.floor(diffMin / 1440)}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-spc-green border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-3" strokeWidth={2} />
          <p className="text-red-700 mb-4 text-sm font-semibold">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); setError(null); fetchData() }}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const totalAlerts = data.stats.activeAlerts.CRITICAL + data.stats.activeAlerts.WARNING + data.stats.activeAlerts.INFO

  return (
    <div>
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="px-4 sm:px-6 py-5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Dashboard Overview</h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Plants */}
          <div
            onClick={() => router.push('/admin/plants')}
            className="relative bg-white rounded-sm border border-slate-200 hover:border-spc-green transition-colors cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-spc-green" />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Plants</span>
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-spc-green/10">
                  <Zap className="w-4 h-4 text-spc-green" strokeWidth={2} />
                </div>
              </div>
              <div className="text-[28px] font-mono font-bold leading-none text-slate-900 mb-2">
                {data.stats.plants.total}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-spc-green font-semibold">{data.stats.plants.assigned} assigned</span>
                <span className="text-slate-400">{data.stats.plants.unassigned} free</span>
              </div>
            </div>
          </div>

          {/* Organizations */}
          <div
            onClick={() => router.push('/admin/organizations')}
            className="relative bg-white rounded-sm border border-slate-200 hover:border-spc-green transition-colors cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-spc-green" />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Organizations</span>
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-spc-green/10">
                  <Building2 className="w-4 h-4 text-spc-green" strokeWidth={2} />
                </div>
              </div>
              <div className="text-[28px] font-mono font-bold leading-none text-slate-900 mb-2">
                {data.stats.organizations.total}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-spc-green font-semibold">{data.stats.organizations.active} active</span>
                <span className="text-slate-400">{data.stats.organizations.inactive} inactive</span>
              </div>
            </div>
          </div>

          {/* Users */}
          <div
            onClick={() => router.push('/admin/users')}
            className="relative bg-white rounded-sm border border-slate-200 hover:border-spc-green transition-colors cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-spc-green" />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Users</span>
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-spc-green/10">
                  <Users className="w-4 h-4 text-spc-green" strokeWidth={2} />
                </div>
              </div>
              <div className="text-[28px] font-mono font-bold leading-none text-slate-900 mb-2">
                {data.stats.users.total}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-spc-green font-semibold">{data.stats.users.active} active</span>
                <span className="text-slate-400">{data.stats.users.pending} pending</span>
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          <div
            onClick={() => router.push('/admin/plants')}
            className="relative bg-white rounded-sm border border-slate-200 hover:border-red-600 transition-colors cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-600" />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Alerts</span>
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-600" strokeWidth={2} />
                </div>
              </div>
              <div className="text-[28px] font-mono font-bold leading-none text-slate-900 mb-2">
                {totalAlerts}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-red-700 font-semibold">{data.stats.activeAlerts.CRITICAL} critical</span>
                <span className="text-amber-700">{data.stats.activeAlerts.WARNING} warn</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Plants by Organization + Plant Health */}
          <div className="lg:col-span-2 space-y-4">
            {/* Plants by Organization */}
            <div className="bg-white rounded-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Plants by Organization</h3>
                <span className="text-[11px] font-semibold text-slate-400">{data.stats.plants.total} total</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.plantsByOrganization.map((org, i) => (
                  <div
                    key={i}
                    onClick={() => router.push('/admin/organizations')}
                    className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-sm cursor-pointer transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-spc-green shrink-0" strokeWidth={2} />
                    <span className="flex-1 text-sm font-semibold text-slate-600 truncate">{org.organization}</span>
                    <span className="text-sm font-mono font-bold text-slate-900">{org.plantCount}</span>
                  </div>
                ))}
                {data.stats.plants.unassigned > 0 && (
                  <div
                    onClick={() => router.push('/admin/plants')}
                    className="flex items-center gap-2.5 p-2.5 bg-red-50 hover:bg-red-100 rounded-sm cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" strokeWidth={2} />
                    <span className="flex-1 text-sm font-semibold text-red-700">Unassigned</span>
                    <span className="text-sm font-mono font-bold text-red-700">{data.stats.plants.unassigned}</span>
                  </div>
                )}
                {data.plantsByOrganization.length === 0 && data.stats.plants.unassigned === 0 && (
                  <p className="text-sm text-slate-400 col-span-2 text-center py-2">No plants yet</p>
                )}
              </div>
            </div>

            {/* Plant Health */}
            <div className="bg-white rounded-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Plant Health</h3>
                <Activity className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className={`text-center p-3 rounded-sm ${STATUS_STYLES.healthy.bg}`}>
                  <div className={`text-2xl font-mono font-bold ${STATUS_STYLES.healthy.fg}`}>{data.plantHealth.healthy}</div>
                  <div className={`text-[11px] font-bold mt-1 uppercase tracking-wider ${STATUS_STYLES.healthy.fg}`}>Healthy</div>
                </div>
                <div className={`text-center p-3 rounded-sm ${STATUS_STYLES.critical.bg}`}>
                  <div className={`text-2xl font-mono font-bold ${STATUS_STYLES.critical.fg}`}>{data.plantHealth.faulty}</div>
                  <div className={`text-[11px] font-bold mt-1 uppercase tracking-wider ${STATUS_STYLES.critical.fg}`}>Faulty</div>
                </div>
                <div className={`text-center p-3 rounded-sm ${STATUS_STYLES.offline.bg}`}>
                  <div className={`text-2xl font-mono font-bold ${STATUS_STYLES.offline.fg}`}>{data.plantHealth.disconnected}</div>
                  <div className={`text-[11px] font-bold mt-1 uppercase tracking-wider ${STATUS_STYLES.offline.fg}`}>Offline</div>
                </div>
              </div>
              {data.stats.totalDevices > 0 && (
                <div className="mt-3 text-[11px] font-semibold text-slate-400 text-center">
                  {data.stats.totalDevices} inverter{data.stats.totalDevices !== 1 ? 's' : ''} across all plants
                </div>
              )}
            </div>
          </div>

          {/* Right: Recent Activity + Active Alerts */}
          <div className="space-y-4">
            {/* Recent Activity */}
            <div className="bg-white rounded-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Recent Activity</h3>
                <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.recentActivity.length > 0 ? (
                  data.recentActivity.map((act, i) => (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        act.status === 'PENDING_ASSIGNMENT' ? 'bg-amber-500' : 'bg-spc-green'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 leading-tight">{act.message}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatTime(act.timestamp)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 text-center py-2">No recent activity</p>
                )}
              </div>
            </div>

            {/* Active Alerts */}
            <div className="bg-white rounded-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Active Alerts</h3>
                <span className="text-[11px] font-semibold text-slate-400">{totalAlerts} open</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {data.recentAlerts.length > 0 ? (
                  data.recentAlerts.map((alert) => {
                    const s = STATUS_STYLES[statusKeyFromSeverity(alert.severity)]
                    return (
                      <div key={alert.id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm shrink-0 mt-0.5 ${s.bg} ${s.fg}`}>
                          {alert.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-600 leading-tight truncate">{alert.message}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{formatTime(alert.created_at)}</p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-slate-400 text-center py-2">No active alerts</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-sm border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { label: 'Manage Plants', href: '/admin/plants', icon: Zap },
              { label: 'Manage Organizations', href: '/admin/organizations', icon: Building2 },
              { label: 'Manage Users', href: '/admin/users', icon: Users },
            ].map((link) => (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className="flex items-center gap-3 p-3 rounded-sm bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <link.icon className="w-4 h-4 text-spc-green shrink-0" strokeWidth={2} />
                <span className="text-sm font-bold text-slate-600 flex-1 text-left">{link.label}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
