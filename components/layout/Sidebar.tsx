'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Building2, Users, Zap,
  Bell, Settings, Sun, BarChart3,
} from 'lucide-react'

interface SidebarProps {
  role: 'admin' | 'user'
  userFullName?: string
  userRole?: string
  orgName?: string
  plantCount?: number
}

const adminSections = [
  {
    label: 'MANAGEMENT',
    items: [
      { href: '/admin',                  label: 'Overview',       icon: LayoutDashboard },
      { href: '/admin/organizations',    label: 'Organizations',  icon: Building2 },
      { href: '/admin/users',            label: 'Users',          icon: Users },
      { href: '/admin/plants',           label: 'Plants',         icon: Zap },
      { href: '/admin/analysis',         label: 'Analysis',       icon: BarChart3 },
    ],
  },
]

const userSections = [
  {
    label: 'MONITORING',
    items: [
      { href: '/dashboard',              label: 'Overview',       icon: LayoutDashboard },
      { href: '/dashboard/analysis',     label: 'Analysis',       icon: BarChart3 },
      { href: '/dashboard/alerts',       label: 'Alerts',         icon: Bell },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { href: '/dashboard/settings',     label: 'Settings',       icon: Settings },
    ],
  },
]

export function Sidebar({ role, userFullName, userRole, orgName, plantCount }: SidebarProps) {
  const pathname = usePathname()
  const sections = role === 'admin' ? adminSections : userSections

  const roleLabel =
    userRole === 'SUPER_ADMIN' ? 'Super Admin'
    : userRole === 'ORG_ADMIN' ? 'Admin'
    : userRole ? 'Viewer'
    : null

  const roleCls =
    userRole === 'SUPER_ADMIN'
      ? 'bg-solar-gold/10 text-solar-gold-700'
      : 'bg-slate-100 text-slate-600'

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-white border-r border-slate-200 flex flex-col">

      {/* ── Logo ──────────────────────────────────────── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-5 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-solar-gold-50">
          <Sun className="h-5 w-5 text-solar-gold-600" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900">Solar Performance</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-solar-gold-600">Cloud</p>
        </div>
      </div>

      {/* ── Plant count stat ──────────────────────────── */}
      {typeof plantCount === 'number' && plantCount > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-500">
            {plantCount} plant{plantCount !== 1 ? 's' : ''} monitored
          </span>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {sections.map((section, si) => (
          <div key={section.label} className={cn(si > 0 && 'mt-5')}>
            <p className="px-3 mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 select-none">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
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
          </div>
        ))}
      </nav>

      {/* ── User card (bottom) ────────────────────────── */}
      <div className="shrink-0 border-t border-slate-200 px-4 py-3">
        {userFullName ? (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[12px] font-bold text-slate-800 truncate leading-tight">
              {userFullName}
            </span>
            {orgName && (
              <span className="text-[10px] font-semibold text-slate-400 truncate leading-tight">
                {orgName}
              </span>
            )}
            {roleLabel && (
              <span className={cn(
                'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm w-fit mt-0.5',
                roleCls,
              )}>
                {roleLabel}
              </span>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Powered by</p>
            <p className="text-xs font-bold text-slate-700">Bijli Bachao</p>
          </div>
        )}
      </div>
    </aside>
  )
}
