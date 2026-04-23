'use client'
import { useEffect, useState } from 'react'
import { HEALTH_HEALTHY, HEALTH_WARNING } from '@/lib/string-health'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { KpiCard } from '@/components/shared/KpiCard'
import { PlantCard } from '@/components/shared/PlantCard'
import { HeroCard } from '@/components/shared/HeroCard'
import { AlertsInsightPanel } from '@/components/shared/AlertsInsightPanel'
import { Zap, AlertTriangle, Activity, Cpu, Sun } from 'lucide-react'

interface PlantItem {
  id: string
  plant_name: string
  capacity_kw: number | null
  health_state: number | null
  provider?: string
  device_count: number
  alert_count: number
  isLive?: boolean
  liveStatus?: 'PRODUCING' | 'IDLE' | 'OFFLINE'
  currentPowerKw?: number
  todayEnergyKwh?: number
  healthPercent?: number | null
  productionBars?: number[]
}

interface DashboardData {
  plants: PlantItem[]
  stats: { totalPlants: number; activeAlerts: number; avgStringHealth: number | null; lastUpdate: string | null }
  recentAlerts: any[]
  hero: {
    livePowerKw: number
    livePowerDeltaPercent: number | null
    livePowerDeltaContext: string | null
    fleetCapacityKw: number
    totalPlantCount: number
    healthyPlantCount: number
    producingPlantCount: number
    sparkline: number[]
  }
  kpis: {
    energyToday: { value: number; unit: string; sparkline: number[]; deltaPercent: number | null; deltaContext: string | null }
    alerts: { total: number; critical: number; warning: number; info: number }
    fleetHealth: { percent: number | null; sparkline: (number | null)[]; deltaPercent: number | null; deltaContext: string | null; coverageNote: string | null }
    invertersOnline: { online: number; total: number }
  }
  alertsInsight: {
    topIssues: Array<{ plant_id: string; plant_name: string; alertCount: number }>
    recentActivity: Array<{
      id: number
      severity: string
      plant_id: string
      plant_name: string
      string_number: number
      timestamp: string
      type: 'created' | 'resolved'
    }>
  }
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`
  return `${kwh.toFixed(1)} kWh`
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch('/api/dashboard/main', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      setData(await res.json())
      if (!silent) setError(null)
    } catch (err: any) {
      if (!silent) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 5 minutes — matches our data poll cadence
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <PageWrapper title="Overview" loading={loading} error={error || undefined}>
      {data && (
        <div className="space-y-6">
          {/* HERO — Live fleet power */}
          <HeroCard
            livePowerKw={data.hero?.livePowerKw ?? 0}
            capacityKw={data.hero?.fleetCapacityKw ?? 0}
            sparkline={data.hero?.sparkline ?? []}
            deltaPercent={data.hero?.livePowerDeltaPercent ?? null}
            deltaContext={data.hero?.livePowerDeltaContext ?? null}
            totalPlants={data.hero?.totalPlantCount ?? 0}
            healthyPlants={data.hero?.healthyPlantCount ?? 0}
            producingPlants={data.hero?.producingPlantCount ?? 0}
            isLive={(data.hero?.producingPlantCount ?? 0) > 0}
          />

          {/* 4 KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Energy Today"
              value={formatEnergy(data.kpis?.energyToday?.value ?? 0)}
              icon={Zap}
              accent="gold"
              subtitle="Energy produced today"
              sparkline={data.kpis?.energyToday?.sparkline}
              deltaPercent={data.kpis?.energyToday?.deltaPercent ?? null}
              deltaContext={data.kpis?.energyToday?.deltaContext ?? null}
            />
            <KpiCard
              title="Active Alerts"
              value={data.kpis?.alerts?.total ?? 0}
              icon={AlertTriangle}
              accent={(data.kpis?.alerts?.total ?? 0) > 0 ? 'red' : 'green'}
              subtitle={
                (data.kpis?.alerts?.total ?? 0) === 0
                  ? 'All clear'
                  : `${data.kpis?.alerts?.critical ?? 0} critical · ${data.kpis?.alerts?.warning ?? 0} warning`
              }
            />
            <KpiCard
              title="Overall Health"
              value={
                data.kpis?.fleetHealth?.percent !== null &&
                data.kpis?.fleetHealth?.percent !== undefined
                  ? `${data.kpis.fleetHealth.percent.toFixed(1)}%`
                  : '—'
              }
              icon={Activity}
              accent={(() => {
                const p = data.kpis?.fleetHealth?.percent
                if (p === null || p === undefined) return 'gray'
                return p >= HEALTH_HEALTHY ? 'green' : p >= HEALTH_WARNING ? 'amber' : 'red'
              })()}
              subtitle={
                data.kpis?.fleetHealth?.coverageNote
                  ? data.kpis.fleetHealth.coverageNote
                  : data.kpis?.fleetHealth?.percent !== null &&
                    data.kpis?.fleetHealth?.percent !== undefined
                  ? 'Average health across all strings'
                  : 'No daily scores yet today'
              }
              sparkline={data.kpis?.fleetHealth?.sparkline}
              deltaPercent={data.kpis?.fleetHealth?.deltaPercent ?? null}
              deltaContext={data.kpis?.fleetHealth?.deltaContext ?? null}
            />
            <KpiCard
              title="Inverters Online"
              value={`${data.kpis?.invertersOnline?.online ?? 0}/${data.kpis?.invertersOnline?.total ?? 0}`}
              icon={Cpu}
              accent="blue"
              subtitle="Reporting in last 30 min"
            />
          </div>

          {/* Two-column: plants + alerts insight */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Plants — 2 cols */}
            <section className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.plants.map((plant) => (
                  <PlantCard key={plant.id} plant={plant} />
                ))}
                {data.plants.length === 0 && (
                  <div className="col-span-full bg-white rounded-md border border-slate-200 text-center py-16 px-4">
                    <Sun className="h-12 w-12 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
                    <p className="text-sm font-bold text-slate-600">No plants assigned</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Contact your administrator for access.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Alerts insight — 1 col */}
            <aside>
              <AlertsInsightPanel
                totals={{
                  critical: data.kpis?.alerts?.critical ?? 0,
                  warning: data.kpis?.alerts?.warning ?? 0,
                  info: data.kpis?.alerts?.info ?? 0,
                  total: data.kpis?.alerts?.total ?? 0,
                }}
                topIssues={data.alertsInsight?.topIssues ?? []}
                recentActivity={data.alertsInsight?.recentActivity ?? []}
              />
            </aside>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
