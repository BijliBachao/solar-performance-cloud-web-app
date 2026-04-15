'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Building2, Zap, Users, AlertTriangle, Activity, Clock, ChevronRight, Loader2,
} from 'lucide-react'

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
          <div className="w-5 h-5 border-2 border-[#76b900] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#898989]">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-[#e52020] mx-auto mb-3" />
          <p className="text-[#e52020] mb-4 text-sm font-semibold">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); setError(null); fetchData() }}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const totalAlerts = data.stats.activeAlerts.CRITICAL + data.stats.activeAlerts.WARNING + data.stats.activeAlerts.INFO

  return (
    <div>
      {/* Header */}
      <div className="border-b border-[#e5e5e5] bg-white">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-base font-bold text-[#0a0a0a]">Dashboard Overview</h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Plants Card */}
          <div
            onClick={() => router.push('/admin/plants')}
            className="bg-white rounded-sm p-4 border border-[#e5e5e5] hover:border-[#76b900] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-4 h-4 text-[#76b900]" />
              <span className="text-xl font-bold text-[#0a0a0a]">
                {data.stats.plants.total}
              </span>
            </div>
            <h3 className="text-[#525252] text-xs font-bold uppercase tracking-wider mb-1">Plants</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#76b900] font-semibold">{data.stats.plants.assigned} assigned</span>
              <span className="text-[#898989]">{data.stats.plants.unassigned} free</span>
            </div>
          </div>

          {/* Organizations Card */}
          <div
            onClick={() => router.push('/admin/organizations')}
            className="bg-white rounded-sm p-4 border border-[#e5e5e5] hover:border-[#76b900] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Building2 className="w-4 h-4 text-[#76b900]" />
              <span className="text-xl font-bold text-[#0a0a0a]">
                {data.stats.organizations.total}
              </span>
            </div>
            <h3 className="text-[#525252] text-xs font-bold uppercase tracking-wider mb-1">Organizations</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#76b900] font-semibold">{data.stats.organizations.active} active</span>
              <span className="text-[#898989]">{data.stats.organizations.inactive} inactive</span>
            </div>
          </div>

          {/* Users Card */}
          <div
            onClick={() => router.push('/admin/users')}
            className="bg-white rounded-sm p-4 border border-[#e5e5e5] hover:border-[#76b900] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Users className="w-4 h-4 text-[#76b900]" />
              <span className="text-xl font-bold text-[#0a0a0a]">
                {data.stats.users.total}
              </span>
            </div>
            <h3 className="text-[#525252] text-xs font-bold uppercase tracking-wider mb-1">Users</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#76b900] font-semibold">{data.stats.users.active} active</span>
              <span className="text-[#898989]">{data.stats.users.pending} pending</span>
            </div>
          </div>

          {/* Alerts Card */}
          <div
            onClick={() => router.push('/admin/plants')}
            className="bg-white rounded-sm p-4 border border-[#e5e5e5] hover:border-[#e52020] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-4 h-4 text-[#e52020]" />
              <span className="text-xl font-bold text-[#0a0a0a]">
                {totalAlerts}
              </span>
            </div>
            <h3 className="text-[#525252] text-xs font-bold uppercase tracking-wider mb-1">Active Alerts</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#e52020] font-semibold">{data.stats.activeAlerts.CRITICAL} critical</span>
              <span className="text-[#ef9100]">{data.stats.activeAlerts.WARNING} warn</span>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Plants by Organization + Plant Health */}
          <div className="lg:col-span-2 space-y-4">
            {/* Plants by Organization */}
            <div className="bg-white rounded-sm border border-[#e5e5e5] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider">Plants by Organization</h3>
                <span className="text-[11px] font-semibold text-[#898989]">{data.stats.plants.total} total</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.plantsByOrganization.map((org, i) => (
                  <div
                    key={i}
                    onClick={() => router.push('/admin/organizations')}
                    className="flex items-center gap-2.5 p-2.5 bg-[#f5f5f5] hover:bg-[#e5e5e5] rounded-sm cursor-pointer transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#76b900] shrink-0" />
                    <span className="flex-1 text-sm font-semibold text-[#525252] truncate">{org.organization}</span>
                    <span className="text-sm font-bold text-[#0a0a0a]">{org.plantCount}</span>
                  </div>
                ))}
                {data.stats.plants.unassigned > 0 && (
                  <div
                    onClick={() => router.push('/admin/plants')}
                    className="flex items-center gap-2.5 p-2.5 bg-[#e52020]/5 hover:bg-[#e52020]/10 rounded-sm cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-[#e52020] shrink-0" />
                    <span className="flex-1 text-sm font-semibold text-[#e52020]">Unassigned</span>
                    <span className="text-sm font-bold text-[#e52020]">{data.stats.plants.unassigned}</span>
                  </div>
                )}
                {data.plantsByOrganization.length === 0 && data.stats.plants.unassigned === 0 && (
                  <p className="text-sm text-[#898989] col-span-2 text-center py-2">No plants yet</p>
                )}
              </div>
            </div>

            {/* Plant Health */}
            <div className="bg-white rounded-sm border border-[#e5e5e5] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider">Plant Health</h3>
                <Activity className="w-3.5 h-3.5 text-[#898989]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-[#76b900]/10 rounded-sm">
                  <div className="text-2xl font-bold text-[#76b900]">{data.plantHealth.healthy}</div>
                  <div className="text-[11px] font-bold text-[#76b900] mt-1 uppercase tracking-wider">Healthy</div>
                </div>
                <div className="text-center p-3 bg-[#e52020]/10 rounded-sm">
                  <div className="text-2xl font-bold text-[#e52020]">{data.plantHealth.faulty}</div>
                  <div className="text-[11px] font-bold text-[#e52020] mt-1 uppercase tracking-wider">Faulty</div>
                </div>
                <div className="text-center p-3 bg-[#f5f5f5] rounded-sm">
                  <div className="text-2xl font-bold text-[#898989]">{data.plantHealth.disconnected}</div>
                  <div className="text-[11px] font-bold text-[#898989] mt-1 uppercase tracking-wider">Offline</div>
                </div>
              </div>
              {data.stats.totalDevices > 0 && (
                <div className="mt-3 text-[11px] font-semibold text-[#898989] text-center">
                  {data.stats.totalDevices} inverter{data.stats.totalDevices !== 1 ? 's' : ''} across all plants
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Recent Activity + Alerts */}
          <div className="space-y-4">
            {/* Recent Activity */}
            <div className="bg-white rounded-sm border border-[#e5e5e5] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider">Recent Activity</h3>
                <Clock className="w-3.5 h-3.5 text-[#898989]" />
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.recentActivity.length > 0 ? (
                  data.recentActivity.map((act, i) => (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-[#f5f5f5] last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        act.status === 'PENDING_ASSIGNMENT' ? 'bg-[#ef9100]' : 'bg-[#76b900]'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#525252] leading-tight">{act.message}</p>
                        <p className="text-[11px] text-[#898989] mt-0.5">{formatTime(act.timestamp)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#898989] text-center py-2">No recent activity</p>
                )}
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="bg-white rounded-sm border border-[#e5e5e5] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider">Active Alerts</h3>
                <span className="text-[11px] font-semibold text-[#898989]">{totalAlerts} open</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {data.recentAlerts.length > 0 ? (
                  data.recentAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-2 py-2 border-b border-[#f5f5f5] last:border-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm shrink-0 mt-0.5 ${
                        alert.severity === 'CRITICAL' ? 'bg-[#e52020]/10 text-[#e52020]'
                        : alert.severity === 'WARNING' ? 'bg-[#ef9100]/10 text-[#ef9100]'
                        : 'bg-[#f5f5f5] text-[#898989]'
                      }`}>
                        {alert.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#525252] leading-tight truncate">{alert.message}</p>
                        <p className="text-[11px] text-[#898989] mt-0.5">{formatTime(alert.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#898989] text-center py-2">No active alerts</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-sm border border-[#e5e5e5] p-4">
          <h3 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { label: 'Manage Plants', href: '/admin/plants', icon: Zap },
              { label: 'Manage Organizations', href: '/admin/organizations', icon: Building2 },
              { label: 'Manage Users', href: '/admin/users', icon: Users },
            ].map((link) => (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className="flex items-center gap-3 p-3 rounded-sm bg-[#f5f5f5] hover:bg-[#e5e5e5] transition-colors"
              >
                <link.icon className="w-4 h-4 text-[#76b900] shrink-0" />
                <span className="text-sm font-bold text-[#525252] flex-1 text-left">{link.label}</span>
                <ChevronRight className="w-4 h-4 text-[#898989]" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
