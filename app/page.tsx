'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import LandingHero from '@/components/landing/LandingHero'

export default function LandingPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [redirecting, setRedirecting] = useState(false)
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    const forceShowLanding = setTimeout(() => {
      setShowLanding(true)
      setRedirecting(false)
    }, 2000)

    if (isLoaded && isSignedIn && !redirecting && !showLanding) {
      clearTimeout(forceShowLanding)
      setRedirecting(true)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        setShowLanding(true)
        setRedirecting(false)
      }, 2000)

      fetch('/api/auth/user', {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'include',
      })
        .then(res => { clearTimeout(timeoutId); return res.json() })
        .then(data => {
          if (data.profile?.role === 'SUPER_ADMIN') router.push('/admin')
          else if (data.profile?.status === 'PENDING_ASSIGNMENT' || !data.profile?.organizationId) router.push('/pending-assignment')
          else router.push('/dashboard')
        })
        .catch(() => { clearTimeout(timeoutId); setShowLanding(true); setRedirecting(false) })
    }

    return () => clearTimeout(forceShowLanding)
  }, [isLoaded, isSignedIn, router, redirecting, showLanding])

  if (showLanding || (isLoaded && !isSignedIn)) {
    // Continue to landing page
  } else if (!isLoaded || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fdfbf7' }}>
        <div className="flex flex-col items-center gap-4">
          <span
            className="animate-pulse"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 42%, #fff, #f5e9d4 44%, #f7d9a8 72%)',
              boxShadow: '0 0 40px 12px rgba(247,217,168,.85), 0 0 18px 4px rgba(102,94,253,.18)',
            }}
          />
          <span className="text-[11px] uppercase tracking-[0.24em] text-ink-mute">
            {!isLoaded ? 'Solar Performance Cloud' : 'Taking you to your dashboard'}
          </span>
        </div>
      </div>
    )
  }

  return <LandingHero signedIn={!!isSignedIn} />
}
