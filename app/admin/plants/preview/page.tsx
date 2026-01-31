'use client'

import { PlantHeader } from '@/components/shared/PlantHeader'
import { InverterDetailSection } from '@/components/shared/InverterDetailSection'
import { useState } from 'react'

// ─── Dummy Inverters ────────────────────────────────────────────

const INV1 = {
  id: 'INV-001',
  device_name: 'INV-6T2569034561',
  model: 'SUN2000-33KTL-A',
  max_strings: 14,
}

const INV2 = {
  id: 'INV-002',
  device_name: 'INV-6T2569045264',
  model: 'SUN2000-33KTL-A',
  max_strings: 12,
}

// ─── Dummy String Data ──────────────────────────────────────────

const STRINGS_INV1 = [
  { string_number: 1, voltage: 540.2, current: 11.8, power: 6374.4, gap_percent: 1.2, status: 'OK' as const },
  { string_number: 2, voltage: 538.6, current: 12.1, power: 6517.1, gap_percent: 0.5, status: 'OK' as const },
  { string_number: 3, voltage: 535.1, current: 6.2, power: 3317.6, gap_percent: 48.1, status: 'CRITICAL' as const },
  { string_number: 4, voltage: 541.0, current: 12.0, power: 6492.0, gap_percent: 0.8, status: 'OK' as const },
  { string_number: 5, voltage: 539.5, current: 11.9, power: 6420.1, gap_percent: 1.5, status: 'OK' as const },
  { string_number: 6, voltage: 537.8, current: 9.4, power: 5055.3, gap_percent: 21.3, status: 'OK' as const },
  { string_number: 7, voltage: 540.1, current: 11.7, power: 6319.2, gap_percent: 2.1, status: 'OK' as const },
  { string_number: 8, voltage: 536.9, current: 8.1, power: 4348.9, gap_percent: 32.2, status: 'WARNING' as const },
  { string_number: 9, voltage: 541.3, current: 12.2, power: 6603.9, gap_percent: 0.2, status: 'OK' as const },
  { string_number: 10, voltage: 538.4, current: 11.6, power: 6245.4, gap_percent: 2.8, status: 'OK' as const },
  { string_number: 11, voltage: 539.7, current: 12.0, power: 6476.4, gap_percent: 0.8, status: 'OK' as const },
  { string_number: 12, voltage: 540.5, current: 11.5, power: 6215.8, gap_percent: 3.6, status: 'OK' as const },
  { string_number: 13, voltage: 539.0, current: 0, power: 0, gap_percent: 0, status: 'OFFLINE' as const },
  { string_number: 14, voltage: 540.2, current: 0, power: 0, gap_percent: 0, status: 'OFFLINE' as const },
]

const STRINGS_INV2 = [
  { string_number: 1, voltage: 542.0, current: 10.8, power: 5853.6, gap_percent: 2.1, status: 'OK' as const },
  { string_number: 2, voltage: 540.5, current: 11.0, power: 5945.5, gap_percent: 0.4, status: 'OK' as const },
  { string_number: 3, voltage: 539.2, current: 10.9, power: 5877.3, gap_percent: 1.3, status: 'OK' as const },
  { string_number: 4, voltage: 541.8, current: 7.8, power: 4226.0, gap_percent: 29.4, status: 'WARNING' as const },
  { string_number: 5, voltage: 538.0, current: 11.2, power: 6025.6, gap_percent: 0.7, status: 'OK' as const },
  { string_number: 6, voltage: 540.3, current: 10.7, power: 5781.2, gap_percent: 3.1, status: 'OK' as const },
  { string_number: 7, voltage: 537.9, current: 3.1, power: 1667.5, gap_percent: 71.9, status: 'CRITICAL' as const },
  { string_number: 8, voltage: 541.5, current: 11.1, power: 6010.7, gap_percent: 0.5, status: 'OK' as const },
  { string_number: 9, voltage: 539.8, current: 10.6, power: 5721.9, gap_percent: 4.0, status: 'OK' as const },
  { string_number: 10, voltage: 540.0, current: 11.0, power: 5940.0, gap_percent: 0.4, status: 'OK' as const },
  { string_number: 11, voltage: 538.5, current: 0, power: 0, gap_percent: 0, status: 'OFFLINE' as const },
  { string_number: 12, voltage: 539.1, current: 0, power: 0, gap_percent: 0, status: 'OFFLINE' as const },
]

// ─── Dummy Alerts ───────────────────────────────────────────────

