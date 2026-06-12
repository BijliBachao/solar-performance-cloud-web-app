'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { PlantDetailView } from '@/components/shared/PlantDetailView'
import { PlantTypeControl } from '@/components/shared/PlantTypeControl'
import { Layers } from 'lucide-react'

export default function AdminPlantDetailPage() {
  const params = useParams()
  const plantCode = params.plantCode as string

  return (
    <>
      {/* Admin-only header controls: per-string panel config + plant type */}
      <div className="px-6 pt-4 -mb-2 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/admin/plants/${plantCode}/strings`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-solar-gold-700 hover:text-solar-gold-800 bg-solar-gold/10 hover:bg-solar-gold/20 border border-solar-gold/30 rounded-sm px-3 py-1.5 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" strokeWidth={2} />
          Configure string panels
        </Link>
        <PlantTypeControl plantCode={plantCode} />
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
