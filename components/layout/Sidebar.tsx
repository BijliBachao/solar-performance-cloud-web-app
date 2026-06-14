'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Building2, Users, Zap,
  Bell, Settings, Sun, BarChart3, Activity, HeartPulse,
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
      { href: '/admin/recovery',         label: 'Recovery',       icon: HeartPulse },
      { href: '/admin/plants',           label: 'Plants',         icon: Zap },
      { href: '/admin/noc',              label: 'NOC',            icon: Activity },
      { href: '/admin/alerts',           label: 'Alerts',         icon: Bell },
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
      ? 'bg-primary-subtle text-primary-press'
      : 'bg-canvas-soft text-ink-mute'

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-canvas border-r border-hairline flex flex-col">

      {/* ── Logo ──────────────────────────────────────── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-5 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-card bg-gradient-to-br from-primary-soft via-primary to-primary-press shadow-card">
          <Sun className="h-[18px] w-[18px] text-on-primary" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-sm font-medium leading-tight tracking-tight text-ink">Solar Performance</h1>
          <p className="text-[10px] font-medium uppercase tracking-widest text-ink-mute">Cloud</p>
        </div>
      </div>

      {/* ── Plant count stat ──────────────────────────── */}
      {typeof plantCount === 'number' && plantCount > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-hairline bg-canvas-soft shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[11px] font-medium text-ink-mute tabular-nums">
            {plantCount} plant{plantCount !== 1 ? 's' : ''} monitored
          </span>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {sections.map((section, si) => (
          <div key={section.label} className={cn(si > 0 && 'mt-5')}>
            <p className="px-3 mb-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-ink-mute select-none">
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
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors relative',
                        isActive
                          ? 'bg-primary-subtle text-primary-press font-medium'
                          : 'text-ink-secondary font-normal hover:bg-canvas-soft hover:text-ink',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />
                      )}
                      <item.icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0',
                          isActive ? 'text-primary' : 'text-ink-mute',
                        )}
                        strokeWidth={1.8}
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
      <div className="shrink-0 border-t border-hairline px-4 py-3">
        {userFullName ? (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[12px] font-medium text-ink truncate leading-tight">
              {userFullName}
            </span>
            {orgName && (
              <span className="text-[10px] font-normal text-ink-mute truncate leading-tight">
                {orgName}
              </span>
            )}
            {roleLabel && (
              <span className={cn(
                'text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-pill w-fit mt-0.5',
                roleCls,
              )}>
                {roleLabel}
              </span>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-ink-mute">Powered by</p>
            <p className="text-xs font-medium text-ink">Bijli Bachao</p>
          </div>
        )}
      </div>
    </aside>
  )
}
