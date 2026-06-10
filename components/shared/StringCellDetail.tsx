'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'

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

interface AvailabilityInfo {
  producingHours: number
  sunUpHours: number
  pct: number | null
}

interface StringCellDetailData {
  device_id: string
  device_name: string | null
  string_number: number
  date: string
  status: CellStatus
  performance: number | null
  repr_current: number | null
  peer_median_current: number | null
  peers: PeerEntry[]
  hourly: HourlyEntry[]
  availability: AvailabilityInfo | null
}

// ── Props ──────────────────────────────────────────────────────────────────

interface StringCellDetailProps {
  apiPath: string
  deviceId: string
  stringNumber: number
  date: string
  onClose: () => void
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
                            (Performance capped at {data.performance}% for display)
                          </span>
                        )}
                      </p>
                    )
                  })() : (
                    <p className="text-sm text-slate-500 italic">
                      {nullReason(data.status)}
                    </p>
                  )}
                </div>

                {/* 3. Peer table — only when the string was actually scored;
                    on no_data (performance === null) the peer table is misleading
                    (no median to highlight), so suppress it entirely. */}
                {data.performance !== null && data.peers.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                      Peer Strings — same inverter, same day
                    </h3>
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
                      <Sparkline
                        data={sparkValues}
                        color="#2563eb"
                        height={80}
                        variant="area"
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
                      {sparkValues.length} hourly buckets · avg current (A)
                    </p>
                  </div>
                )}

                {/* 5. Availability */}
                {data.availability && (
                  <div className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                      Availability
                    </h3>
                    <p className="text-sm text-slate-700">
                      Produced in{' '}
                      <span className="font-bold font-mono text-emerald-700">{data.availability.producingHours}</span>
                      {' '}of{' '}
                      <span className="font-bold font-mono text-slate-700">{data.availability.sunUpHours}</span>
                      {' '}sun-up hours
                      {data.availability.pct !== null && (
                        <>
                          {' '}={' '}
                          <span className="font-bold font-mono text-emerald-700">{Math.round(data.availability.pct)}%</span>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
