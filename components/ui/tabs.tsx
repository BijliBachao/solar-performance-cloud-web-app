'use client'
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

/**
 * SPC Tabs — DESIGN.md §4 underline-style (not pill).
 * TabsList is a bottom-bordered container.
 * TabsTrigger draws a 2px bottom accent on hover and a spc-green accent when active.
 */

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-auto items-center justify-start border-b border-slate-200 gap-2',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600 border-b-2 border-transparent -mb-px transition-colors',
      'hover:text-slate-900 hover:border-slate-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spc-green focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:text-spc-green data-[state=active]:border-spc-green data-[state=active]:font-bold',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spc-green focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
