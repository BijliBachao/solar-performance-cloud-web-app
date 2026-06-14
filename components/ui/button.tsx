import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SPC Button — v3 Solar Corporate (DESIGN.md §9)
 *
 * `default` = filled indigo primary CTA
 * `outline` = neutral hairline-bordered secondary
 * `ghost` = text-only inline/table action
 * `destructive` = filled red for delete/remove
 * `link` = inline text-link style
 *
 * Rules: pill radius, 14px weight 500, indigo focus ring (shadow-focus)
 * ONE primary CTA per fold — if two filled buttons are visible, one is wrong.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-pill text-sm font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-press shadow-sm',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
        outline:
          'bg-canvas border border-hairline text-ink hover:bg-canvas-soft hover:border-primary',
        secondary:
          'bg-canvas-soft text-ink hover:bg-slate-200',
        ghost:
          'bg-transparent text-ink-secondary hover:bg-canvas-soft hover:text-ink',
        link:
          'text-primary underline-offset-4 hover:underline hover:text-primary-press',
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
