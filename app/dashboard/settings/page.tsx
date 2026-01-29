'use client'
import { useEffect, useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'

interface UserProfile {
  id: string; email: string; first_name: string | null; last_name: string | null
  profile: { role: string; organizationId: string | null; organizationName: string | null; status: string }
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/user')
        if (res.ok) setUser(await res.json())
      } catch { /* handle */ } finally { setLoading(false) }
    }
    fetchUser()
  }, [])

  return (
    <PageWrapper title="Settings" loading={loading}>
      {user && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-900">{user.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-gray-900">{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="text-gray-900">{user.profile.role}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-gray-900">{user.profile.status}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Organization</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Organization</span><span className="text-gray-900">{user.profile.organizationName || 'Not assigned'}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Support</h3>
            <p className="text-sm text-gray-600">For account changes or support, please contact your administrator.</p>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
