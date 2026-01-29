'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    async function redirect() {
      const res = await fetch('/api/auth/user')
      if (!res.ok) {
        router.push('/sign-in')
        return
      }
      const data = await res.json()
      if (data.profile.role === 'SUPER_ADMIN') router.push('/admin')
      else if (data.profile.organizationId) router.push('/dashboard')
      else router.push('/pending-assignment')
    }
    redirect()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Redirecting...</div>
    </div>
  )
}
