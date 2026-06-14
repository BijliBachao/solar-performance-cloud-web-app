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
      <div className="min-h-screen flex items-center justify-center bg-warm-cream">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-bb-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-warm-muted">
            {!isLoaded ? 'Initializing...' : 'Redirecting to dashboard...'}
          </span>
        </div>
      </div>
    )
  }

  return <LandingHero signedIn={!!isSignedIn} />
}
