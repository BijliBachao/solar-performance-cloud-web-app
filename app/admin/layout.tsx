'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/user')
        if (!res.ok) { router.push('/sign-in'); return }
        const data = await res.json()
        if (data.profile.role !== 'SUPER_ADMIN') {
          router.push('/dashboard')
          return
        }
        setAuthorized(true)
      } catch {
        router.push('/sign-in')
      }
    }
    checkAuth()
  }, [router])

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar role="admin" />
      <div className="ml-64">
        <TopBar />
        <main>{children}</main>
      </div>
    </div>
  )
}
