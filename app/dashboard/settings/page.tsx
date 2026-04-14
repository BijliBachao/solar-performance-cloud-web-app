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
        <div className="space-y-3 max-w-xl">
          {/* Profile */}
          <div className="bg-[#1a1a1a] rounded-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#333]">
              <User className="h-3.5 w-3.5 text-[#76b900]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Profile</h3>
            </div>
            <div className="p-5 space-y-0">
              {[
                { label: 'Email', value: user.email },
                { label: 'Name', value: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A' },
                { label: 'Role', value: user.profile.role, badge: true },
                { label: 'Status', value: user.profile.status, badge: true },
              ].map((row) => (
                <div key={row.label} className="flex justify-between py-2.5 border-b border-[#252525] last:border-0">
                  <span className="text-[10px] font-bold text-[#5e5e5e] uppercase tracking-widest">{row.label}</span>
                  {row.badge ? (
                    <span className="text-[10px] font-bold text-[#76b900] uppercase tracking-wider">{row.value}</span>
                  ) : (
                    <span className="text-xs font-semibold text-[#a7a7a7]">{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Organization */}
          <div className="bg-[#1a1a1a] rounded-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#333]">
              <Building2 className="h-3.5 w-3.5 text-[#76b900]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Organization</h3>
            </div>
            <div className="p-5">
              <div className="flex justify-between">
                <span className="text-[10px] font-bold text-[#5e5e5e] uppercase tracking-widest">Organization</span>
                <span className="text-xs font-semibold text-[#a7a7a7]">{user.profile.organizationName || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-[#1a1a1a] rounded-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#333]">
              <Mail className="h-3.5 w-3.5 text-[#76b900]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Support</h3>
            </div>
            <div className="p-5">
              <p className="text-[11px] text-[#898989]">For account changes or support, contact your administrator.</p>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