const ALERTS_INV1 = [
  { id: 1, device_id: 'INV-001', severity: 'CRITICAL', message: 'String 3 is 48.1% below average', device_name: 'INV-6T2569034561', string_number: 3, created_at: new Date(Date.now() - 25 * 60000).toISOString(), gap_percent: 48.1 },
  { id: 2, device_id: 'INV-001', severity: 'WARNING', message: 'String 8 is 32.2% below average', device_name: 'INV-6T2569034561', string_number: 8, created_at: new Date(Date.now() - 45 * 60000).toISOString(), gap_percent: 32.2 },
]

const ALERTS_INV2 = [
  { id: 3, device_id: 'INV-002', severity: 'CRITICAL', message: 'String 7 is 71.9% below average', device_name: 'INV-6T2569045264', string_number: 7, created_at: new Date(Date.now() - 10 * 60000).toISOString(), gap_percent: 71.9 },
  { id: 4, device_id: 'INV-002', severity: 'WARNING', message: 'String 4 is 29.4% below average', device_name: 'INV-6T2569045264', string_number: 4, created_at: new Date(Date.now() - 90 * 60000).toISOString(), gap_percent: 29.4 },
]

// ─── Dummy Trend Data (24h hourly) ──────────────────────────────

function generateTrendData(
  stringNumbers: number[],
  baseCurrent: number,
  issues: Record<number, { dropAt: number; dropTo: number }>
) {
  const now = new Date()
  const points = []

  for (let h = 23; h >= 0; h--) {
    const time = new Date(now.getTime() - h * 60 * 60 * 1000)
    const hour = time.getHours()

    // Solar curve: 0 at night, peak at noon
    let solarFactor = 0
    if (hour >= 6 && hour <= 18) {
      solarFactor = Math.sin(((hour - 6) / 12) * Math.PI)
    }

    const strings = stringNumbers.map((sn) => {
      let current = baseCurrent * solarFactor
      // Add some noise
      current += (Math.random() - 0.5) * 0.4

      // Apply issue drops
      const issue = issues[sn]
      if (issue && h <= issue.dropAt) {
        current *= issue.dropTo
      }

      return {
        string_number: sn,
        current: Math.max(0, Number(current.toFixed(2))),
      }
    })

    points.push({
      timestamp: time.toISOString(),
      strings,
    })
  }

  return points
}

const TREND_INV1 = generateTrendData(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  12.0,
  {
    3: { dropAt: 14, dropTo: 0.52 },  // PV3 dropped ~48%
    8: { dropAt: 18, dropTo: 0.68 },  // PV8 dropped ~32%
  }
)

const TREND_INV2 = generateTrendData(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  11.0,
  {
    7: { dropAt: 20, dropTo: 0.28 },  // PV7 dropped ~72%
    4: { dropAt: 16, dropTo: 0.71 },  // PV4 dropped ~29%
  }
)

// ─── Page ───────────────────────────────────────────────────────

export default function PlantPreviewPage() {
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [alerts, setAlerts] = useState([...ALERTS_INV1, ...ALERTS_INV2])

  const allStrings = [...STRINGS_INV1, ...STRINGS_INV2]
  const liveStrings = allStrings.filter(s => s.status !== 'OFFLINE')
  const stringSummary = {
    total: liveStrings.length,
    ok: allStrings.filter(s => s.status === 'OK').length,
    warning: allStrings.filter(s => s.status === 'WARNING').length,
    critical: allStrings.filter(s => s.status === 'CRITICAL').length,
  }

  const handleResolve = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PlantHeader
        plantName="Gulberg 5t"
        healthState={3}
        capacityKw={49.66}
        address="Block A1 Gulberg III, Lahore, Punjab 54660"
        deviceCount={2}
        lastSynced={new Date(Date.now() - 3 * 60000).toISOString()}
        stringSummary={stringSummary}
        backPath="/admin/plants"
        backLabel="Back"
        autoRefresh={autoRefresh}
        isRefreshing={false}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onRefresh={() => {}}
      />

      <div className="px-4 sm:px-6 py-5 space-y-5 max-w-[1400px] mx-auto">
        {/* Inverter 1 */}
        <InverterDetailSection
          device={INV1}
          strings={STRINGS_INV1}
          alerts={alerts.filter(a => a.device_id === 'INV-001')}
          plantCode="PREVIEW"
          showResolveAlerts
          onResolveAlert={handleResolve}
          dummyTrendData={TREND_INV1}
          colorIndex={0}
        />

        {/* Inverter 2 */}
        <InverterDetailSection
          device={INV2}
          strings={STRINGS_INV2}
          alerts={alerts.filter(a => a.device_id === 'INV-002')}
          plantCode="PREVIEW"
          showResolveAlerts
          onResolveAlert={handleResolve}
          dummyTrendData={TREND_INV2}
          colorIndex={1}
        />
      </div>
    </div>
  )
}
