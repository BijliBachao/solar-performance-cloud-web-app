'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/user')
        if (!res.ok) { router.push('/sign-in'); return }
        const data = await res.json()
        if (data.profile.role === 'SUPER_ADMIN') { router.push('/admin'); return }
        if (!data.profile.organizationId) { router.push('/pending-assignment'); return }
        setAuthorized(true)
      } catch { router.push('/sign-in') }
    }
    checkAuth()
  }, [router])

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#76b900] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#898989]">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <Sidebar role="user" />
      <div className="ml-60">
        <TopBar />
        <main>{children}</main>
      </div>
    </div>
  )
}
