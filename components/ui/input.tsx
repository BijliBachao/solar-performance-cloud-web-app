import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 file:border-0 file:bg-transparent file:text-sm file:font-medium transition-colors focus-visible:outline-none focus-visible:border-solar-gold focus-visible:ring-[3px] focus-visible:ring-solar-gold/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
