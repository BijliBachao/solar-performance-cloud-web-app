import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SPC Badge — v3 Solar Corporate (DESIGN.md §11).
 * Title Case labels (NOT uppercase — corporate readability).
 * Base: 11px semibold, 2px radius, 1px border.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-solar-gold-50 text-solar-gold-700 border-solar-gold-200',
        secondary: 'bg-slate-100 text-slate-700 border-slate-200',
        destructive: 'bg-red-50 text-red-700 border-red-200',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        warning: 'bg-amber-50 text-amber-700 border-amber-200',
        info: 'bg-blue-50 text-blue-700 border-blue-200',
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
