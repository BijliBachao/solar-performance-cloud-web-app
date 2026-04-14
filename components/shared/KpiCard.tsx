import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  accent?: 'green' | 'amber' | 'red' | 'gray'
  className?: string
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'green',
  className,
}: KpiCardProps) {
  const accentLine = {
    green: 'bg-[#76b900]',
    amber: 'bg-[#ef9100]',
    red: 'bg-[#e52020]',
    gray: 'bg-[#898989]',
  }

  return (
    <div className={cn('bg-[#1a1a1a] rounded-sm overflow-hidden', className)}>
      <div className={cn('h-[2px]', accentLine[accent])} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-[#5e5e5e] uppercase tracking-widest">{title}</span>
          {Icon && <Icon className="h-4 w-4 text-[#5e5e5e]" />}
        </div>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        {subtitle && (
          <p className="mt-1 text-[11px] font-semibold text-[#898989]">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
