'use client'

import { SignUp } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function ClientSignUp() {
  useEffect(() => {
    // Workaround for Clerk bug: invalidateCacheAction server action fails
    // after signup and blocks the redirect. Intercept and swallow it.
    if (typeof window !== 'undefined') {
      const originalFetch = window.fetch
      window.fetch = function (...args) {
        const [url] = args
        if (typeof url === 'string' && url.includes('invalidateCacheAction')) {
          return Promise.resolve(
            new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        return originalFetch.apply(this, args)
      }
    }
  }, [])

  return (
    <SignUp
      signInUrl="/sign-in"
      afterSignUpUrl="/auth-redirect"
      routing="path"
      path="/sign-up"
    />
  )
}
