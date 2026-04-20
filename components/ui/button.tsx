import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SPC Button — DESIGN.md §4
 *
 * `default` = NVIDIA-style outlined-green CTA (transparent bg, 2px green border,
 * fills green on hover). This is the primary industrial voice.
 * `destructive` = same pattern in red.
 * `outline` = neutral slate-bordered secondary button.
 * `secondary` = soft slate-filled, for tertiary emphasis.
 * `ghost` = text-only, for inline / header actions.
 * `link` = green underlined link.
 *
 * All buttons: 2px radius, weight 700, spc-green focus ring.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm text-sm font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spc-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-transparent border-2 border-spc-green text-slate-900 hover:bg-spc-green hover:text-white active:bg-spc-green-dark active:border-spc-green-dark',
        destructive:
          'bg-transparent border-2 border-red-600 text-red-700 hover:bg-red-600 hover:text-white',
        outline:
          'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400',
        secondary:
          'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost:
          'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        link:
          'text-spc-green underline-offset-4 hover:underline hover:text-spc-green-dark',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-sm px-3',
        lg: 'h-11 rounded-sm px-8',
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
