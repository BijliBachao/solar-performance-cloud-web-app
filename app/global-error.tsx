'use client'

// Global error boundary for the App Router — catches render-time errors
// that bubble past the root layout. Reports them to Sentry and shows a
// plain-white fallback that matches DESIGN.md v3 (no pure black, slate text).

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import NextError from 'next/error'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        {/* next/error keeps the default Next error UI so the fallback is
            consistent with the framework; app-level design is already
            unmounted by the time we land here. */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
