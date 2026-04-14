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
        <div className="space-y-8">
          {/* KPI Cards — dark cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard title="Plants" value={data.stats.totalPlants} icon={Zap} accent="green" />
            <KpiCard
              title="Active Alerts"
              value={data.stats.activeAlerts}
              icon={AlertTriangle}
              accent={data.stats.activeAlerts > 0 ? 'red' : 'green'}
              subtitle={data.stats.activeAlerts > 0 ? 'Needs attention' : 'All clear'}
            />
            <KpiCard
              title="String Health"
              value={`${data.stats.avgStringHealth}%`}
              icon={Activity}
              accent={data.stats.avgStringHealth >= 90 ? 'green' : data.stats.avgStringHealth >= 50 ? 'amber' : 'red'}
            />
            <KpiCard
              title="Last Sync"
              value={data.stats.lastUpdate ? formatDistanceToNow(new Date(data.stats.lastUpdate), { addSuffix: true }) : 'N/A'}
              icon={Clock}
              accent="gray"
            />
          </div>

          {/* Plants — dark cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#0a0a0a] uppercase tracking-wider">Your Plants</h3>
              <span className="text-[10px] font-bold text-[#898989]">{data.plants.length} total</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.plants.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
              {data.plants.length === 0 && (
                <div className="col-span-full bg-[#1a1a1a] rounded-sm text-center py-16">
                  <Zap className="h-8 w-8 mx-auto mb-3 text-[#333]" />
                  <p className="text-sm font-bold text-[#5e5e5e]">No plants assigned</p>
                  <p className="text-[11px] text-[#525252] mt-1">Contact your administrator.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Alerts — dark card */}
          <div className="bg-[#1a1a1a] rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#333]">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Alerts</h3>
              <Link
                href="/dashboard/alerts"
                className="flex items-center gap-1 text-[11px] font-bold text-[#76b900] hover:text-[#bff230] transition-colors"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-4">
              <AlertPanel alerts={data.recentAlerts} />
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
