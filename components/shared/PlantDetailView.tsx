'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlantHeader } from '@/components/shared/PlantHeader'
import { InverterDetailSection } from '@/components/shared/InverterDetailSection'
import {
  Loader2, AlertTriangle, RefreshCw, ArrowLeft, Activity,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

interface PlantData {
  id: string
  plant_name: string
  capacity_kw: number | null
  address: string | null
  health_state: number | null
  last_synced: string | null
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
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE'
}

interface DeviceStrings {
  device_id: string
  device_name: string | null
  strings: StringInfo[]
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
  const liveStrings = allStrings.filter(s => s.status !== 'OFFLINE')
  const stringSummary = {
    total: liveStrings.length,
    ok: allStrings.filter(s => s.status === 'OK').length,
    warning: allStrings.filter(s => s.status === 'WARNING').length,
    critical: allStrings.filter(s => s.status === 'CRITICAL').length,
  }

  // ─── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
          <p className="text-xs text-gray-400 mt-2">Loading plant data...</p>
        </div>
      </div>
    )
  }

  // ─── Error State ───────────────────────────────────────────

  if (error || !plant) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
          <p className="text-red-500 mb-4 text-sm">{error || 'Plant not found'}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => router.push(backPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchPlantData()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <PlantHeader
        plantName={plant.plant_name}
        healthState={plant.health_state}
        capacityKw={plant.capacity_kw}
        address={plant.address}
        deviceCount={plant.devices.length}
        lastSynced={plant.last_synced}
        stringSummary={stringSummary}
        backPath={backPath}
        backLabel={backLabel}
        autoRefresh={autoRefresh}
        isRefreshing={isRefreshing}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onRefresh={handleRefresh}
      />

      <div className="px-4 sm:px-6 py-5 space-y-5 max-w-[1400px] mx-auto">
        {/* Per-Inverter Sections */}
        {plant.devices.map((device, index) => {
          const deviceStrings = stringData.find(d => d.device_id === device.id)?.strings || []
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
            />
          )
        })}

        {/* Empty state if no inverters */}
        {plant.devices.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Activity className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No inverters found for this plant.</p>
            <p className="text-xs text-gray-400 mt-1">Devices will appear once the poller syncs from SmartPVMS.</p>
          </div>
        )}
      </div>
    </div>
  )
}
