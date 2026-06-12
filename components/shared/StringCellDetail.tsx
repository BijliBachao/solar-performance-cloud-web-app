'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'
import { shouldFlagRawSensorFault, PERF_DISPLAY_MAX, SENSOR_FAULT_RAW_PCT } from '@/lib/string-health'
import { completenessStyleFromPct } from '@/lib/design-tokens'

// ── API response shape (matches Task 7A contract) ──────────────────────────

type CellStatus = 'healthy' | 'warning' | 'critical' | 'no_data' | 'peer_excluded' | 'unused'

interface PeerEntry {
  string_number: number
  repr_current: number
}

interface HourlyEntry {
  hour: string
  avg_current: number
}

// Own-trend block for peer-excluded strings (shaded / different orientation).
// Informational only — never a fault, never alerted, NOT weather-adjusted (V1).
interface HistoricalInfo {
  todayRepr: number | null
  baseline: number | null
  pct: number | null
  source: 'manual' | '30d' | null
}

interface StringCellDetailData {
  device_id: string
  device_name: string | null
  string_number: number
  date: string
  status: CellStatus
  performance: number | null
  /** Raw, uncapped Performance % (admin/DB side). >100 = possible sensor fault. */
  raw_performance?: number | null
  repr_current: number | null
  peer_median_current: number | null
  /** Data Completeness % (0–100): readings received / 96 expected. SEPARATE
   *  axis from performance (§9) — never itself a fault. null on legacy days. */
  data_completeness?: number | null
  peers: PeerEntry[]
  hourly: HourlyEntry[]
  historical?: HistoricalInfo | null
}

// ── Props ──────────────────────────────────────────────────────────────────

