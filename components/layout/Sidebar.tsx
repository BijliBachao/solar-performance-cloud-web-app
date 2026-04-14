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
  const isUserDashboard = role === 'user'

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 h-screen w-60 border-r',
      isUserDashboard
        ? 'bg-[#1a1a1a] border-[#333]'
        : 'bg-white border-gray-200'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex h-14 items-center gap-2.5 border-b px-5',
        isUserDashboard ? 'border-[#333]' : 'border-gray-200'
      )}>
        <div className={cn(
          'flex items-center justify-center w-8 h-8 rounded-sm',
          isUserDashboard ? 'bg-[#76b900]/20' : 'bg-primary-50'
        )}>
          <Sun className={cn(
            'h-5 w-5',
            isUserDashboard ? 'text-[#76b900]' : 'text-primary-500'
          )} />
        </div>
        <div>
          <h1 className={cn(
            'text-sm font-bold leading-tight',
            isUserDashboard ? 'text-white' : 'text-gray-900'
          )}>
            Solar Performance
          </h1>
          <p className={cn(
            'text-[10px] font-semibold uppercase tracking-wider',
            isUserDashboard ? 'text-[#76b900]' : 'text-gray-500'
          )}>
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
                    'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold transition-colors',
                    isUserDashboard
                      ? isActive
                        ? 'bg-[#76b900]/10 text-[#76b900] border-l-2 border-[#76b900] -ml-px'
                        : 'text-[#a7a7a7] hover:bg-[#252525] hover:text-white'
                      : isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      {isUserDashboard && (
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 border-t border-[#333]">
          <p className="text-[10px] font-semibold text-[#525252] uppercase tracking-wider">Powered by</p>
          <p className="text-xs font-bold text-[#a7a7a7]">Bijli Bachao</p>
        </div>
      )}
    </aside>
  )
}
