'use client'

/**
 * Customer Alerts — /dashboard/alerts
 *
 * ONE unified, tenant-scoped notification feed merging our computed
 * string-health `alerts` (System) with the inverters' own `vendor_alarms`
 * (Vendor). Uses the SAME shared AlertsFeed component as the admin surface,
 * fed by /api/dashboard/alerts-feed (which scopes to the caller org's plants).
 *
 * Filter bar (Kind · Provider · Severity · Open/Resolved · search), paginated,
 * auto-refreshes every 60s. Read-only: resolve is an admin action and is not
 * exposed here. Row click → the plant detail page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Search, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { AlertsFeed, type FeedItem } from '@/components/shared/AlertsFeed'
import { VALID_SEVERITIES, VALID_PROVIDERS } from '@/lib/api-validation'

interface AlertsFeedResponse {
  items: FeedItem[]
  total: number
  page: number
  pageSize: number
  capped?: boolean
}

type Kind = 'all' | 'system' | 'vendor'
type Resolved = 'false' | 'true'

const REFRESH_MS = 60_000
const PAGE_SIZE = 50

// CSI alarms are ingested too — list it alongside the shared provider vocab
// (VALID_PROVIDERS omits csi today). 'all' = no provider filter. The feed
// itself is provider-agnostic; this list only seeds the dropdown.
const PROVIDER_OPTIONS = [...VALID_PROVIDERS, 'csi'] as const

export default function CustomerAlertsPage() {
  const router = useRouter()

  const [kind, setKind] = useState<Kind>('all')
  const [provider, setProvider] = useState<string>('')
  const [severity, setSeverity] = useState<string>('')
  const [resolved, setResolved] = useState<Resolved>('false')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AlertsFeedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Debounce the search box into the real filter (resets to page 1).
  useEffect(() => {
    const t = setTimeout(() => {
      setQ((prev) => (prev === qInput.trim() ? prev : qInput.trim()))
    }, 350)
    return () => clearTimeout(t)
  }, [qInput])

  // Any filter change returns to page 1.
  useEffect(() => {
    setPage(1)
  }, [kind, provider, severity, resolved, q])

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (kind !== 'all') params.set('kind', kind)
    if (provider) params.set('provider', provider)
    if (severity) params.set('severity', severity)
    params.set('resolved', resolved)
    if (q) params.set('q', q)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return `/api/dashboard/alerts-feed?${params.toString()}`
  }, [kind, provider, severity, resolved, q, page])

  // Keep the latest URL in a ref so the 60s interval always polls current filters.
  const apiUrlRef = useRef(apiUrl)
  apiUrlRef.current = apiUrl

  const load = useCallback(async (url: string, isBackground: boolean) => {
    if (isBackground) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Fetch on filter/page change.
  useEffect(() => {
    load(apiUrl, false)
  }, [apiUrl, load])

  // Auto-refresh every 60s in the background.
  useEffect(() => {
    const t = setInterval(() => load(apiUrlRef.current, true), REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const onRowClick = useCallback(
    (item: FeedItem) => {
      router.push(`/dashboard/plants/${encodeURIComponent(item.plant_id)}`)
    },
    [router],
  )

  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? PAGE_SIZE
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <PageWrapper
      title="Alerts"
      action={
        <button
          type="button"
          onClick={() => load(apiUrl, true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} /> Refresh
        </button>
      }
    >
      <div className="space-y-4">
        {/* Intro */}
        <div className="flex items-center gap-2 text-slate-500">
          <Bell className="w-4 h-4 text-solar-gold-600" strokeWidth={2} />
          <p className="text-[12px]">
            Unified feed of system alerts (our string-health checks) and vendor alarms
            (your inverters' own faults). Auto-refreshes every 60s.
          </p>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-card px-4 py-3 flex items-center gap-2 flex-wrap">
          {/* Kind segmented toggle */}
          <div role="group" aria-label="Source kind" className="inline-flex border border-slate-300 rounded-sm overflow-hidden">
            {(['all', 'system', 'vendor'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-colors focus:outline-none',
                  kind === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {k === 'all' ? 'All' : k}
              </button>
            ))}
          </div>

          {/* Provider */}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="Filter by provider"
            className="text-xs font-semibold text-slate-700 border border-slate-300 rounded-sm px-2 py-1.5 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-solar-gold/30"
          >
            <option value="">All providers</option>
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>

          {/* Severity */}
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Filter by severity"
            className="text-xs font-semibold text-slate-700 border border-slate-300 rounded-sm px-2 py-1.5 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-solar-gold/30"
          >
            <option value="">All severities</option>
            {VALID_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Open / Resolved toggle */}
          <div role="group" aria-label="Resolution state" className="inline-flex border border-slate-300 rounded-sm overflow-hidden">
            {([
              { value: 'false', label: 'Open' },
              { value: 'true', label: 'Resolved' },
            ] as Array<{ value: Resolved; label: string }>).map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={resolved === o.value}
                onClick={() => setResolved(o.value)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus:outline-none',
                  resolved === o.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Plant / inverter…"
              aria-label="Search by plant or inverter"
              className="text-xs text-slate-800 border border-slate-300 rounded-sm pl-8 pr-2 py-1.5 bg-white w-[190px] placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-solar-gold/30"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-sm border border-red-200 border-l-[3px] border-l-red-600 bg-red-50 p-3 text-sm font-medium text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => load(apiUrl, false)} className="text-xs font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {/* Capped notice — a source exceeded the 500-row pull; older rows hidden */}
        {data?.capped && (
          <div className="rounded-sm border border-amber-200 border-l-[3px] border-l-amber-500 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
            Showing the most recent matches — narrow the filters (provider, severity, search) to see older alerts.
          </div>
        )}

        {/* Feed */}
        <AlertsFeed items={data?.items ?? []} loading={loading || refreshing} onRowClick={onRowClick} />

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
            <span className="font-mono tabular-nums">
              {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 border border-slate-300 rounded-sm font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 font-mono tabular-nums">
                {page} / {maxPage}
              </span>
              <button
                type="button"
                disabled={page >= maxPage}
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                className="px-2 py-1 border border-slate-300 rounded-sm font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
