import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SPC Button — v3 Solar Corporate (DESIGN.md §9)
 *
 * `default` = filled solar-gold primary CTA
 * `outline` = neutral slate-bordered secondary
 * `ghost` = text-only inline/table action
 * `destructive` = filled red for delete/remove
 * `link` = inline text-link style
 *
 * Rules: 4px radius (rounded), 14px weight 600, solar-gold focus ring @ 25%
 * ONE primary CTA per fold — if two filled buttons are visible, one is wrong.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded text-sm font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-solar-gold/25 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-solar-gold text-white hover:bg-solar-gold-600 active:bg-solar-gold-700 shadow-sm',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
        outline:
          'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300',
        secondary:
          'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost:
          'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        link:
          'text-solar-gold-600 underline-offset-4 hover:underline hover:text-solar-gold-700',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
