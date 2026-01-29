'use client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Zap, AlertTriangle, Cpu } from 'lucide-react'

interface PlantCardProps {
  plant: {
    id: string
    plant_name: string
    capacity_kw: number | null
    health_state: number | null
    device_count: number
    alert_count: number
  }
  basePath?: string
}

const healthColors: Record<number, string> = {
  1: 'bg-gray-400',   // disconnected
  2: 'bg-red-500',    // faulty
  3: 'bg-green-500',  // healthy
}

const healthLabels: Record<number, string> = {
  1: 'Disconnected',
  2: 'Faulty',
  3: 'Healthy',
}

export function PlantCard({ plant, basePath = '/dashboard/plants' }: PlantCardProps) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push(`${basePath}/${plant.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-primary-300 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{plant.plant_name}</h3>
          {plant.capacity_kw && (
            <span className="inline-flex items-center mt-1 text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
              {Number(plant.capacity_kw).toFixed(1)} kW
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              healthColors[plant.health_state || 0] || 'bg-gray-300'
            )}
          />
          <span className="text-xs text-gray-500">
            {healthLabels[plant.health_state || 0] || 'Unknown'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <Cpu className="h-4 w-4" />
          <span>{plant.device_count} inverters</span>
        </div>
        {plant.alert_count > 0 && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>{plant.alert_count} alerts</span>
          </div>
        )}
      </div>
    </div>
  )
}
