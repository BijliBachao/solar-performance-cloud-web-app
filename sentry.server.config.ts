// Sentry — Node.js runtime (API routes, server components, server actions).
// Loaded by instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
//
// DSN is non-secret (safe in source); the write gate is the Sentry project
// config on sentry.io. For source-map uploads during build, set
// SENTRY_AUTH_TOKEN in .env.sentry-build-plugin (gitignored).

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    'https://cfbed5ecedb44a1113ad1eb97d509160@o4511263055675392.ingest.us.sentry.io/4511263057707008',

  // Performance tracing — 10% of transactions (solar-poller runs every 5 min,
  // dashboard users are few, so 10% is plenty to spot trends without cost).
  tracesSampleRate: 0.1,

  // Release tag — set by the build so errors are grouped per commit.
  release: process.env.NEXT_PUBLIC_BUILD_ID || undefined,

  // Environment tag — 'production' on EC2, 'development' locally.
  environment: process.env.NODE_ENV || 'development',

  // Don't spam on expected aborted fetches.
  ignoreErrors: ['AbortError', 'NEXT_REDIRECT', 'NEXT_NOT_FOUND'],

  // Breadcrumbs help — 50 events is the default, keep it.
  maxBreadcrumbs: 50,
})
