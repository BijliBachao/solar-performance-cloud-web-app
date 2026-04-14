'use client'
import { useEffect, useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { User, Building2, Mail } from 'lucide-react'

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
        <div className="space-y-4 max-w-xl">
          {/* Profile */}
          <div className="bg-white rounded border border-[#e5e5e5] p-4">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-[#76b900]" />
              <h3 className="text-sm font-bold text-[#0a0a0a]">Profile</h3>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#f0f0f0]">
                <span className="font-semibold text-[#898989] uppercase tracking-wide">Email</span>
                <span className="font-semibold text-[#0a0a0a]">{user.email}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#f0f0f0]">
                <span className="font-semibold text-[#898989] uppercase tracking-wide">Name</span>
                <span className="font-semibold text-[#0a0a0a]">{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#f0f0f0]">
                <span className="font-semibold text-[#898989] uppercase tracking-wide">Role</span>
                <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-[#e8f5d0] text-[#5a8f00] border border-[#76b900]/30">
                  {user.profile.role}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="font-semibold text-[#898989] uppercase tracking-wide">Status</span>
                <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-[#e8f5d0] text-[#5a8f00] border border-[#76b900]/30">
                  {user.profile.status}
                </span>
              </div>
            </div>
          </div>

          {/* Organization */}
          <div className="bg-white rounded border border-[#e5e5e5] p-4">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-[#76b900]" />
              <h3 className="text-sm font-bold text-[#0a0a0a]">Organization</h3>
            </div>
            <div className="text-xs">
              <div className="flex justify-between py-1.5">
                <span className="font-semibold text-[#898989] uppercase tracking-wide">Organization</span>
                <span className="font-semibold text-[#0a0a0a]">{user.profile.organizationName || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-white rounded border border-[#e5e5e5] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-4 w-4 text-[#76b900]" />
              <h3 className="text-sm font-bold text-[#0a0a0a]">Support</h3>
            </div>
            <p className="text-xs text-[#898989]">For account changes or support, contact your administrator.</p>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
