import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SPC Badge — DESIGN.md §3 typography + §4 component spec.
 * Base: 10px bold uppercase tracking-wide, rounded-sm (2px), 1px border.
 * Variants map to the central status palette where applicable so a
 * `<Badge variant="success">` renders identically to `STATUS_STYLES.healthy`.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-spc-green/10 text-spc-green-dark border-spc-green/30',
        secondary: 'bg-slate-100 text-slate-700 border-slate-200',
        destructive: 'bg-red-50 text-red-700 border-red-200',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        warning: 'bg-amber-50 text-amber-700 border-amber-200',
        outline: 'bg-transparent text-slate-600 border-slate-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
