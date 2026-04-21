import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

/**
 * SPC KpiCard — v3 Solar Corporate (DESIGN.md §12.2).
 * White card with top accent bar, labeled, mono value, icon chip.
 */
interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  accent?: 'green' | 'amber' | 'red' | 'gray' | 'gold' | 'blue'
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
  className,
  onClick,
}: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-white rounded-md border border-slate-200 overflow-hidden transition-colors',
        onClick && cn('cursor-pointer', HOVER_BORDER[accent]),
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

        <p className="text-[28px] font-mono font-bold leading-none text-slate-900">
          {value}
        </p>

        {subtitle && (
          <p className="mt-2 text-[11px] font-medium text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
