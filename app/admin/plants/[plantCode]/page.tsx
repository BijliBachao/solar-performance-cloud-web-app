'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InverterCard } from '@/components/shared/InverterCard'
import { StringComparisonTable } from '@/components/shared/StringComparisonTable'
import { StringBarChart } from '@/components/shared/StringBarChart'
import { StringTrendChart } from '@/components/shared/StringTrendChart'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { ArrowLeft } from 'lucide-react'

export default function AdminPlantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const plantCode = params.plantCode as string
  const [plant, setPlant] = useState<any>(null)
  const [stringData, setStringData] = useState<any>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [history, setHistory] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [plantRes, stringsRes, alertsRes, historyRes] = await Promise.all([
          fetch(`/api/plants/${plantCode}`),
          fetch(`/api/plants/${plantCode}/strings`),
          fetch(`/api/alerts?plant_id=${plantCode}&resolved=false`),
          fetch(`/api/plants/${plantCode}/history?period=hourly`),
        ])
        if (plantRes.ok) setPlant(await plantRes.json())
        if (stringsRes.ok) setStringData(await stringsRes.json())
        if (alertsRes.ok) { const data = await alertsRes.json(); setAlerts(data.alerts || []) }
        if (historyRes.ok) setHistory(await historyRes.json())
      } catch { /* handle */ } finally { setLoading(false) }
    }
    fetchAll()
  }, [plantCode])

  const healthLabel = plant?.health_state === 3 ? 'Healthy' : plant?.health_state === 2 ? 'Faulty' : 'Disconnected'
  const allStrings = stringData?.devices?.flatMap((d: any) => d.strings) || []

  return (
    <PageWrapper title={plant?.plant_name || 'Plant Detail'} loading={loading}
      action={<Button variant="outline" onClick={() => router.push('/admin/plants')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>}>
      {plant && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant={plant.health_state === 3 ? 'success' : 'destructive'}>{healthLabel}</Badge>
              {plant.capacity_kw && (<span className="text-sm text-gray-600">Capacity: {Number(plant.capacity_kw).toFixed(1)} kW</span>)}
              {plant.address && (<span className="text-sm text-gray-500">{plant.address}</span>)}
            </div>
          </div>

          {plant.devices && plant.devices.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Inverters</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plant.devices.map((device: any) => {
                  const deviceStrings = stringData?.devices?.find((d: any) => d.device_id === device.id)?.strings || []
                  const summary = { ok: deviceStrings.filter((s: any) => s.status === 'OK').length, warning: deviceStrings.filter((s: any) => s.status === 'WARNING').length, critical: deviceStrings.filter((s: any) => s.status === 'CRITICAL').length }
                  return <InverterCard key={device.id} device={{ ...device, string_summary: summary }} />
                })}
              </div>
            </div>
          )}

          {allStrings.length > 0 && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">String Comparison</h3>
                <StringComparisonTable strings={allStrings} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Current Distribution</h3>
                <StringBarChart strings={allStrings} />
              </div>
            </>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Active Alerts</h3>
            <AlertPanel alerts={alerts} />
          </div>

          {history?.data && history.data.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">String Trend (Last 24h)</h3>
              <StringTrendChart data={history.data.map((d: any) => ({ timestamp: d.hour || d.date, strings: [{ string_number: d.string_number, current: Number(d.avg_current) }] }))} />
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  )
}
