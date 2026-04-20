'use client'
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/**
 * SPC Tooltip — DESIGN.md §4 spec: deep-slate background, light text,
 * 2px radius, compact padding. Intentionally dark for contrast against
 * any light surface it hovers above.
 */

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-sm bg-slate-900 px-2.5 py-1.5 text-xs text-slate-50 shadow-modal animate-in fade-in-0 zoom-in-95',
      className,
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
