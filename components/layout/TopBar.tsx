'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
// DISABLED 2026-06-12 (per Ali — sun-elevation UI hidden for now; re-enable by
// uncommenting this import + the <SunElevationChip/> render below):
// import { SunElevationChip } from '@/components/shared/SunElevationChip'

interface TopBarProps {
  title?: string
  userFullName?: string
  userRole?: string
  orgName?: string
  showAlertBell?: boolean
}

function usePKTClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const fmt = () => {
      const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const h = String(pkt.getUTCHours()).padStart(2, '0')
      const m = String(pkt.getUTCMinutes()).padStart(2, '0')
      return `${days[pkt.getUTCDay()]} ${pkt.getUTCDate()} ${months[pkt.getUTCMonth()]} · ${h}:${m} PKT`
    }
    setTime(fmt())
    const id = setInterval(() => setTime(fmt()), 30000)
    return () => clearInterval(id)
  }, [])
  return time
}

export function TopBar({ title, userFullName, userRole, orgName, showAlertBell }: TopBarProps) {
  const time = usePKTClock()
  const [alertCount, setAlertCount] = useState<number | null>(null)

  useEffect(() => {
    if (!showAlertBell) return
    const fetch_ = () =>
      fetch('/api/alerts/summary', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setAlertCount((d.active?.critical ?? 0) + (d.active?.warning ?? 0)))
        .catch(() => {})
    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [showAlertBell])

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-canvas px-6">

      {/* Left: page title */}
      <div>
        {title && <h2 className="text-base font-medium leading-tight tracking-tight text-ink">{title}</h2>}
      </div>

      {/* Right: clock · bell · user · avatar */}
      <div className="flex items-center gap-3">

        {/* Live PKT clock */}
        {time && (
          <span className="hidden md:block text-[11px] font-normal text-ink-mute tabular-nums select-none">
            {time}
          </span>
        )}

        {/* DISABLED 2026-06-12 (per Ali — sun-elevation chip hidden for now). Re-enable
            by uncommenting the import above + the line below:
            Live regional sun elevation — explained why early-morning string data is blank.
            <SunElevationChip /> */}

        <span className="hidden md:block w-px h-4 bg-hairline" />

        {/* Alert bell */}
        {showAlertBell && (
          <Link
            href="/dashboard/alerts"
            className="relative flex items-center justify-center w-8 h-8 rounded-md text-ink-secondary hover:bg-canvas-soft hover:text-ink transition-colors"
            title="Alerts"
          >
            <Bell className="w-[17px] h-[17px]" strokeWidth={1.8} />
            {alertCount !== null && alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold tabular-nums leading-none">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </Link>
        )}

        <span className="w-px h-4 bg-hairline" />

        {/* User name + role */}
        {userFullName && (
          <div className="hidden sm:flex flex-col items-end leading-tight gap-0.5">
            <span className="text-[13px] font-medium text-ink leading-none">{userFullName}</span>
            {orgName && (
              <span className="text-[10px] font-normal text-ink-mute leading-none">{orgName}</span>
            )}
            {roleLabel && (
              <span className={cn('text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-pill leading-none', roleCls)}>
                {roleLabel}
              </span>
            )}
          </div>
        )}

        {/* Clerk avatar — click for sign-out / profile */}
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{ elements: { avatarBox: 'h-8 w-8' } }}
        />
      </div>
    </header>
  )
}