interface StringCellDetailProps {
  apiPath: string
  deviceId: string
  stringNumber: number
  date: string
  onClose: () => void
  /** Admin context (admin /analysis). Unlocks §6 raw-% sensor-fault visibility.
   *  The customer (dashboard) view leaves this false and stays clean (≤100%). */
  isAdmin?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_DISPLAY: Record<CellStatus, { label: string; fg: string; bg: string; border: string }> = {
  healthy:       { label: 'Healthy',       fg: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  warning:       { label: 'Warning',       fg: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200'   },
  critical:      { label: 'Critical',      fg: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200'     },
  no_data:       { label: 'No Data',       fg: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200'   },
  peer_excluded: { label: 'Non-standard',  fg: 'text-indigo-700',  bg: 'bg-indigo-50',   border: 'border-indigo-200'  },
  unused:        { label: 'Unused',        fg: 'text-slate-400',   bg: 'bg-slate-50',    border: 'border-slate-200'   },
}

function nullReason(status: CellStatus): string {
  switch (status) {
    case 'no_data':       return 'Not enough strong-sun hours to score this string (low light / overcast)'
    case 'unused':        return 'Unused port'
    case 'peer_excluded': return 'Excluded from peer comparison (non-standard)'
    default:              return 'Performance unavailable'
  }
}

function fmtA(v: number | null): string {
  return v !== null && v !== undefined ? v.toFixed(2) : '—'
}

// Format a completeness % like "90.6%" — keep one decimal when present, but drop
// a trailing ".0" so a whole-number value reads "90%" not "90.0%".
function fmtCompletenessPct(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

// Find the index of the peer entry closest to the scorer's median value.
// The scorer averages the two middle values for even-N pools, so we match
// by proximity rather than fixed array index to avoid contradictions.
function medianIndex(peers: PeerEntry[], medianValue: number | null): number {
  if (peers.length === 0 || medianValue === null) return -1
  let best = 0, bestDist = Infinity
  for (let i = 0; i < peers.length; i++) {
    const d = Math.abs(peers[i].repr_current - medianValue)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// ── Component ──────────────────────────────────────────────────────────────

export function StringCellDetail({
  apiPath,
  deviceId,
  stringNumber,
  date,
  onClose,
  isAdmin = false,
}: StringCellDetailProps) {
  const [data, setData] = useState<StringCellDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    const url = `${apiPath}?device_id=${encodeURIComponent(deviceId)}&string_number=${stringNumber}&date=${date}`
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((json: StringCellDetailData) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load detail')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [apiPath, deviceId, stringNumber, date])

  // Return focus to previous element when dialog unmounts (I-b part 1)
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    return () => { prevFocus?.focus?.() }
  }, [])

  // Ref for Tab-trap (I-b part 2)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape key + Tab trap
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    },
    [onClose],
  )
  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Panel structure (slate-900/50 overlay + centred modal) ──────────────
  return (
    // Overlay — click outside to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`String detail: PV${stringNumber} on ${date}`}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl mx-4"
      >
        {/* Top accent bar — matches dashboard cards */}
        <div className="h-[3px] bg-gradient-to-r from-solar-gold-400 via-solar-gold-500 to-solar-gold-600 rounded-t-lg" />

        {/* Close button — autoFocus moves keyboard focus into the dialog on mount */}
        <button
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-[3px] focus:ring-solar-gold/25"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="px-5 py-4 space-y-5">

          {/* ── Loading state ─────────────────────────────────────────── */}
          {loading && (
            <div className="animate-pulse space-y-3 py-4">
              <div className="h-5 w-3/4 bg-gray-200 rounded" />
              <div className="h-4 w-1/2 bg-gray-200 rounded" />
              <div className="h-32 bg-gray-100 rounded" />
            </div>
          )}

          {/* ── Error state ───────────────────────────────────────────── */}
          {!loading && error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* ── Loaded state ──────────────────────────────────────────── */}
          {!loading && data && (() => {
            const st = STATUS_DISPLAY[data.status] ?? STATUS_DISPLAY.no_data
            const medIdx = medianIndex(data.peers, data.peer_median_current)
            // Hourly sparkline data — extract avg_current values in hour order
            const sparkValues = data.hourly.map((h) => h.avg_current)

            return (
              <>
                {/* 1. Headline */}
                <div className="pr-6">
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {data.device_name ?? data.device_id}
                    <span className="text-slate-400 font-normal mx-1.5">·</span>
                    PV{data.string_number}
                    <span className="text-slate-400 font-normal mx-1.5">·</span>
                    {data.date}
                    <span className="text-slate-400 font-normal mx-1.5">—</span>
                    Performance{' '}
                    <span className="font-mono">{data.performance !== null ? `${data.performance}%` : '—'}</span>
                  </h2>
                  <div className="mt-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border',
                        st.fg, st.bg, st.border,
                      )}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>

                {/* 2. Arithmetic line or status reason */}
                <div className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3">
                  {data.performance !== null ? (() => {
                    const trueRatioPct = data.peer_median_current
                      ? Math.round((data.repr_current! / data.peer_median_current) * 100)
                      : null
                    const isCapped = trueRatioPct !== null && trueRatioPct !== data.performance
                    // §6.6: the customer sees MIN(%,100) — never the uncapped >100 ratio
                    // (that's admin/DB-side). When capped, a customer gets a clean
                    // "at/above peers" line; admins see the full division incl. the raw %.
                    if (isCapped && !isAdmin) {
                      return (
                        <p className="text-sm text-slate-700">
                          PV{data.string_number} is producing{' '}
                          <span className="font-bold text-emerald-700">at or above</span>{' '}
                          its inverter peers — shown as{' '}
                          <span className="font-bold font-mono text-emerald-700">{data.performance}%</span>.
                        </p>
                      )
                    }
                    return (
                      <p className="text-sm text-slate-700 font-mono">
                        PV{data.string_number} current{' '}
                        <span className="font-bold text-blue-700">{fmtA(data.repr_current)} A</span>
                        <span className="text-slate-400 mx-2">÷</span>
                        inverter median{' '}
                        <span className="font-bold text-violet-700">{fmtA(data.peer_median_current)} A</span>
                        <span className="text-slate-400 mx-2">=</span>
                        <span className="font-bold text-emerald-700">{trueRatioPct !== null ? `${trueRatioPct}%` : `${data.performance}%`}</span>
                        {isCapped && (
                          <span className="text-slate-500 font-normal ml-2 text-xs">
                            (capped at {data.performance}% for display)
                          </span>
                        )}
                      </p>
                    )
                  })() : (
                    <p className="text-sm text-slate-500 italic">
                      {nullReason(data.status)}
                    </p>
                  )}

                  {/* §6 ADMIN-only raw-% sensor-fault flag. The customer cell shows
                      MIN(%,100); admins additionally see the uncapped raw % when it
                      exceeds the display cap — an impossibly-high reading (e.g. a
                      faulty current sensor at ~300%) flagged for review. Gated to
                      admin context via the isAdmin prop; customer view stays clean. */}
                  {shouldFlagRawSensorFault(isAdmin, data.raw_performance) && (
                    <div className="mt-2.5 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                      <span className="mt-px text-[9px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 border border-rose-200 rounded px-1.5 py-0.5 shrink-0">
                        Admin
                      </span>
                      <p className="text-xs leading-snug text-rose-800">
                        Raw (uncapped) performance{' '}
                        <span className="font-mono font-bold">{Math.round(data.raw_performance as number)}%</span>{' '}
                        exceeds {SENSOR_FAULT_RAW_PCT}% of the peer median — physically
                        implausible, likely a faulty current sensor, flagged for review.
                        Customer view shows {PERF_DISPLAY_MAX}%.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2b. Historical own-trend — only for peer-excluded strings.
                    Peer comparison is unfair for known-shaded / differently
                    oriented strings, so we show today vs the string's OWN ~30-day
                    normal. INFORMATIONAL: not a fault, not alerted, and (V1) NOT
                    weather-adjusted, so a cloudy day legitimately reads lower. */}
                {data.status === 'peer_excluded' && data.historical && (
                  <div className="rounded-md border border-indigo-200 bg-indigo-50/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                        Known Shaded / Different Orientation — Historical Monitoring
                      </h3>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5">
                        Informational
                      </span>
                    </div>
                    {data.historical.baseline !== null ? (
                      <>
                        <p className="text-sm text-slate-700 font-mono">
                          Today{' '}
                          <span className="font-bold text-blue-700">{fmtA(data.historical.todayRepr)} A</span>
                          <span className="text-slate-400 mx-2">vs</span>
                          its own ~30-day normal{' '}
                          <span className="font-bold text-violet-700">{fmtA(data.historical.baseline)} A</span>
                          {data.historical.pct !== null && (
                            <>
                              <span className="text-slate-400 mx-2">=</span>
                              <span className="font-bold text-indigo-700">{data.historical.pct}%</span>
                            </>
                          )}
                        </p>
                        <p className="text-[10px] leading-snug text-slate-500 mt-1.5">
                          {data.historical.pct === null
                            ? 'No scored reading today, so no ratio yet — the baseline shown is established.'
                            : null}
                          {' '}Self-referenced trend ({data.historical.source === 'manual' ? 'manual baseline' : '30-day own median'}).
                          Not compared to peers and <span className="font-semibold">not weather-adjusted</span> — a low-irradiance
                          day will read lower without being a fault. No alert is raised from this value.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500 italic">
                        Not enough own history yet to establish a baseline. Set a manual baseline current in
                        string config, or wait for ~30 days of data.
                      </p>
                    )}
                  </div>
                )}

                {/* 3. Peer table — only when the string was actually scored;
                    on no_data (performance === null) the peer table is misleading
                    (no median to highlight), so suppress it entirely. Peer-excluded
                    strings always have performance === null, so the peer table is
                    already suppressed for them — the historical panel above replaces it. */}
                {data.performance !== null && data.peers.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      Peer Strings — same inverter, same day
                    </h3>
                    <p className="text-[10px] leading-snug text-slate-400 mb-2">
                      <span className="font-semibold">Repr. Current</span> = the <span className="font-semibold">median</span> of each string&apos;s hourly readings during the 8 AM–4 PM window (not a single reading). Each string reports every few minutes → averaged per hour → the middle hour is its representative value.
                    </p>
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-1.5 text-left font-semibold text-slate-600">String</th>
                            <th className="px-3 py-1.5 text-right font-semibold text-slate-600">Repr. Current</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-slate-600 w-20">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.peers.map((peer, idx) => {
                            const isThis   = peer.string_number === data.string_number
                            const isMedian = idx === medIdx
                            return (
                              <tr
                                key={peer.string_number}
                                className={cn(
                                  'border-b border-slate-100 last:border-0',
                                  isThis   && 'bg-blue-50',
                                  isMedian && !isThis && 'bg-violet-50',
                                )}
                              >
                                <td className="px-3 py-1.5 font-mono font-semibold text-slate-700">
                                  PV{peer.string_number}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                                  {peer.repr_current.toFixed(2)} A
                                </td>
                                <td className="px-3 py-1.5">
                                  {isThis && isMedian ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="text-[9px] font-bold text-blue-700 bg-blue-100 border border-blue-200 rounded px-1 py-0.5">This string</span>
                                      <span className="text-[9px] font-bold text-violet-700 bg-violet-100 border border-violet-200 rounded px-1 py-0.5">Median</span>
                                    </span>
                                  ) : isThis ? (
                                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 border border-blue-200 rounded px-1 py-0.5">This string</span>
                                  ) : isMedian ? (
                                    <span className="text-[9px] font-bold text-violet-700 bg-violet-100 border border-violet-200 rounded px-1 py-0.5">Median</span>
                                  ) : null}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. Hourly curve — Sparkline with area variant */}
                {sparkValues.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                      Hourly Current Curve
                    </h3>
                    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                      {/* CSS-bars variant — no recharts ResponsiveContainer measure/mount
                          cycle on every open, so the panel renders instantly. The hourly
                          curve is only a handful of points; bars read it fine. */}
                      <Sparkline
                        data={sparkValues}
                        color="#2563eb"
                        height={80}
                        variant="bars"
                      />
                      {/* Hour labels: first + last */}
                      {data.hourly.length >= 2 && (
                        <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-400">
                          <span>{new Date(data.hourly[0].hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })}</span>
                          <span>{new Date(data.hourly[data.hourly.length - 1].hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">
                      {sparkValues.length} window hours (8 AM–4 PM) · each point = the average of that hour&apos;s readings (A)
                    </p>
                  </div>
                )}

                {/* 5. Data Completeness — Reyyan §9 + §10. A SEPARATE data-QUALITY
                    axis: "Show this separately from performance. Do NOT merge
                    performance and data completeness." Distinct cool/neutral chip
                    (completenessStyleFromPct) so it never reads as a performance
                    score. Informational only — completeness is never itself a
                    fault. null (legacy / no-data day) → muted "not available",
                    NOT a 0%. */}
                {(() => {
                  const compStyle = completenessStyleFromPct(data.data_completeness)
                  return (
                    <div className="rounded-md border border-slate-100 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Data Completeness
                        </h3>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                          Data quality
                        </span>
                      </div>
                      {data.data_completeness != null && compStyle ? (
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold font-mono text-slate-800">
                            {fmtCompletenessPct(data.data_completeness)}
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border',
                              compStyle.fg, compStyle.bg, compStyle.border,
                            )}
                          >
                            {compStyle.label}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">
                          <span className="font-mono not-italic mr-1">—</span>not available for this day
                        </p>
                      )}
                      <p className="text-[10px] leading-snug text-slate-500 mt-1.5">
                        Readings received vs the 96 expected across the 8 AM–4 PM window.
                        This is a measure of <span className="font-semibold">data quality</span>, separate from
                        performance — it is not itself a fault.
                      </p>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
