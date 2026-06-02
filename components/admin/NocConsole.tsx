'use client'

/**
 * NocConsole — fleet-wide string-health operations console.
 *
 * Split-pane layout: DonutCore on the left (fleet aggregate), filtered
 * strings table on the right. Click a bucket → table filters → click a row
 * → plant detail opens in a new tab. URL is the single source of truth for
 * filter state (?org, ?bucket, ?page) — bookmarkable, ctrl-click-friendly.
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-DONUT-V2.md §5c, §11
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { AlertTriangle, RefreshCw, Info, ExternalLink, Activity, Wifi } from 'lucide-react'
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
  inverterName: string
  provider: string
  status: ConnectivityStatus
  effectiveFreshAt: string | null
}

interface FleetConnectivity {
  counts: { live: number; frozen: number; offline: number; idle: number }
  devices: ConnectivityDevice[]
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

// ─── URL state helpers ──────────────────────────────────────────────

const VALID_BUCKETS: ReadonlySet<DonutBucket> = new Set(['healthy', 'abnormal', 'critical'])

function parseBucket(v: string | null): DonutBucket | undefined {
  if (v && VALID_BUCKETS.has(v as DonutBucket)) return v as DonutBucket
  return undefined
}

function parsePage(v: string | null): number {
  const n = v ? parseInt(v, 10) : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 10000)
}

// ─── Component ──────────────────────────────────────────────────────

export function NocConsole() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const org = searchParams.get('org') ?? undefined
  const bucket = parseBucket(searchParams.get('bucket'))
  const page = parsePage(searchParams.get('page'))

  // Build the API URL
  const apiUrl = useMemo(() => {
    const qs = new URLSearchParams({ mode: 'prev-day' })
    if (org) qs.set('org', org)
    if (bucket) qs.set('bucket', bucket)
    if (page !== 1) qs.set('page', String(page))
    return `/api/admin/string-health-donut?${qs.toString()}`
  }, [org, bucket, page])

  const { data, error, isLoading, mutate } = useSWR<NocApiResponse>(apiUrl, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0, // manual refresh only; prev-day data doesn't change intra-day
    shouldRetryOnError: (err: { status?: number }) => !err?.status || err.status >= 500,
    errorRetryCount: 3,
  })

  // URL updater — uses replace (no history pile-up); preserves other params
  const updateUrl = useCallback(
    (updates: Partial<{ org: string | undefined; bucket: DonutBucket | undefined; page: number }>) => {
      const next = new URLSearchParams(searchParams.toString())
      if ('org' in updates) {
        if (updates.org) next.set('org', updates.org)
        else next.delete('org')
        next.delete('page') // changing org resets to page 1
      }
      if ('bucket' in updates) {
        if (updates.bucket) next.set('bucket', updates.bucket)
        else next.delete('bucket')
        next.delete('page') // changing bucket resets to page 1
      }
      if ('page' in updates) {
        if (updates.page && updates.page > 1) next.set('page', String(updates.page))
        else next.delete('page')
      }
      const queryString = next.toString()
      router.replace(`/admin/noc${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  const handleBucketClick = useCallback(
    (b: DonutBucket) => {
      updateUrl({ bucket: b === bucket ? undefined : b }) // toggle off if already selected
    },
    [bucket, updateUrl],
  )

  const handleOrgChange = useCallback(
    (id: string) => {
      updateUrl({ org: id === '__all__' ? undefined : id })
    },
    [updateUrl],
  )

  // Keyboard: Esc clears bucket filter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bucket) {
        e.preventDefault()
        updateUrl({ bucket: undefined })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bucket, updateUrl])

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
  const lastUpdated = data?.freshness.lastDataAt
    ? new Date(data.freshness.lastDataAt)
    : null

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <NocHeader
        org={org}
        orgs={orgsForFilter}
        onOrgChange={handleOrgChange}
        onRefresh={() => mutate()}
        isLoading={isLoading}
        timeBasisLabel={data?.timeBasis.label}
      />

      {/* Body: split pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-4">
        {/* Donut pane (left, sticky on lg+) */}
        <div className="lg:sticky lg:top-4 self-start space-y-4">
          <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-card">
            {isLoading && !data ? (
              <SkeletonDonut />
            ) : data ? (
              <FleetDonut
                data={data}
                selectedBucket={bucket ?? null}
                onBucketClick={handleBucketClick}
              />
            ) : null}
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-card">
            {isLoading && !data ? (
              <SkeletonDonut />
            ) : data ? (
              <ConnectivityDonut connectivity={data.connectivity} />
            ) : null}
          </div>
        </div>

        {/* Table pane (right) */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-card overflow-hidden">
          <TableHeaderBar
            bucket={bucket}
            total={data?.rows.total ?? 0}
            onClearBucket={() => updateUrl({ bucket: undefined })}
            isLoading={isLoading}
          />
          {isLoading && !data ? (
            <SkeletonTable />
          ) : data && data.rows.items.length === 0 ? (
            <EmptyTable bucket={bucket} />
          ) : data ? (
            <StringsTable rows={data.rows.items} />
          ) : null}
          {data && data.rows.total > data.rows.pageSize && (
            <Pagination
              page={page}
              pageSize={data.rows.pageSize}
              total={data.rows.total}
              onPageChange={(p) => updateUrl({ page: p })}
            />
          )}
        </div>
      </div>

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

// ─── Sub-components ──────────────────────────────────────────────────

function NocHeader({
  org,
  orgs,
  onOrgChange,
  onRefresh,
  isLoading,
  timeBasisLabel,
}: {
  org: string | undefined
  orgs: Array<{ id: string; name: string; stringCount: number }>
  onOrgChange: (id: string) => void
  onRefresh: () => void
  isLoading: boolean
  timeBasisLabel?: string
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-1">
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5 text-emerald-600" strokeWidth={2} />
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">NOC — String Health</h1>
          <p className="text-[11px] text-slate-500 font-mono">
            {timeBasisLabel ?? 'Loading…'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <OrgFilter org={org} orgs={orgs} onChange={onOrgChange} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>
    </div>
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
  // v2: native <select>. Combobox upgrade at >20 orgs is queued for v2.1.
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

function FleetDonut({
  data,
  selectedBucket,
  onBucketClick,
}: {
  data: NocApiResponse
  selectedBucket: DonutBucket | null
  onBucketClick: (b: DonutBucket) => void
}) {
  const total = data.totalStrings
  const healthyPct = total > 0 ? (data.counts.healthy / total) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-4">
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
        selectedBucket={selectedBucket}
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

// Fleet connectivity donut. Re-purposes DonutCore's 3-bucket primitive by
// mapping connectivity → its slots: live→healthy, frozen→abnormal,
// offline→critical. Colors come from STATUS_STYLES (never hardcoded): we
// resolve each status to its design token, read the token's `dot` Tailwind
// class, and translate it to the matching hex Recharts needs for <Cell fill>.
// `idle` is shown as a caption below — it is "expected at night", not a fault,
// so it is excluded from the 3 slices (matches the API which keeps it separate).
//
// Click-to-filter is intentionally NOT wired here: the table to the right is
// per-STRING and filtered by health bucket via the API's ?bucket param. The
// connectivity rollup is per-DEVICE and the NOC API exposes no device-level row
// filter, so there is no reusable URL-state/row mechanism to hook into. Adding
// one would require new API + table surfaces beyond this UI task, so we render
// the donut + counts + idle caption only.

// STATUS_STYLES[...].dot Tailwind class → hex for Recharts <Cell fill>.
// Keeping this map adjacent to the tokens it mirrors makes drift obvious.
const DOT_CLASS_HEX: Record<string, string> = {
  'bg-emerald-500': '#10b981', // live  (healthy)
  'bg-orange-500': '#f97316',  // frozen
  'bg-slate-400': '#94a3b8',   // offline
}

function connectivityHex(status: ConnectivityStatus): string {
  const dot = STATUS_STYLES[statusKeyFromConnectivity(status)].dot
  return DOT_CLASS_HEX[dot] ?? '#94a3b8'
}

function ConnectivityDonut({ connectivity }: { connectivity: FleetConnectivity }) {
  const { live, frozen, offline, idle } = connectivity.counts
  const total = live + frozen + offline // idle excluded from the 3 slices
  const livePct = total > 0 ? (live / total) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="self-start flex items-center gap-2 mb-1">
        <Wifi className="w-4 h-4 text-slate-400" strokeWidth={2} />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Inverter Connectivity
        </h2>
      </div>
      <DonutCore
        // Slot mapping: live→healthy, frozen→abnormal, offline→critical.
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
        // Connectivity-specific slice names. (Colors stay token-driven above;
        // labels differ because the live slot reuses the green "healthy" token,
        // whose label "Healthy" would be wrong for a connectivity view.)
        labels={{ healthy: 'Live', abnormal: 'Frozen', critical: 'Offline' }}
        unit={{ singular: 'inverter', plural: 'inverters' }}
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

function TableHeaderBar({
  bucket,
  total,
  onClearBucket,
  isLoading,
}: {
  bucket: DonutBucket | undefined
  total: number
  onClearBucket: () => void
  isLoading: boolean
}) {
  const label = bucket ? bucket[0].toUpperCase() + bucket.slice(1) : 'All buckets'
  return (
    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Strings · {label}
        </h2>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          ({isLoading ? '…' : total.toLocaleString()})
        </span>
      </div>
      {bucket && (
        <button
          type="button"
          onClick={onClearBucket}
          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-0.5"
          title="Clear filter (Esc)"
        >
          Clear ×
        </button>
      )}
    </div>
  )
}

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

const BUCKET_LABEL: Record<DonutBucket, string> = {
  healthy: 'Healthy',
  abnormal: 'Abnormal',
  critical: 'Critical',
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

function EmptyTable({ bucket }: { bucket: DonutBucket | undefined }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-bold text-slate-700 mb-1">No matching strings</p>
      <p className="text-xs text-slate-500">
        {bucket
          ? `No strings in the ${BUCKET_LABEL[bucket]} bucket for this filter.`
          : 'No string data available for this filter.'}
      </p>
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
