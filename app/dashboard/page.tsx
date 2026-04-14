'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { PlantCard } from '@/components/shared/PlantCard'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { Zap, AlertTriangle, Activity, Clock, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface DashboardData {
  plants: Array<{ id: string; plant_name: string; capacity_kw: number | null; health_state: number | null; provider?: string; device_count: number; alert_count: number }>
  stats: { totalPlants: number; activeAlerts: number; avgStringHealth: number; lastUpdate: string | null }
  recentAlerts: any[]
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/main')
        if (!res.ok) throw new Error('Failed to fetch dashboard data')
        setData(await res.json())
      } catch (err: any) { setError(err.message) } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  return (
    <PageWrapper title="Overview" loading={loading} error={error || undefined}>
      {data && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Assigned Plants" value={data.stats.totalPlants} icon={Zap} accent="green" />
            <KpiCard
              title="Active Alerts"
              value={data.stats.activeAlerts}
              icon={AlertTriangle}
              accent={data.stats.activeAlerts > 0 ? 'red' : 'green'}
              subtitle={data.stats.activeAlerts > 0 ? 'Needs attention' : 'All clear'}
            />
            <KpiCard
              title="Avg String Health"
              value={`${data.stats.avgStringHealth}%`}
              icon={Activity}
              accent={data.stats.avgStringHealth >= 90 ? 'green' : data.stats.avgStringHealth >= 50 ? 'amber' : 'red'}
            />
            <KpiCard
              title="Last Update"
              value={data.stats.lastUpdate ? formatDistanceToNow(new Date(data.stats.lastUpdate), { addSuffix: true }) : 'N/A'}
              icon={Clock}
              accent="gray"
            />
          </div>

          {/* Plants */}
          <div>
            <h3 className="text-base font-bold text-[#0a0a0a] mb-3">Your Plants</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.plants.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
              {data.plants.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Zap className="h-10 w-10 mx-auto mb-2 text-[#e5e5e5]" />
                  <p className="text-sm font-bold text-[#525252]">No plants assigned yet</p>
                  <p className="text-xs text-[#898989] mt-1">Contact your administrator to assign plants to your organization.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="bg-white rounded border border-[#e5e5e5] p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0a0a0a]">Recent Alerts</h3>
              <Link
                href="/dashboard/alerts"
                className="flex items-center gap-1 text-xs font-semibold text-[#76b900] hover:text-[#5a8f00] transition-colors"
              >
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <AlertPanel alerts={data.recentAlerts} />
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
