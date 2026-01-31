'use client'

import { useParams } from 'next/navigation'
import { PlantDetailView } from '@/components/shared/PlantDetailView'

export default function AdminPlantDetailPage() {
  const params = useParams()
  const plantCode = params.plantCode as string

  return (
    <PlantDetailView
      plantCode={plantCode}
      backPath="/admin/plants"
      backLabel="Back"
      showResolveAlerts
    />
  )
}
