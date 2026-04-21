import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { Sparkline } from './Sparkline'

/**
 * SPC KpiCard — v4 Solar Corporate (DESIGN.md §12.2).
 * White card · 2px top accent bar · icon chip · mono value · optional sparkline + delta.
 */
interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  accent?: 'green' | 'amber' | 'red' | 'gray' | 'gold' | 'blue'
  sparkline?: (number | null)[]
  deltaPercent?: number | null
  deltaContext?: string | null
  className?: string
  onClick?: () => void
}

const ACCENT_BAR: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-300',
  gold: 'bg-solar-gold',
  blue: 'bg-blue-500',
}

const SPARKLINE_COLOR: Record<string, string> = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  gray: '#94A3B8',
  gold: '#F59E0B',
  blue: '#0EA5E9',
}

const ICON_CHIP: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  gray: 'bg-slate-100 text-slate-500',
  gold: 'bg-solar-gold-50 text-solar-gold-600',
  blue: 'bg-blue-50 text-blue-600',
}

const HOVER_BORDER: Record<string, string> = {
  green: 'hover:border-emerald-300',
  amber: 'hover:border-amber-300',
  red: 'hover:border-red-300',
  gray: 'hover:border-slate-300',
  gold: 'hover:border-solar-gold-300',
  blue: 'hover:border-blue-300',
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'gold',
  sparkline,
  deltaPercent,
  deltaContext,
  className,
  onClick,
}: KpiCardProps) {
  const hasDelta =
    deltaPercent !== undefined &&
    deltaPercent !== null &&
    !isNaN(deltaPercent) &&
    deltaPercent !== 0
  const isPositive = hasDelta && (deltaPercent ?? 0) >= 0
  const sparkValues = sparkline?.map((v) => (v ?? 0)) ?? []
  const hasSparkline = sparkValues.length > 0 && sparkValues.some((v) => v > 0)

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-white rounded-md border border-slate-200 overflow-hidden transition-all',
        onClick && cn('cursor-pointer hover:shadow-card', HOVER_BORDER[accent]),
        className,
      )}
    >
      {/* Top accent bar */}
      <div className={cn('h-[2px]', ACCENT_BAR[accent])} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {title}
          </span>
          {Icon && (
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-md',
                ICON_CHIP[accent],
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-[28px] font-mono font-bold leading-none text-slate-900">
            {value}
          </p>
          {hasDelta && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-[11px] font-bold font-mono',
                isPositive ? 'text-emerald-700' : 'text-red-700',
              )}
              title={deltaContext || undefined}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
              )}
              {isPositive ? '+' : ''}
              {Math.round(deltaPercent ?? 0)}%
            </span>
          )}
        </div>

        {subtitle && (
          <p className="text-[11px] font-medium text-slate-500 mb-2 truncate">{subtitle}</p>
        )}

        {hasDelta && deltaContext && (
          <p className="text-[10px] font-medium text-slate-400 mb-1 truncate">{deltaContext}</p>
        )}

        {hasSparkline && (
          <div className="mt-2 -mx-1">
            <Sparkline
              data={sparkValues}
              variant="area"
              color={SPARKLINE_COLOR[accent]}
              height={28}
            />
          </div>
        )}
      </div>
    </div>
  )
}
