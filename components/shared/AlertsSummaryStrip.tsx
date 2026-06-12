'use client'

/**
 * AlertsSummaryStrip — a compact one-line at-a-glance severity tally.
 *
 * Renders `● N Critical   ● N Watch   ● N Info` from the feed's `counts` (true
 * severity totals over the FULL filtered, UNGROUPED set — so a ×7 grouped row
 * still contributes 7 to its severity here). Severity colours come ONLY from
 * the design tokens (STATUS_STYLES) — no inline hex. Shared by BOTH the admin
 * and customer Alerts pages so the strip can never drift between surfaces.
 */

import { STATUS_STYLES, type StatusKey } from '@/lib/design-tokens'

export interface SeverityCounts {
  critical: number
  warning: number
  info: number
}

// Display order + token key + label. WARNING is shown as "Watch" to match the
// V1 perf-band vocabulary the rest of the app uses.
const STRIP: Array<{ key: StatusKey; label: string; count: (c: SeverityCounts) => number }> = [
  { key: 'critical', label: 'Critical', count: (c) => c.critical },
  { key: 'warning', label: 'Watch', count: (c) => c.warning },
  { key: 'info', label: 'Info', count: (c) => c.info },
]

export function AlertsSummaryStrip({ counts }: { counts: SeverityCounts | null | undefined }) {
  if (!counts) return null

  return (
    <div className="flex items-center gap-5 text-[12px] font-semibold text-slate-700">
      {STRIP.map(({ key, label, count }) => {
        const style = STATUS_STYLES[key]
        return (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
            <span className="tabular-nums">{count(counts).toLocaleString()}</span>
            <span className="text-slate-500 font-medium">{label}</span>
          </span>
        )
      })}
    </div>
  )
}
