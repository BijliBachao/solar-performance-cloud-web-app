'use client'
import { useEffect, useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { Zap, AlertTriangle, Building2, Users } from 'lucide-react'

interface DashboardData {
  stats: {
    totalPlants: number
    totalDevices: number
    totalOrganizations: number
    totalUsers: number
    pendingUsers: number
    activeAlerts: { CRITICAL: number; WARNING: number; INFO: number }
  }
  plantHealth: { healthy: number; faulty: number; disconnected: number }
  recentAlerts: any[]
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/dashboard')
        if (!res.ok) throw new Error('Failed to fetch dashboard data')
        setData(await res.json())
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <PageWrapper title="Overview" loading={loading} error={error || undefined}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Plants"
              value={data.stats.totalPlants}
              icon={Zap}
              subtitle={\`${data.stats.totalDevices} inverters\`}
            />
            <KpiCard
              title="Active Alerts"
              value={
                data.stats.activeAlerts.CRITICAL +
                data.stats.activeAlerts.WARNING +
                data.stats.activeAlerts.INFO
              }
              icon={AlertTriangle}
              subtitle={\`${data.stats.activeAlerts.CRITICAL} critical\`}
            />
            <KpiCard
              title="Organizations"
              value={data.stats.totalOrganizations}
              icon={Building2}
            />
            <KpiCard
              title="Users"
              value={data.stats.totalUsers}
              icon={Users}
              subtitle={\`${data.stats.pendingUsers} pending\`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Plant Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-600">Healthy</span>
                  </div>
                  <span className="font-semibold">{data.plantHealth.healthy}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm text-gray-600">Faulty</span>
                  </div>
                  <span className="font-semibold">{data.plantHealth.faulty}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-gray-400" />
                    <span className="text-sm text-gray-600">Disconnected</span>
                  </div>
                  <span className="font-semibold">{data.plantHealth.disconnected}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
              <AlertPanel alerts={data.recentAlerts} />
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
