'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { PlantDetailView } from '@/components/shared/PlantDetailView'
import { Layers } from 'lucide-react'

export default function AdminPlantDetailPage() {
  const params = useParams()
  const plantCode = params.plantCode as string

  return (
    <>
      {/* Admin-only quick action: configure panel info per string */}
      <div className="px-6 pt-4 -mb-2">
        <Link
          href={`/admin/plants/${plantCode}/strings`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-solar-gold-700 hover:text-solar-gold-800 bg-solar-gold/10 hover:bg-solar-gold/20 border border-solar-gold/30 rounded-sm px-3 py-1.5 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" strokeWidth={2} />
          Configure string panels
        </Link>
      </div>
      <PlantDetailView
        plantCode={plantCode}
        backPath="/admin/plants"
        backLabel="Back"
        showResolveAlerts
      />
    </>
  )
}
