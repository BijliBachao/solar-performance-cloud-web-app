import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: { value: number; isPositive: boolean }
  accent?: 'green' | 'amber' | 'red' | 'gray'
  className?: string
}

const accentColors = {
  green: 'border-t-[#76b900]',
  amber: 'border-t-[#ef9100]',
  red: 'border-t-[#e52020]',
  gray: 'border-t-[#898989]',
}

const iconBgColors = {
  green: 'bg-[#e8f5d0]',
  amber: 'bg-amber-50',
  red: 'bg-red-50',
  gray: 'bg-gray-100',
}

const iconTextColors = {
  green: 'text-[#76b900]',
  amber: 'text-[#ef9100]',
  red: 'text-[#e52020]',
  gray: 'text-[#898989]',
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent = 'green',
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded border border-[#e5e5e5] border-t-2 p-4',
        accentColors[accent],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#898989]">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#0a0a0a]">{value}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[#898989]">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-1.5 flex items-center text-xs">
              <span
                className={cn(
                  'font-semibold',
                  trend.isPositive ? 'text-[#76b900]' : 'text-[#e52020]'
                )}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-sm p-2', iconBgColors[accent])}>
            <Icon className={cn('h-5 w-5', iconTextColors[accent])} />
          </div>
        )}
      </div>
    </div>
  )
}
