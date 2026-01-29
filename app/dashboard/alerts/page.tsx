'use client'
import { useEffect, useState, useCallback } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertPanel } from '@/components/shared/AlertPanel'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [severity, setSeverity] = useState<string>('all')
  const [resolved, setResolved] = useState<string>('false')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (severity !== 'all') params.set('severity', severity)
      params.set('resolved', resolved)
      params.set('page', String(page))
      params.set('limit', '20')
      const res = await fetch(`/api/alerts?${params.toString()}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAlerts(data.alerts)
      setTotalPages(data.pagination.totalPages)
    } catch { /* handle */ } finally { setLoading(false) }
  }, [severity, resolved, page])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  async function handleResolve(id: number) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolve: true }) })
    fetchAlerts()
  }

  return (
    <PageWrapper title="Alerts" loading={loading}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            {['all', 'CRITICAL', 'WARNING', 'INFO'].map((s) => (
              <button key={s} onClick={() => { setSeverity(s); setPage(1) }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${severity === s ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
          <Select value={resolved} onValueChange={(v) => { setResolved(v); setPage(1) }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Unresolved</SelectItem>
              <SelectItem value="true">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <AlertPanel alerts={alerts} onResolve={resolved === 'false' ? handleResolve : undefined} />
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
