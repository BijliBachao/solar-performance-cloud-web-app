'use client'
import { useEffect, useState, useCallback } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { AlertPanel } from '@/components/shared/AlertPanel'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PlantOption {
  id: string
  plant_name: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severity, setSeverity] = useState<string>('all')
  const [resolved, setResolved] = useState<string>('false')
  const [plantId, setPlantId] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [plants, setPlants] = useState<PlantOption[]>([])

  // Load plant list for filter
  useEffect(() => {
    fetch('/api/dashboard/main')
      .then(r => r.json())
      .then(data => {
        setPlants((data.plants || []).map((p: any) => ({ id: p.id, plant_name: p.plant_name })))
      })
      .catch(() => {})
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (severity !== 'all') params.set('severity', severity)
      if (resolved !== 'all') params.set('resolved', resolved)
      if (plantId) params.set('plant_id', plantId)
      params.set('page', String(page))
      params.set('limit', '20')

      const res = await fetch(`/api/alerts?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch alerts')
      const data = await res.json()
      setAlerts(data.alerts)
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [severity, resolved, plantId, page])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  async function handleResolve(id: number) {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolve: true }),
      })
      if (!res.ok) throw new Error('Failed to resolve alert')
      fetchAlerts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const severityFilters = ['all', 'CRITICAL', 'WARNING', 'INFO']
  const resolvedFilters = [
    { value: 'false', label: 'Unresolved' },
    { value: 'true', label: 'Resolved' },
    { value: 'all', label: 'All' },
  ]

  return (
    <PageWrapper title="Alerts" loading={false} error={error || undefined}>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Severity pills */}
          <div className="flex gap-1">
            {severityFilters.map((s) => (
              <button
                key={s}
                onClick={() => { setSeverity(s); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-colors',
                  severity === s
                    ? 'bg-[#76b900]/10 text-[#76b900] border border-[#76b900]/30'
                    : 'bg-[#1a1a1a] text-[#898989] hover:text-white'
                )}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>

          {/* Resolved filter */}
          <div className="flex gap-1">
            {resolvedFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => { setResolved(f.value); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-colors',
                  resolved === f.value
                    ? 'bg-[#76b900]/10 text-[#76b900] border border-[#76b900]/30'
                    : 'bg-[#1a1a1a] text-[#898989] hover:text-white'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Plant filter */}
          {plants.length > 1 && (
            <select
              value={plantId}
              onChange={(e) => { setPlantId(e.target.value); setPage(1) }}
              className="text-[10px] font-bold border border-[#333] rounded-sm px-2.5 py-1.5 bg-[#1a1a1a] text-[#a7a7a7] focus:border-[#76b900] outline-none"
            >
              <option value="">All Plants</option>
              {plants.map(p => (
                <option key={p.id} value={p.id}>{p.plant_name}</option>
              ))}
            </select>
          )}

          {/* Result count */}
          <span className="text-[10px] font-bold text-[#5e5e5e] ml-auto uppercase tracking-wider">
            {total} alert{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Alert list */}
        <div className="bg-[#1a1a1a] rounded-sm p-4">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-[#252525] rounded-sm" />
              ))}
            </div>
          ) : (
            <AlertPanel
              alerts={alerts}
              onResolve={resolved === 'false' ? handleResolve : undefined}
            />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold border border-[#333] rounded-sm text-[#a7a7a7] hover:text-white hover:border-[#5e5e5e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="text-[10px] font-bold text-[#5e5e5e]">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold border border-[#333] rounded-sm text-[#a7a7a7] hover:text-white hover:border-[#5e5e5e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
