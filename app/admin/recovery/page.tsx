'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { cn } from '@/lib/utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, RefreshCw, ChevronRight, ChevronDown, Mail, Phone, Users } from 'lucide-react'
import { STATUS_STYLES } from '@/lib/design-tokens'
import { formatRelative, type RecoveryBucket } from '@/lib/dormancy'

interface RecoveryUser {
  email: string
  name: string | null
  lastActiveAt: string | null
  daysSince: number | null
  loginCount: number
  bucket: RecoveryBucket
}

interface RecoveryClient {
  orgId: string
  orgName: string
  status: string
  email: string | null
  phone: string | null
  userCount: number
  totalLogins: number
  lastActiveAt: string | null
  daysSince: number | null
  bucket: RecoveryBucket
  users: RecoveryUser[]
}

interface RecoveryResponse {
  clients: RecoveryClient[]
  summary: Record<RecoveryBucket, number>
  needsAttention: number
  thresholds: { activeDays: number; coolingDays: number; atRiskDays: number }
}

// Bucket → display style. Maps recovery buckets onto the shared status tokens.
const BUCKET_META: Record<RecoveryBucket, { label: string; dot: string; fg: string; order: number }> = {
  lost:    { label: 'Lost',     dot: STATUS_STYLES.critical.dot, fg: STATUS_STYLES.critical.fg, order: 0 },
  at_risk: { label: 'At risk',  dot: STATUS_STYLES.warning.dot,  fg: STATUS_STYLES.warning.fg,  order: 1 },
  never:   { label: 'Never used', dot: STATUS_STYLES.offline.dot, fg: 'text-slate-400',         order: 2 },
  cooling: { label: 'Cooling',  dot: 'bg-amber-400', fg: 'text-amber-600', order: 3 },
  active:  { label: 'Active',   dot: STATUS_STYLES.healthy.dot,  fg: 'text-slate-700',          order: 4 },
}

export default function AdminRecoveryPage() {
  const [data, setData] = useState<RecoveryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/recovery', { credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (orgId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  // By default show only clients needing attention (lost / at_risk / never)
  const visibleClients = (data?.clients ?? []).filter((c) =>
    showAll ? true : (c.bucket === 'lost' || c.bucket === 'at_risk' || c.bucket === 'never'),
  )

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Client Recovery</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Clients who've gone quiet — reach out before they churn. Based on last dashboard activity,
            independent of super-admin logins.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-sm text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {(['lost', 'at_risk', 'never', 'cooling', 'active'] as RecoveryBucket[]).map((b) => {
            const meta = BUCKET_META[b]
            return (
              <div key={b} className="bg-white border border-slate-200 rounded-sm p-3 shadow-card">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{meta.label}</span>
                </div>
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {data.summary[b]}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Need-attention banner */}
      {data && data.needsAttention > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-2.5 mb-4 text-sm text-amber-800">
          <strong className="font-bold">{data.needsAttention}</strong> client{data.needsAttention === 1 ? '' : 's'} need
          a follow-up (lost, at-risk, or never used).
        </div>
      )}

      {/* Toggle: needs-attention vs all */}
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
        >
          {showAll ? 'Show only clients needing attention' : 'Show all clients'}
        </button>
      </div>

      {/* Body */}
      {error ? (
        <div className="bg-white border border-slate-200 rounded-sm p-8 text-center">
          <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
          <button onClick={load} className="text-xs font-semibold text-slate-700 underline">Retry</button>
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading clients…
        </div>
      ) : visibleClients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-sm p-10 text-center">
          <p className="text-sm font-bold text-emerald-700 mb-1">✓ All clients are engaged</p>
          <p className="text-xs text-slate-500">No clients currently need a recovery follow-up.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last opened</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Logins</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleClients.map((c) => {
                const meta = BUCKET_META[c.bucket]
                const isOpen = expanded.has(c.orgId)
                return (
                  <Fragment key={c.orgId}>
                    <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(c.orgId)}>
                      <TableCell>
                        {c.users.length > 0 && (
                          isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{c.orgName}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                          <span className={cn('text-sm font-semibold', meta.fg)}>{meta.label}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{formatRelative(c.lastActiveAt)}</span>
                        {c.daysSince !== null && c.daysSince > 14 && (
                          <span className="text-[11px] text-slate-400 ml-1.5">({c.daysSince}d)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums text-slate-700">{c.userCount}</TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums text-slate-700">{c.totalLogins}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-[12px] text-slate-500">
                          {c.email && (
                            <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-slate-900">
                              <Mail className="w-3 h-3" /> Email
                            </a>
                          )}
                          {c.phone && (
                            <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                          )}
                          {!c.email && !c.phone && <span className="text-slate-300">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && c.users.map((u) => {
                      const um = BUCKET_META[u.bucket]
                      return (
                        <TableRow key={`${c.orgId}:${u.email}`} className="bg-slate-50/60">
                          <TableCell></TableCell>
                          <TableCell className="pl-6 text-[13px] text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="w-3 h-3 text-slate-300" />
                              {u.name || u.email}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn('w-1.5 h-1.5 rounded-full', um.dot)} />
                              <span className={cn('text-[12px]', um.fg)}>{um.label}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-[13px] text-slate-600">{formatRelative(u.lastActiveAt)}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-center font-mono text-[12px] tabular-nums text-slate-500">{u.loginCount}</TableCell>
                          <TableCell className="text-[12px] text-slate-400">{u.email}</TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Threshold footnote */}
      {data && (
        <p className="text-[11px] text-slate-400 mt-3">
          Thresholds: Active ≤ {data.thresholds.activeDays}d · Cooling ≤ {data.thresholds.coolingDays}d ·
          At risk ≤ {data.thresholds.atRiskDays}d · Lost &gt; {data.thresholds.atRiskDays}d.
          Solar clients check periodically, so these are intentionally lenient.
        </p>
      )}
    </div>
  )
}
