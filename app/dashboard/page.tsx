'use client'
import { useEffect, useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { PlantCard } from '@/components/shared/PlantCard'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { Zap, AlertTriangle, Activity, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface DashboardData {
  plants: Array<{ id: string; plant_name: string; capacity_kw: number | null; health_state: number | null; device_count: number; alert_count: number }>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Assigned Plants" value={data.stats.totalPlants} icon={Zap} />
            <KpiCard title="Active Alerts" value={data.stats.activeAlerts} icon={AlertTriangle} subtitle={data.stats.activeAlerts > 0 ? 'Needs attention' : 'All clear'} />
            <KpiCard title="Avg String Health" value={`${data.stats.avgStringHealth}%`} icon={Activity} />
            <KpiCard title="Last Update" value={data.stats.lastUpdate ? formatDistanceToNow(new Date(data.stats.lastUpdate), { addSuffix: true }) : 'N/A'} icon={Clock} />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Plants</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.plants.map((plant) => (<PlantCard key={plant.id} plant={plant} />))}
              {data.plants.length === 0 && (<div className="col-span-full text-center py-8 text-gray-500">No plants assigned to your organization yet.</div>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
            <AlertPanel alerts={data.recentAlerts} />
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
