'use client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Cpu, AlertTriangle } from 'lucide-react'

interface PlantCardProps {
  plant: {
    id: string
    plant_name: string
    capacity_kw: number | null
    health_state: number | null
    device_count: number
    alert_count: number
    provider?: string
  }
  basePath?: string
}

const providerBadge: Record<string, { label: string; className: string }> = {
  huawei: { label: 'Huawei', className: 'bg-red-50 text-red-700 border-red-200' },
  solis: { label: 'Solis', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  growatt: { label: 'Growatt', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  sungrow: { label: 'Sungrow', className: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const healthConfig: Record<number, { color: string; bg: string; label: string }> = {
  1: { color: 'text-[#898989]', bg: 'bg-gray-100 border-gray-200', label: 'Disconnected' },
  2: { color: 'text-[#e52020]', bg: 'bg-red-50 border-red-200', label: 'Faulty' },
  3: { color: 'text-[#5a8f00]', bg: 'bg-[#e8f5d0] border-[#76b900]/30', label: 'Healthy' },
}

export function PlantCard({ plant, basePath = '/dashboard/plants' }: PlantCardProps) {
  const router = useRouter()
  const health = healthConfig[plant.health_state || 0] || healthConfig[1]

  return (
    <div
      onClick={() => router.push(`${basePath}/${plant.id}`)}
      className="bg-white rounded border border-[#e5e5e5] p-4 hover:border-[#76b900] transition-colors cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#0a0a0a] truncate group-hover:text-[#76b900] transition-colors">
            {plant.plant_name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {plant.provider && providerBadge[plant.provider] && (
              <span className={cn(
                'inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border',
                providerBadge[plant.provider].className
              )}>
                {providerBadge[plant.provider].label}
              </span>
            )}
            {plant.capacity_kw && (
              <span className="text-xs font-semibold text-[#525252]">
                {Number(plant.capacity_kw).toFixed(1)} kW
              </span>
            )}
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-sm border',
          health.bg, health.color
        )}>
          {health.label}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 pt-3 border-t border-[#f0f0f0]">
        <div className="flex items-center gap-1.5 text-xs text-[#898989]">
          <Cpu className="h-3.5 w-3.5" />
          <span className="font-semibold text-[#525252]">{plant.device_count}</span> inverters
        </div>
        {plant.alert_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-[#e52020]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-semibold">{plant.alert_count}</span> alerts
          </div>
        )}
      </div>
    </div>
  )
}
