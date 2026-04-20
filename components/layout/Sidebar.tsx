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

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'admin' ? adminNav : userNav

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-slate-700 bg-slate-900">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-700 px-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-spc-green/10">
          <Sun className="h-5 w-5 text-spc-green" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-white">
            Solar Performance
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-spc-green">
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
                    'flex items-center gap-3 rounded-sm px-3 py-2.5 text-[13px] font-bold uppercase tracking-wide transition-colors',
                    isActive
                      ? 'bg-spc-green/10 text-spc-green border-l-2 border-spc-green -ml-px'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50',
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Powered by
        </p>
        <p className="text-xs font-bold text-slate-300">Bijli Bachao</p>
      </div>
    </aside>
  )
}
