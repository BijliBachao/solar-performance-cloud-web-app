'use client'

/**
 * NocConsole v3 — donut-first fleet triage console.
 *
 * Research-backed interaction model (spec: docs/superpowers/specs/
 * 2026-06-04-noc-v3-triage-console-design.md):
 *  - Both donuts are CROSS-FILTER controls (click slice → table filters;
 *    selected slice outlined, others dimmed; click again to clear; second
 *    slice on the same donut = OR within that facet).
 *  - Facets compose AND across (org ∧ health ∧ connectivity ∧ search); each
 *    donut recomputes under the OTHER facets (coordinated views, server-side).
 *  - Filter state lives in React state, mirrored to the URL SHALLOWLY via
 *    history.replaceState — deep-linkable, zero Next.js navigation/reload.
 *  - Two refresh regimes (SWR): 60 s background poll updates in place
 *    (subtle indicator, context preserved); user filter changes dim the
 *    table (keepPreviousData) instead of blanking or flickering it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  AlertTriangle, RefreshCw, Info, ExternalLink, Activity, Wifi, Search, X, Flame,
} from 'lucide-react'
import { DonutCore } from '@/components/shared/DonutCore'
import { cn } from '@/lib/utils'
import { STATUS_STYLES, statusKeyFromConnectivity } from '@/lib/design-tokens'
import type { ConnectivityStatus } from '@/lib/string-health'
import type { DonutAggregate, DonutBucket } from '@/lib/string-health-donut'

// ─── Types ──────────────────────────────────────────────────────────

interface PerStringRow {
  orgId: string
  orgName: string
  plantCode: string
  plantName: string
  deviceId: string
  inverterName: string
  stringNumber: number
  healthScore: number | null
  bucket: DonutBucket
}

interface ConnectivityDevice {
  deviceId: string
  plantCode: string
  plantName: string
  inverterName: string
  provider: string
  status: ConnectivityStatus
  effectiveFreshAt: string | null
}

interface FleetConnectivity {
  counts: { live: number; frozen: number; offline: number; idle: number }
  devices: ConnectivityDevice[]
}

interface FleetKpis {
  offlineInverters: number
  frozenInverters: number
  criticalStrings: number
  plantsWithIssues: number
  livePct: number | null
}

interface AttentionPlant {
  plantCode: string
  plantName: string
  critStrings: number
  frozen: number
  offline: number
  worstSince: string | null
  score: number
}

interface NocApiResponse extends DonutAggregate {
  mode: 'prev-day'
  timeBasis: { label: string; startsAt: string; endsAt: string }
  freshness: { lastDataAt: string | null; coveragePct: number }
  orgs: Array<{ id: string; name: string; stringCount: number }>
  rows: {
    page: number
    pageSize: number
    total: number
    items: PerStringRow[]
  }
  connectivity: FleetConnectivity
  kpis: FleetKpis
  attention: AttentionPlant[]
  warnings: Array<{ code: string; message: string }>
}

// ─── Fetcher ────────────────────────────────────────────────────────

const fetcher = async (url: string): Promise<NocApiResponse> => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    let message = `Failed to load (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.code) code = body.code
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    const err = new Error(message) as Error & { code?: string; status?: number }
    err.code = code
    err.status = res.status
    throw err
  }
  return res.json()
}

// ─── Filter state (facets) ──────────────────────────────────────────

const VALID_BUCKETS: ReadonlySet<DonutBucket> = new Set(['healthy', 'abnormal', 'critical'])
const VALID_CONN: ReadonlySet<ConnectivityStatus> = new Set(['live', 'frozen', 'offline', 'idle'])
// Connectivity donut re-purposes DonutCore's 3 slots.
const SLOT_TO_CONN: Record<DonutBucket, ConnectivityStatus> = {
  healthy: 'live', abnormal: 'frozen', critical: 'offline',
}
const CONN_TO_SLOT: Record<'live' | 'frozen' | 'offline', DonutBucket> = {
  live: 'healthy', frozen: 'abnormal', offline: 'critical',
}

interface Filters {
  org: string | undefined
  buckets: DonutBucket[]
  conn: ConnectivityStatus[]
  q: string
  page: number
}

function parseCsv<T extends string>(v: string | null, valid: ReadonlySet<T>): T[] {
  if (!v) return []
  return v.split(',').map((s) => s.trim()).filter((s): s is T => valid.has(s as T))
}

function parsePage(v: string | null): number {
  const n = v ? parseInt(v, 10) : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 10000)
}

function filtersToQuery(f: Filters): string {
  const qs = new URLSearchParams()
  if (f.org) qs.set('org', f.org)
  if (f.buckets.length > 0) qs.set('buckets', f.buckets.join(','))
  if (f.conn.length > 0) qs.set('conn', f.conn.join(','))
  if (f.q.trim() !== '') qs.set('q', f.q.trim())
  if (f.page !== 1) qs.set('page', String(f.page))
  const s = qs.toString()
  return s ? `?${s}` : ''
}

const hasActiveFacets = (f: Filters) =>
  f.buckets.length > 0 || f.conn.length > 0 || f.q.trim() !== ''

// ─── Component ──────────────────────────────────────────────────────

export function NocConsole() {
  const searchParams = useSearchParams()

  // Filters are CLIENT state (instant, no navigation), initialized once from
  // the URL so deep links work. The URL is kept in sync shallowly below.
  const [filters, setFilters] = useState<Filters>(() => ({
    org: searchParams.get('org') ?? undefined,
    buckets: parseCsv(searchParams.get('buckets') ?? searchParams.get('bucket'), VALID_BUCKETS),
    conn: parseCsv(searchParams.get('conn'), VALID_CONN),
    q: searchParams.get('q') ?? '',
    page: parsePage(searchParams.get('page')),
  }))
  // Debounced search input (interactive filtering without a fetch per keystroke).
  const [qInput, setQInput] = useState(filters.q)

  // Shallow URL mirror — history.replaceState performs NO Next.js navigation,
  // so the page never reloads; the URL stays shareable/bookmarkable.
  useEffect(() => {
    const next = `/admin/noc${filtersToQuery(filters)}`
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next)
    }
  }, [filters])

  // Debounce q (350 ms) into the real filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput, page: 1 }))
    }, 350)
    return () => clearTimeout(t)
  }, [qInput])

  const apiUrl = useMemo(() => {
    const qs = new URLSearchParams({ mode: 'prev-day' })
    if (filters.org) qs.set('org', filters.org)
    if (filters.buckets.length > 0) qs.set('buckets', filters.buckets.join(','))
    if (filters.conn.length > 0) qs.set('conn', filters.conn.join(','))
    if (filters.q.trim() !== '') qs.set('q', filters.q.trim())
    if (filters.page !== 1) qs.set('page', String(filters.page))
    return `/api/admin/string-health-donut?${qs.toString()}`
  }, [filters])

  const { data, error, isLoading, isValidating, mutate } = useSWR<NocApiResponse>(apiUrl, fetcher, {
    // Live triage console: 60 s background poll (pauses when the tab is
    // hidden — SWR's "smart" polling), refresh on operator return.
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    // Filter changes change the SWR key — keep the old rows visible (dimmed)
    // instead of blanking the table.
    keepPreviousData: true,
    shouldRetryOnError: (err: { status?: number }) => !err?.status || err.status >= 500,
    errorRetryCount: 3,
  })

  // SWR semantics: first paint (no data at all) → skeletons; key change with
  // previous data shown → dim the results (NN/g); background poll → subtle dot.
  const firstLoad = isLoading && !data
  const filterPending = isLoading && !!data
  const backgroundRefresh = isValidating && !isLoading

  // "Updated Xs ago" — stamp on every successful revalidation.
  const [dataAt, setDataAt] = useState<number | null>(null)
  useEffect(() => {
    if (data) setDataAt(Date.now())
  }, [data])

  // ── Facet mutations ──
  const toggleBucket = useCallback((b: DonutBucket) => {
    setFilters((f) => ({
      ...f,
      page: 1,
      buckets: f.buckets.includes(b) ? f.buckets.filter((x) => x !== b) : [...f.buckets, b],
    }))
  }, [])

  const toggleConn = useCallback((slot: DonutBucket) => {
    const status = SLOT_TO_CONN[slot]
    setFilters((f) => ({
      ...f,
      page: 1,
      conn: f.conn.includes(status) ? f.conn.filter((x) => x !== status) : [...f.conn, status],
    }))
  }, [])

  const setOrg = useCallback((id: string) => {
    setFilters((f) => ({ ...f, org: id === '__all__' ? undefined : id, page: 1 }))
  }, [])

  const setPage = useCallback((p: number) => {
    setFilters((f) => ({ ...f, page: p }))
  }, [])

  const clearFacets = useCallback(() => {
    setQInput('')
    setFilters((f) => ({ ...f, buckets: [], conn: [], q: '', page: 1 }))
  }, [])

  // Esc clears all facet selections (org is a scope, not a facet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null
        // Don't hijack Esc inside inputs (lets the search field blur naturally).
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
        e.preventDefault()
        clearFacets()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearFacets])

  // ── Render ──

  if (error) {
    const isAuthErr = (error as any)?.status === 401 || (error as any)?.status === 403
    return (
      <div className="bg-white border border-slate-200 rounded-sm p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" strokeWidth={2} />
        <p className="text-sm font-bold text-slate-900 mb-1">Unable to load NOC data</p>
        <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">{(error as Error).message}</p>
        {!isAuthErr && (
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    )
  }

  const orgsForFilter = data?.orgs ?? []

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <NocHeader
        org={filters.org}
        orgs={orgsForFilter}
        onOrgChange={setOrg}
        qInput={qInput}
        onQChange={setQInput}
        onRefresh={() => mutate()}
        isRefreshing={backgroundRefresh || filterPending}
        dataAt={dataAt}
        timeBasisLabel={data?.timeBasis.label}
      />

      {/* KPI strip — fleet state, each card a one-click quick filter */}
      {firstLoad ? <SkeletonKpis /> : data ? (
        <KpiStrip kpis={data.kpis} filters={filters} setFilters={setFilters} />
      ) : null}

      {/* Body: split pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-4">
        {/* Donut pane (left, sticky on lg+) — the client-validated centerpiece */}
        <div className="lg:sticky lg:top-4 self-start space-y-4">
          <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-card">
            {firstLoad ? (
              <SkeletonDonut />
            ) : data ? (
              <FleetDonut data={data} selectedBuckets={filters.buckets} onBucketClick={toggleBucket} />
            ) : null}
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-card">
            {firstLoad ? (
              <SkeletonDonut />
            ) : data ? (
              <ConnectivityDonut
                connectivity={data.connectivity}
                selectedConn={filters.conn}
                onSlotClick={toggleConn}
              />
            ) : null}
          </div>
        </div>

        {/* Table pane (right) */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-card overflow-hidden">
          <FilterChips filters={filters} setFilters={setFilters} setQInput={setQInput} onClearAll={clearFacets} total={data?.rows.total ?? 0} isLoading={firstLoad || filterPending} />
          <div className={cn('transition-opacity duration-150', filterPending && 'opacity-50 pointer-events-none')}>
            {firstLoad ? (
              <SkeletonTable />
            ) : data && data.rows.items.length === 0 ? (
              <EmptyTable hasFacets={hasActiveFacets(filters)} onClearAll={clearFacets} />
            ) : data ? (
              <StringsTable rows={data.rows.items} />
            ) : null}
          </div>
          {data && data.rows.total > data.rows.pageSize && (
            <Pagination
              page={filters.page}
              pageSize={data.rows.pageSize}
              total={data.rows.total}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {/* Needs attention — worst offenders, fleet-state (unfaceted) */}
      {data && data.attention.length > 0 && <AttentionPanel attention={data.attention} />}

      {/* Warnings (if any) */}
      {data && data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-xs space-y-1">
          {data.warnings.map((w) => (
            <p key={w.code} className="flex items-start gap-1.5 text-amber-800">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{w.message}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────────────

function NocHeader({
  org,
  orgs,
  onOrgChange,
  qInput,
  onQChange,
  onRefresh,
  isRefreshing,
  dataAt,
  timeBasisLabel,
}: {
  org: string | undefined
  orgs: Array<{ id: string; name: string; stringCount: number }>
  onOrgChange: (id: string) => void
  qInput: string
  onQChange: (v: string) => void
  onRefresh: () => void
  isRefreshing: boolean
  dataAt: number | null
  timeBasisLabel?: string
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-1">
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5 text-emerald-600" strokeWidth={2} />
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">NOC — Fleet Triage</h1>
          <p className="text-[11px] text-slate-500 font-mono">
            {timeBasisLabel ?? 'Loading…'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Plant / inverter…"
            aria-label="Search plants and inverters"
            className="text-xs text-slate-800 border border-slate-300 rounded-sm pl-8 pr-2 py-1.5 bg-white w-[190px] placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <OrgFilter org={org} orgs={orgs} onChange={onOrgChange} />
        <UpdatedAgo dataAt={dataAt} isRefreshing={isRefreshing} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>
    </div>
  )
}

/** "Updated 12s ago" with a 1 s tick — the unobtrusive background-refresh
 *  indicator (data updates in place; this is the only always-visible signal). */
function UpdatedAgo({ dataAt, isRefreshing }: { dataAt: number | null; isRefreshing: boolean }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  let label = '—'
  if (dataAt) {
    const s = Math.max(0, Math.floor((Date.now() - dataAt) / 1000))
    label = s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500" title="Auto-refreshes every 60s">
      <span className={cn('w-1.5 h-1.5 rounded-full', isRefreshing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} aria-hidden="true" />
      Updated {label} · 60s
    </span>
  )
}

function OrgFilter({
  org,
  orgs,
  onChange,
}: {
  org: string | undefined
  orgs: Array<{ id: string; name: string; stringCount: number }>
  onChange: (id: string) => void
}) {
  return (
    <select
      value={org ?? '__all__'}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-semibold text-slate-700 border border-slate-300 rounded-sm px-2 py-1.5 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-w-[160px]"
      aria-label="Filter by organization"
    >
      <option value="__all__">All Organizations</option>
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} ({o.stringCount.toLocaleString()})
        </option>
      ))}
    </select>
  )
}

// ─── KPI strip ──────────────────────────────────────────────────────

function KpiStrip({
  kpis,
  filters,
  setFilters,
}: {
  kpis: FleetKpis
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
}) {
  const applyConn = (status: ConnectivityStatus) =>
    setFilters((f) => ({
      ...f, page: 1,
      conn: f.conn.length === 1 && f.conn[0] === status ? [] : [status],
    }))
  const applyCritical = () =>
    setFilters((f) => ({
      ...f, page: 1,
      buckets: f.buckets.length === 1 && f.buckets[0] === 'critical' ? [] : ['critical'],
    }))

  const offlineActive = filters.conn.length === 1 && filters.conn[0] === 'offline'
  const frozenActive = filters.conn.length === 1 && filters.conn[0] === 'frozen'
  const critActive = filters.buckets.length === 1 && filters.buckets[0] === 'critical'

  const cards: Array<{
    key: string; value: string; label: string; tone: 'red' | 'orange' | 'slate' | 'emerald'
    onClick?: () => void; active?: boolean
  }> = [
    { key: 'offline', value: String(kpis.offlineInverters), label: 'inverters offline', tone: kpis.offlineInverters > 0 ? 'red' : 'slate', onClick: () => applyConn('offline'), active: offlineActive },
    { key: 'frozen', value: String(kpis.frozenInverters), label: 'feeds frozen', tone: kpis.frozenInverters > 0 ? 'orange' : 'slate', onClick: () => applyConn('frozen'), active: frozenActive },
    { key: 'critical', value: String(kpis.criticalStrings), label: 'critical strings', tone: kpis.criticalStrings > 0 ? 'red' : 'slate', onClick: applyCritical, active: critActive },
    { key: 'plants', value: String(kpis.plantsWithIssues), label: 'plants w/ issues', tone: kpis.plantsWithIssues > 0 ? 'orange' : 'slate' },
    { key: 'live', value: kpis.livePct === null ? '—' : `${kpis.livePct}%`, label: 'fleet live', tone: 'emerald' },
  ]

  const toneCls: Record<string, string> = {
    red: 'text-red-700',
    orange: 'text-orange-700',
    slate: 'text-slate-700',
    emerald: 'text-emerald-700',
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {cards.map((c) => {
        const Tag = c.onClick ? 'button' : 'div'
        return (
          <Tag
            key={c.key}
            type={c.onClick ? 'button' : undefined}
            onClick={c.onClick}
            aria-pressed={c.onClick ? c.active : undefined}
            className={cn(
              'bg-white border rounded-sm px-3 py-2.5 text-left shadow-card transition-colors',
              c.active ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-200',
              c.onClick && 'hover:border-slate-400 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
            )}
          >
            <div className={cn('text-xl font-bold font-mono tabular-nums leading-none', toneCls[c.tone])}>
              {c.value}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
              {c.label}
            </div>
          </Tag>
        )
      })}
    </div>
  )
}

// ─── Active-filter chips ────────────────────────────────────────────

const BUCKET_LABEL: Record<DonutBucket, string> = {
  healthy: 'Healthy',
  abnormal: 'Abnormal',
  critical: 'Critical',
}

function FilterChips({
  filters,
  setFilters,
  setQInput,
  onClearAll,
  total,
  isLoading,
}: {
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  setQInput: (v: string) => void
  onClearAll: () => void
  total: number
  isLoading: boolean
}) {
  const chips: Array<{ key: string; label: string; onRemove: () => void; cls: string }> = []
  for (const b of filters.buckets) {
    chips.push({
      key: `b:${b}`,
      label: `Health: ${BUCKET_LABEL[b]}`,
      cls: 'bg-slate-100 border-slate-300 text-slate-800',
      onRemove: () => setFilters((f) => ({ ...f, page: 1, buckets: f.buckets.filter((x) => x !== b) })),
    })
  }
  for (const c of filters.conn) {
    const style = STATUS_STYLES[statusKeyFromConnectivity(c)]
    chips.push({
      key: `c:${c}`,
      label: `Conn: ${style.label}`,
      cls: cn(style.bg, style.border, style.fg),
      onRemove: () => setFilters((f) => ({ ...f, page: 1, conn: f.conn.filter((x) => x !== c) })),
    })
  }
  if (filters.q.trim() !== '') {
    chips.push({
      key: 'q',
      label: `“${filters.q.trim()}”`,
      cls: 'bg-slate-100 border-slate-300 text-slate-800',
      onRemove: () => { setQInput(''); setFilters((f) => ({ ...f, q: '', page: 1 })) },
    })
  }

  return (
    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Strings · worst first
        </h2>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          ({isLoading ? '…' : total.toLocaleString()})
        </span>
        {chips.map((c) => (
          <span
            key={c.key}
            className={cn('inline-flex items-center gap-1 border rounded-sm px-1.5 py-0.5 text-[11px] font-semibold', c.cls)}
          >
            {c.label}
            <button
              type="button"
              onClick={c.onRemove}
              aria-label={`Remove filter ${c.label}`}
              className="hover:opacity-60"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {chips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-0.5"
          title="Clear all filters (Esc)"
        >
          Clear all ×
        </button>
      )}
    </div>
  )
}

// ─── Donuts ─────────────────────────────────────────────────────────

function FleetDonut({
  data,
  selectedBuckets,
  onBucketClick,
}: {
  data: NocApiResponse
  selectedBuckets: DonutBucket[]
  onBucketClick: (b: DonutBucket) => void
}) {
  const total = data.totalStrings
  const healthyPct = total > 0 ? (data.counts.healthy / total) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="self-start flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-slate-400" strokeWidth={2} />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          String Health
        </h2>
      </div>
      <DonutCore
        counts={{
          healthy: data.counts.healthy,
          abnormal: data.counts.abnormal,
          critical: data.counts.critical,
        }}
        total={total}
        breakdown={data.breakdown}
        size="lg"
        legendOrientation="bottom"
        centerMetric={{ value: total.toLocaleString(), label: 'strings' }}
        centerSubline={total > 0 ? `${healthyPct.toFixed(1)}% healthy` : undefined}
        selectedBuckets={selectedBuckets}
        onClickBucket={onBucketClick}
      />
      {(data.excluded.unused + data.excluded.nonStandard) > 0 && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Info className="w-3 h-3 text-slate-400" strokeWidth={2} />
          {data.excluded.unused + data.excluded.nonStandard} string
          {data.excluded.unused + data.excluded.nonStandard === 1 ? '' : 's'} excluded from view
        </p>
      )}
    </div>
  )
}

// STATUS_STYLES[...].dot Tailwind class → hex for Recharts <Cell fill>.
// Keeping this map adjacent to the tokens it mirrors makes drift obvious.
const DOT_CLASS_HEX: Record<string, string> = {
  'bg-emerald-500': '#10b981', // live  (healthy)
  'bg-orange-500': '#f97316',  // frozen
  'bg-slate-400': '#94a3b8',   // offline
  'bg-slate-300': '#cbd5e1',   // idle (night) — excluded from slices, mapped for completeness
}

function connectivityHex(status: ConnectivityStatus): string {
  const dot = STATUS_STYLES[statusKeyFromConnectivity(status)].dot
  return DOT_CLASS_HEX[dot] ?? '#94a3b8'
}

/** Connectivity donut — interactive (NOC v3): slices cross-filter the table to
 *  strings of devices in the selected status(es). Slot mapping live→healthy,
 *  frozen→abnormal, offline→critical; idle shown as a caption (expected at
 *  night, never a slice). */
function ConnectivityDonut({
  connectivity,
  selectedConn,
  onSlotClick,
}: {
  connectivity: FleetConnectivity
  selectedConn: ConnectivityStatus[]
  onSlotClick: (slot: DonutBucket) => void
}) {
  const { live, frozen, offline, idle } = connectivity.counts
  const total = live + frozen + offline // idle excluded from the 3 slices
  const livePct = total > 0 ? (live / total) * 100 : 0
  const selectedSlots = selectedConn
    .filter((c): c is 'live' | 'frozen' | 'offline' => c !== 'idle')
    .map((c) => CONN_TO_SLOT[c])
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="self-start flex items-center gap-2 mb-1">
        <Wifi className="w-4 h-4 text-slate-400" strokeWidth={2} />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Inverter Connectivity
        </h2>
      </div>
      <DonutCore
        counts={{ healthy: live, abnormal: frozen, critical: offline }}
        total={total}
        size="lg"
        legendOrientation="bottom"
        centerMetric={{ value: total.toLocaleString(), label: 'inverters' }}
        centerSubline={total > 0 ? `${livePct.toFixed(1)}% live` : undefined}
        colors={{
          healthy: connectivityHex('live'),
          abnormal: connectivityHex('frozen'),
          critical: connectivityHex('offline'),
        }}
        labels={{ healthy: 'Live', abnormal: 'Frozen', critical: 'Offline' }}
        unit={{ singular: 'inverter', plural: 'inverters' }}
        selectedBuckets={selectedSlots}
        onClickBucket={onSlotClick}
        ariaLabel={`Inverter connectivity: ${live} live, ${frozen} frozen, ${offline} offline (${total} reporting), ${idle} idle`}
      />
      {idle > 0 && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span
            className={cn('w-2 h-2 rounded-full', STATUS_STYLES[statusKeyFromConnectivity('idle')].dot)}
            aria-hidden="true"
          />
          {idle.toLocaleString()} idle — night
        </p>
      )}
    </div>
  )
}

// ─── Strings table ──────────────────────────────────────────────────

function StringsTable({ rows }: { rows: PerStringRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] text-slate-500">Org</th>
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] text-slate-500">Plant</th>
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] text-slate-500">Inverter</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wider text-[10px] text-slate-500">String</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wider text-[10px] text-slate-500">Score</th>
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] text-slate-500">Status</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wider text-[10px] text-slate-500"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TableRow key={`${r.deviceId}:${r.stringNumber}`} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const BUCKET_DOT_CLASS: Record<DonutBucket, string> = {
  healthy: 'bg-emerald-500',
  abnormal: 'bg-amber-500',
  critical: 'bg-red-500',
}

function TableRow({ row }: { row: PerStringRow }) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const href = `/admin/plants/${encodeURIComponent(row.plantCode)}`
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      linkRef.current?.click()
    }
  }
  return (
    <tr
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => linkRef.current?.click()}
      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/40"
    >
      <td className="px-3 py-2 text-slate-700 truncate max-w-[140px]">{row.orgName}</td>
      <td className="px-3 py-2 text-slate-900 font-medium truncate max-w-[180px]">{row.plantName}</td>
      <td className="px-3 py-2 text-slate-700 truncate max-w-[140px]">{row.inverterName}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{row.stringNumber}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
        {row.healthScore === null ? '—' : row.healthScore.toFixed(1)}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-slate-700">
          <span className={cn('w-1.5 h-1.5 rounded-full', BUCKET_DOT_CLASS[row.bucket])} />
          {BUCKET_LABEL[row.bucket]}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <a
          ref={linkRef}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center text-slate-400 hover:text-slate-900"
          aria-label={`Open ${row.plantName} in new tab`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </td>
    </tr>
  )
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
      <span className="font-mono tabular-nums">
        {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
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
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 border border-slate-300 rounded-sm font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

// ─── Needs attention (worst offenders) ──────────────────────────────

function sinceLabel(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function AttentionPanel({ attention }: { attention: AttentionPlant[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-600" strokeWidth={2} />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Needs attention
        </h2>
        <span className="text-[11px] text-slate-400">— fleet-wide, unaffected by filters</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {attention.map((p, i) => {
          const parts: string[] = []
          if (p.critStrings > 0) parts.push(`${p.critStrings} critical string${p.critStrings === 1 ? '' : 's'}`)
          if (p.frozen > 0) parts.push(`${p.frozen} frozen feed${p.frozen === 1 ? '' : 's'}`)
          if (p.offline > 0) parts.push(`${p.offline} inverter${p.offline === 1 ? '' : 's'} offline`)
          const since = sinceLabel(p.worstSince)
          return (
            <li key={p.plantCode}>
              <a
                href={`/admin/plants/${encodeURIComponent(p.plantCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span className="text-[11px] font-mono tabular-nums text-slate-400 w-5">{i + 1}.</span>
                <span className="text-xs font-semibold text-slate-900 truncate max-w-[220px]">{p.plantName}</span>
                <span className="text-[11px] text-slate-600 truncate flex-1">{parts.join(' · ')}</span>
                {since && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-500" title="Oldest data among this plant's frozen/offline inverters">
                    since {since}
                  </span>
                )}
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Empty / loading states ─────────────────────────────────────────

function EmptyTable({ hasFacets, onClearAll }: { hasFacets: boolean; onClearAll: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-bold text-slate-700 mb-1">
        {hasFacets ? 'No strings match these filters' : 'No matching strings'}
      </p>
      <p className="text-xs text-slate-500 mb-3">
        {hasFacets
          ? 'The active filter combination matches nothing — remove a filter or clear them all.'
          : 'No string data available for this view.'}
      </p>
      {hasFacets && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

function SkeletonKpis() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-[58px] bg-slate-100 rounded-sm" />
      ))}
    </div>
  )
}

function SkeletonDonut() {
  return (
    <div className="flex flex-col items-center gap-4 animate-pulse">
      <div className="w-[240px] h-[240px] rounded-full bg-slate-100 flex items-center justify-center">
        <div className="w-[170px] h-[170px] rounded-full bg-white" />
      </div>
      <div className="space-y-2 w-full">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded-sm" />
        ))}
      </div>
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="p-4 space-y-2 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-6 bg-slate-100 rounded-sm" />
      ))}
    </div>
  )
}
