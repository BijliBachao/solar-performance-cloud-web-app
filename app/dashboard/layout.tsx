'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

interface UserData {
  first_name: string | null
  last_name: string | null
  plantCount: number
  profile: { role: string; organizationId: string | null; organizationName: string | null }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/user', { credentials: 'include' })
        if (!res.ok) { router.push('/sign-in'); return }
        const data: UserData = await res.json()
        if (data.profile.role === 'SUPER_ADMIN') { router.push('/admin'); return }
        if (!data.profile.organizationId) { router.push('/pending-assignment'); return }
        setUser(data)
        setAuthorized(true)
      } catch { router.push('/sign-in') }
    }
    checkAuth()
  }, [router])

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-solar-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-500">Loading...</span>
        </div>
      </div>
    )
  }

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || undefined

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        role="user"
        userFullName={fullName}
        userRole={user?.profile.role}
        orgName={user?.profile.organizationName ?? undefined}
        plantCount={user?.plantCount}
      />
      <div className="ml-60">
        <TopBar
          userFullName={fullName}
          userRole={user?.profile.role}
          orgName={user?.profile.organizationName ?? undefined}
          showAlertBell
        />
        <main>{children}</main>
      </div>
    </div>
  )
}
