'use client'

import Link from 'next/link'
import { AlertTriangle, XCircle, Info, Clock, ArrowRight, CheckCircle } from 'lucide-react'
import { STATUS_STYLES, statusKeyFromSeverity } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface AlertsInsightPanelProps {
  totals: { critical: number; warning: number; info: number; total: number }
  topIssues: Array<{ plant_id: string; plant_name: string; alertCount: number }>
  recentActivity: Array<{
    id: number
    severity: string
    plant_id: string
    plant_name: string
    string_number: number
    timestamp: string
    type: 'created' | 'resolved'
  }>
}

/**
 * SPC AlertsInsightPanel — structured insight (not a list).
 * Severity breakdown + top issues + recent activity feed.
 */
export function AlertsInsightPanel({
  totals,
  topIssues,
  recentActivity,
}: AlertsInsightPanelProps) {
  const allClear = totals.total === 0 && topIssues.length === 0

  return (
    <div className="bg-white rounded-md border border-slate-200 overflow-hidden h-fit">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-solar-gold" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Alerts Overview
          </h2>
        </div>
        <Link
          href="/dashboard/alerts"
          className="flex items-center gap-1 text-[11px] font-bold text-solar-gold-700 hover:text-solar-gold-800 transition-colors"
        >
          View All <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>

      {/* Severity grid */}
      <div className="grid grid-cols-3 border-b border-slate-200 divide-x divide-slate-100">
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <XCircle className="h-3 w-3 text-red-600" strokeWidth={2} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Critical
            </span>
          </div>
          <div
            className={cn(
              'text-xl font-mono font-bold',
              totals.critical > 0 ? 'text-red-700' : 'text-slate-300',
            )}
          >
            {totals.critical}
          </div>
        </div>
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3 text-amber-600" strokeWidth={2} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Warning
            </span>
          </div>
          <div
            className={cn(
              'text-xl font-mono font-bold',
              totals.warning > 0 ? 'text-amber-700' : 'text-slate-300',
            )}
          >
            {totals.warning}
          </div>
        </div>
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Info className="h-3 w-3 text-blue-600" strokeWidth={2} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Info
            </span>
          </div>
          <div
            className={cn(
              'text-xl font-mono font-bold',
              totals.info > 0 ? 'text-blue-700' : 'text-slate-300',
            )}
          >
            {totals.info}
          </div>
        </div>
      </div>

      {/* All clear state */}
      {allClear && (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle className="h-6 w-6 text-emerald-600" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-slate-700">All systems healthy</p>
          <p className="text-xs text-slate-500 mt-1">No active alerts right now.</p>
        </div>
      )}

      {/* Top issues */}
      {topIssues.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Top Issues
          </h3>
          <div className="space-y-2">
            {topIssues.map((issue, idx) => (
              <Link
                key={issue.plant_id}
                href={`/dashboard/plants/${issue.plant_id}`}
                className="flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-medium text-slate-700 truncate group-hover:text-solar-gold-700 transition-colors">
                    {issue.plant_name}
                  </span>
                </div>
                <span className="text-[11px] font-bold font-mono text-red-700 shrink-0">
                  {issue.alertCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="px-5 py-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Recent Activity
          </h3>
          <div className="space-y-2.5">
            {recentActivity.slice(0, 5).map((event) => {
              const key = statusKeyFromSeverity(event.severity)
              const style = STATUS_STYLES[key]
              return (
                <div key={event.id} className="flex items-start gap-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', style.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-700 truncate">
                      <span className="font-semibold">{event.plant_name}</span>
                      <span className="text-slate-400"> · PV{event.string_number}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                      <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                      <span>
                        {event.type === 'resolved' ? 'Resolved' : 'Created'}{' '}
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
