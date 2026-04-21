'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  Zap,
  Bell,
  Settings,
  Sun,
  BarChart3,
} from 'lucide-react'

interface SidebarProps {
  role: 'admin' | 'user'
}

const adminNav = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/plants', label: 'Plants', icon: Zap },
  { href: '/admin/analysis', label: 'Analysis', icon: BarChart3 },
]

const userNav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/analysis', label: 'Analysis', icon: BarChart3 },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

/**
 * SPC Sidebar — v3 white with solar-gold active accent (DESIGN.md §22).
 * Vodafone discipline: white on white app surface, separated by slate-200 border.
 */
export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'admin' ? adminNav : userNav

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-solar-gold-50">
          <Sun className="h-5 w-5 text-solar-gold-600" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900">
            Solar Performance
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-solar-gold-600">
            Cloud
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-4 px-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin' || item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-semibold transition-colors relative',
                    isActive
                      ? 'bg-solar-gold-50 text-solar-gold-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  {/* Active left accent bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-solar-gold" />
                  )}
                  <item.icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      isActive ? 'text-solar-gold-600' : 'text-slate-500',
                    )}
                    strokeWidth={2}
                  />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Powered by
        </p>
        <p className="text-xs font-bold text-slate-700">Bijli Bachao</p>
      </div>
    </aside>
  )
}
