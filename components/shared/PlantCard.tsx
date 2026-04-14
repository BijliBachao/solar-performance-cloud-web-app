'use client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Cpu, AlertTriangle, ChevronRight } from 'lucide-react'

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

const healthLine: Record<number, string> = {
  1: 'bg-[#898989]',
  2: 'bg-[#e52020]',
  3: 'bg-[#76b900]',
}

const healthLabel: Record<number, { text: string; color: string }> = {
  1: { text: 'OFFLINE', color: 'text-[#898989]' },
  2: { text: 'FAULTY', color: 'text-[#e52020]' },
  3: { text: 'HEALTHY', color: 'text-[#76b900]' },
}

export function PlantCard({ plant, basePath = '/dashboard/plants' }: PlantCardProps) {
  const router = useRouter()
  const hl = healthLine[plant.health_state || 0] || healthLine[1]
  const hlabel = healthLabel[plant.health_state || 0] || healthLabel[1]

  return (
    <div
      onClick={() => router.push(`${basePath}/${plant.id}`)}
      className="bg-[#1a1a1a] rounded-sm overflow-hidden cursor-pointer group hover:ring-1 hover:ring-[#76b900]/50 transition-all"
    >
      <div className={cn('h-[2px]', hl)} />
      <div className="p-5">
        {/* Plant name + health */}
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate group-hover:text-[#76b900] transition-colors">
              {plant.plant_name}
            </h3>
            {plant.capacity_kw && (
              <span className="text-[11px] font-bold text-[#5e5e5e] mt-0.5 block">
                {Number(plant.capacity_kw).toFixed(1)} kW
              </span>
            )}
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-widest', hlabel.color)}>
            {hlabel.text}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-3 border-t border-[#333]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-[#5e5e5e]" />
              <span className="text-[11px] text-[#898989]"><strong className="text-[#a7a7a7]">{plant.device_count}</strong> inv</span>
            </div>
            {plant.alert_count > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-[#e52020]" />
                <span className="text-[11px] font-bold text-[#e52020]">{plant.alert_count}</span>
              </div>
            )}
          </div>
          {plant.provider && (
            <span className="text-[10px] font-bold text-[#5e5e5e] uppercase tracking-wider">
              {plant.provider}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
