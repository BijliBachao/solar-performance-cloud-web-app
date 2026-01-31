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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 mb-4 text-sm">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); setError(null); fetchData() }}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const totalAlerts = data.stats.activeAlerts.CRITICAL + data.stats.activeAlerts.WARNING + data.stats.activeAlerts.INFO

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Dashboard Overview</h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Stat Cards - 4 clickable cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Plants Card */}
          <div
            onClick={() => router.push('/admin/plants')}
            className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 sm:p-2.5 bg-orange-50 rounded-lg">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">
                {data.stats.plants.total}
              </span>
            </div>
            <h3 className="text-gray-700 text-sm font-medium mb-1">Plants</h3>
            <div className="flex items-center gap-2 sm:gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-gray-600">{data.stats.plants.assigned} assigned</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                <span className="text-gray-500">{data.stats.plants.unassigned} free</span>
              </span>
            </div>
          </div>

          {/* Organizations Card */}
          <div
            onClick={() => router.push('/admin/organizations')}
            className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 sm:p-2.5 bg-blue-50 rounded-lg">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">
                {data.stats.organizations.total}
              </span>
            </div>
            <h3 className="text-gray-700 text-sm font-medium mb-1">Organizations</h3>
            <div className="flex items-center gap-2 sm:gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-gray-600">{data.stats.organizations.active} active</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                <span className="text-gray-500">{data.stats.organizations.inactive} inactive</span>
              </span>
            </div>
          </div>

          {/* Users Card */}
          <div
            onClick={() => router.push('/admin/users')}
            className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 sm:p-2.5 bg-purple-50 rounded-lg">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">
                {data.stats.users.total}
              </span>
            </div>
            <h3 className="text-gray-700 text-sm font-medium mb-1">Users</h3>
            <div className="flex items-center gap-2 sm:gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-gray-600">{data.stats.users.active} active</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                <span className="text-gray-500">{data.stats.users.pending} pending</span>
              </span>
            </div>
          </div>

          {/* Alerts Card */}
          <div
            className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100 hover:border-red-200 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 sm:p-2.5 bg-red-50 rounded-lg">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">
                {totalAlerts}
              </span>
            </div>
            <h3 className="text-gray-700 text-sm font-medium mb-1">Active Alerts</h3>
            <div className="flex items-center gap-2 sm:gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                <span className="text-gray-600">{data.stats.activeAlerts.CRITICAL} critical</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                <span className="text-gray-500">{data.stats.activeAlerts.WARNING} warn</span>
              </span>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Plants by Organization + Plant Health */}
          <div className="lg:col-span-2 space-y-4">
            {/* Plants by Organization */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Plants by Organization</h3>
                <span className="text-xs text-gray-500">{data.stats.plants.total} total</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.plantsByOrganization.map((org, i) => (
                  <div
                    key={i}
                    onClick={() => router.push('/admin/organizations')}
                    className="flex items-center gap-2.5 p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{org.organization}</span>
                    <span className="text-sm font-medium text-gray-900">{org.plantCount}</span>
                  </div>
                ))}
                {data.stats.plants.unassigned > 0 && (
                  <div
                    onClick={() => router.push('/admin/plants')}
                    className="flex items-center gap-2.5 p-2.5 bg-orange-50 hover:bg-orange-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="flex-1 text-sm text-orange-700">Unassigned</span>
                    <span className="text-sm font-medium text-orange-600">{data.stats.plants.unassigned}</span>
                  </div>
                )}
                {data.plantsByOrganization.length === 0 && data.stats.plants.unassigned === 0 && (
                  <p className="text-sm text-gray-500 col-span-2 text-center py-2">No plants yet</p>
                )}
              </div>
            </div>

            {/* Plant Health */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Plant Health</h3>
                <Activity className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{data.plantHealth.healthy}</div>
                  <div className="text-xs text-green-700 mt-1">Healthy</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{data.plantHealth.faulty}</div>
                  <div className="text-xs text-red-700 mt-1">Faulty</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{data.plantHealth.disconnected}</div>
                  <div className="text-xs text-gray-500 mt-1">Disconnected</div>
                </div>
              </div>
              {data.stats.totalDevices > 0 && (
                <div className="mt-3 text-xs text-gray-500 text-center">
                  {data.stats.totalDevices} inverter{data.stats.totalDevices !== 1 ? 's' : ''} across all plants
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Recent Activity */}
          <div className="space-y-4">
            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                <Clock className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.recentActivity.length > 0 ? (
                  data.recentActivity.map((act, i) => (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        act.status === 'PENDING_ASSIGNMENT' ? 'bg-orange-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-tight">{act.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatTime(act.timestamp)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">No recent activity</p>
                )}
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Active Alerts</h3>
                <span className="text-xs text-gray-500">{totalAlerts} open</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {data.recentAlerts.length > 0 ? (
                  data.recentAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                      <Badge
                        variant={alert.severity === 'CRITICAL' ? 'destructive' : alert.severity === 'WARNING' ? 'warning' : 'secondary'}
                        className="text-[10px] px-1.5 py-0 mt-0.5 shrink-0"
                      >
                        {alert.severity}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-tight truncate">{alert.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatTime(alert.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">No active alerts</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { label: 'Manage Plants', href: '/admin/plants', icon: Zap, color: 'text-orange-600 bg-orange-50 hover:bg-orange-100' },
              { label: 'Manage Organizations', href: '/admin/organizations', icon: Building2, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
              { label: 'Manage Users', href: '/admin/users', icon: Users, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
            ].map((link) => (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${link.color}`}
              >
                <link.icon className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium flex-1 text-left">{link.label}</span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
