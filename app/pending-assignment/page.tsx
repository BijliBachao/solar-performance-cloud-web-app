'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { useClerk } from '@clerk/nextjs'

export default function PendingAssignmentPage() {
  const router = useRouter()
  const { isLoaded, userId } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()

  useEffect(() => {
    if (!isLoaded || !userId || !user) return

    // Check every 10 seconds if user has been assigned
    async function checkAssignment() {
      try {
        const res = await fetch('/api/auth/user')
        if (res.ok) {
          const data = await res.json()
          if (data.profile.status !== 'PENDING_ASSIGNMENT') {
            if (data.profile.role === 'SUPER_ADMIN') {
              router.push('/admin')
            } else if (data.profile.organizationId) {
              router.push('/dashboard')
            }
          }
        }
      } catch {
        // silently retry on next interval
      }
    }

    // Check immediately on load
    checkAssignment()

    // Then poll every 10 seconds
    const interval = setInterval(checkAssignment, 10000)
    return () => clearInterval(interval)
  }, [isLoaded, userId, user, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center p-8 bg-white rounded-xl shadow-lg">
        <div className="text-5xl mb-4">&#9203;</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Account Pending Assignment
        </h1>
        <p className="text-gray-600 mb-6">
          Your account has been created. Please wait for an administrator to
          assign you to an organization.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-1">What&apos;s next?</h3>
          <p className="text-blue-700 text-sm">
            An administrator will assign you to your organization. This page
            will automatically redirect once that happens.
          </p>
        </div>
        <button
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
