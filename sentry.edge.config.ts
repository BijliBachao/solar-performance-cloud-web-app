// Sentry — Edge runtime (middleware.ts and any edge-route handlers).
// Loaded by instrumentation.ts when NEXT_RUNTIME === 'edge'.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    'https://cfbed5ecedb44a1113ad1eb97d509160@o4511263055675392.ingest.us.sentry.io/4511263057707008',

  tracesSampleRate: 0.1,
  release: process.env.NEXT_PUBLIC_BUILD_ID || undefined,
  environment: process.env.NODE_ENV || 'development',
})
