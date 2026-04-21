'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HEALTH_HEALTHY, HEALTH_WARNING } from '@/lib/string-health'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { PlantCard } from '@/components/shared/PlantCard'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { Zap, AlertTriangle, Activity, Clock, ArrowRight, Sun } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface DashboardData {
  plants: Array<{
    id: string
    plant_name: string
    capacity_kw: number | null
    health_state: number | null
    provider?: string
    device_count: number
    alert_count: number
  }>
  stats: {
    totalPlants: number
    activeAlerts: number
    avgStringHealth: number
    lastUpdate: string | null
  }
  recentAlerts: any[]
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/main', { credentials: 'include' })
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
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Plants"
              value={data.stats.totalPlants}
              icon={Zap}
              accent="gold"
              subtitle={
                data.stats.totalPlants === 1 ? '1 plant monitored' : `${data.stats.totalPlants} plants monitored`
              }
            />
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
              accent={
                data.stats.avgStringHealth >= HEALTH_HEALTHY
                  ? 'green'
                  : data.stats.avgStringHealth >= HEALTH_WARNING
                    ? 'amber'
                    : 'red'
              }
              subtitle="Average across all strings"
            />
            <KpiCard
              title="Last Sync"
              value={
                data.stats.lastUpdate
                  ? formatDistanceToNow(new Date(data.stats.lastUpdate), {
                      addSuffix: true,
                    })
                  : 'N/A'
              }
              icon={Clock}
              accent="blue"
              subtitle="Data refresh interval: 5 min"
            />
          </div>

          {/* Plants */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-solar-gold" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Your Plants
                </h2>
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500">
                {data.plants.length} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.plants.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
              {data.plants.length === 0 && (
                <div className="col-span-full bg-white rounded-md border border-slate-200 text-center py-16 px-4">
                  <Sun className="h-12 w-12 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
                  <p className="text-sm font-bold text-slate-600">No plants assigned</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Contact your administrator to get access to your plants.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Recent Alerts */}
          <section>
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-solar-gold" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Recent Alerts
                  </h2>
                </div>
                <Link
                  href="/dashboard/alerts"
                  className="flex items-center gap-1 text-[11px] font-bold text-solar-gold-700 hover:text-solar-gold-800 transition-colors"
                >
                  View All <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
              <div className="p-4">
                <AlertPanel alerts={data.recentAlerts} />
              </div>
            </div>
          </section>
        </div>
      )}
    </PageWrapper>
  )
}
