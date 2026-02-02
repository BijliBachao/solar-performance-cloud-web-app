'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'

export default function AuthRedirectPage() {
  const router = useRouter()
  const { isLoaded, userId } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    async function checkUserRole() {
      if (!isLoaded || !userId || !user) return

      try {
        const res = await fetch('/api/auth/user')

        if (res.ok) {
          const data = await res.json()

          if (data.profile.status === 'PENDING_ASSIGNMENT') {
            router.push('/pending-assignment')
          } else if (data.profile.role === 'SUPER_ADMIN') {
            router.push('/admin')
          } else if (data.profile.organizationId) {
            router.push('/dashboard')
          } else {
            router.push('/pending-assignment')
          }
        } else {
          router.push('/pending-assignment')
        }
      } catch (error) {
        console.error('Error checking user role:', error)
        router.push('/pending-assignment')
      }
    }

    checkUserRole()
  }, [isLoaded, userId, user, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Checking your account...</p>
      </div>
    </div>
  )
}
