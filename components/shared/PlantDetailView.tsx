'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  type StringStatus,
  STANDBY_POWER_FLOOR_KW,
  classifyPlantLive,
  HEALTH_HEALTHY,
  HEALTH_WARNING,
} from '@/lib/string-health'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PlantHeader } from '@/components/shared/PlantHeader'
import { InverterDetailSection } from '@/components/shared/InverterDetailSection'
import { AlertHistoryLog } from '@/components/shared/AlertHistoryLog'
import {
  AlertTriangle, RefreshCw, ArrowLeft, Activity, ClipboardList,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

interface PlantData {
  id: string
  plant_name: string
  capacity_kw: number | null
  address: string | null
  health_state: number | null
  provider?: string
  last_synced: string | null
  last_data_at: string | null
  devices: Array<{
    id: string
    device_name: string | null
    device_type_id: number
    model: string | null
    max_strings: number | null
    last_synced: string | null
  }>
}

interface StringInfo {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: StringStatus
  energy_kwh?: number
}

interface DeviceStrings {
  device_id: string
  device_name: string | null
  strings: StringInfo[]
  active_avg_current?: number
}

interface AlertData {
  id: number
  device_id?: string
  severity: string
  message: string
  device_name?: string
  string_number: number
  created_at: string
  gap_percent?: number | null
}

interface PlantDetailViewProps {
  plantCode: string
  backPath: string
  backLabel?: string
  showResolveAlerts?: boolean
}

// ─── Component ──────────────────────────────────────────────────

export function PlantDetailView({
  plantCode,
  backPath,
  backLabel = 'Back',
  showResolveAlerts = false,
}: PlantDetailViewProps) {
  const router = useRouter()

  // Data state
  const [plant, setPlant] = useState<PlantData | null>(null)
  const [stringData, setStringData] = useState<DeviceStrings[]>([])
  const [alerts, setAlerts] = useState<AlertData[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const autoRefreshRef = useRef(autoRefresh)
  autoRefreshRef.current = autoRefresh

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchPlantData = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null) }
      else setIsRefreshing(true)

      const [plantRes, stringsRes, alertsRes] = await Promise.all([
        fetch(`/api/plants/${plantCode}`, { credentials: 'include' }),
        fetch(`/api/plants/${plantCode}/strings`, { credentials: 'include' }),
        fetch(`/api/alerts?plant_id=${plantCode}&resolved=false`, { credentials: 'include' }),
      ])

      if (!plantRes.ok) throw new Error('Failed to load plant data')
      setPlant(await plantRes.json())

      if (stringsRes.ok) {
        const sd = await stringsRes.json()
        setStringData(sd.devices || [])
      }
      if (alertsRes.ok) {
        const ad = await alertsRes.json()
        setAlerts(ad.alerts || [])
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [plantCode])

  // ─── Effects ────────────────────────────────────────────────

  useEffect(() => { fetchPlantData() }, [fetchPlantData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (autoRefreshRef.current) fetchPlantData(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchPlantData])

  // ─── Handlers ───────────────────────────────────────────────

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    await fetchPlantData(true)
    setIsRefreshing(false)
  }

  const handleResolveAlert = async (id: number) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolve: true }),
        credentials: 'include',
      })
      if (res.ok) setAlerts(prev => prev.filter(a => a.id !== id))
    } catch { /* silent */ }
  }

  // ─── Derived Data (plant-level summary) ────────────────────

  const allStrings = stringData.flatMap(d => d.strings)
  const liveStrings = allStrings.filter(s => s.status !== 'OPEN_CIRCUIT' && s.status !== 'DISCONNECTED')
  const stringSummary = {
    total: liveStrings.length,
    ok: allStrings.filter(s => s.status === 'NORMAL').length,
    warning: allStrings.filter(s => s.status === 'WARNING').length,
    critical: allStrings.filter(s => s.status === 'CRITICAL').length,
  }

  // ─── Plant-level KPIs (computed from live string data) ─────
  // Live power: sum of string power (in W) → kW, then apply standby floor
  // to avoid treating inverter standby noise as production.
  const rawLivePowerKw =
    allStrings.reduce((sum, s) => sum + (Number(s.power) || 0), 0) / 1000
  const isReporting = allStrings.length > 0 && rawLivePowerKw >= 0
  const liveStatus = classifyPlantLive(isReporting, rawLivePowerKw)
  const displayPowerKw =
    liveStatus === 'PRODUCING' ? Math.round(rawLivePowerKw * 10) / 10 : 0

  // Today's energy: sum of per-string energy_kwh where present
  const todayEnergyKwh = allStrings.reduce(
    (sum, s) => sum + (Number(s.energy_kwh) || 0),
    0,
  )

  // Utilization: live power vs nameplate capacity
  const capacityKw = Number(plant?.capacity_kw) || 0
  const utilizationPct =
    capacityKw > 0 && liveStatus === 'PRODUCING'
      ? Math.round((rawLivePowerKw / capacityKw) * 100)
      : null

  // Healthy % across ALL strings reported (normal / total)
  const healthPct =
    allStrings.length > 0
      ? Math.round((stringSummary.ok / allStrings.length) * 100)
      : null

  const alertCount = alerts.length

  // ─── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-solar-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400 mt-2">Loading plant data...</p>
        </div>
      </div>
    )
  }

  // ─── Error State ───────────────────────────────────────────

  if (error || !plant) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-3" strokeWidth={2} />
          <p className="text-red-700 mb-4 text-sm font-semibold">{error || 'Plant not found'}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => router.push(backPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" strokeWidth={2} /> {backLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchPlantData()}>
              <RefreshCw className="h-4 w-4 mr-1" strokeWidth={2} /> Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <PlantHeader
        plantName={plant.plant_name}
        healthState={plant.health_state}
        capacityKw={plant.capacity_kw}
        address={plant.address}
        deviceCount={plant.devices.length}
        lastSynced={plant.last_synced}
        lastDataAt={plant.last_data_at}
        provider={plant.provider}
        stringSummary={stringSummary}
        backPath={backPath}
        backLabel={backLabel}
        autoRefresh={autoRefresh}
        isRefreshing={isRefreshing}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onRefresh={handleRefresh}
        liveStatus={liveStatus}
        currentPowerKw={displayPowerKw}
        todayEnergyKwh={todayEnergyKwh}
        utilizationPct={utilizationPct}
        healthPct={healthPct}
        alertCount={alertCount}
        totalStringCount={allStrings.length}
      />

      <div className="px-4 sm:px-6 py-5 max-w-[1440px] mx-auto">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-5">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Activity className="w-4 h-4" strokeWidth={2} />
              Overview
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" strokeWidth={2} />
              Alert History
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-5">
            {/* Per-Inverter Sections */}
            {plant.devices.map((device, index) => {
              const deviceData = stringData.find(d => d.device_id === device.id)
              const deviceStrings = deviceData?.strings || []
              const deviceAvgCurrent = deviceData?.active_avg_current
              const deviceAlerts = alerts
                .filter(a => a.device_id === device.id)
                .map(a => ({ ...a, device_name: device.device_name || device.id }))

              return (
                <InverterDetailSection
                  key={device.id}
                  device={device}
                  strings={deviceStrings}
                  alerts={deviceAlerts}
                  plantCode={plantCode}
                  showResolveAlerts={showResolveAlerts}
                  onResolveAlert={handleResolveAlert}
                  colorIndex={index}
                  apiAvgCurrent={deviceAvgCurrent}
                />
              )
            })}

            {/* Empty state if no inverters */}
            {plant.devices.length === 0 && (
              <div className="bg-white rounded-sm border border-slate-200 p-8 text-center">
                <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" strokeWidth={2} />
                <p className="text-sm font-bold text-slate-600">No inverters found</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Devices will appear once the poller syncs from your inverter provider.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Alert History Tab */}
          <TabsContent value="history">
            <div className="bg-white rounded-sm border border-slate-200 p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4">Alert History</h2>
              <AlertHistoryLog
                plantId={plantCode}
                showResolveButton={showResolveAlerts}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
