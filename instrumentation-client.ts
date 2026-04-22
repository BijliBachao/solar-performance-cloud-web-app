// Sentry — Browser runtime. Next.js auto-loads this on the client.
//
// Session Replay is enabled at 10% baseline + 100% on error so we have a
// video of what the user saw when something broke — but we don't balloon
// quota on happy-path sessions.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    'https://cfbed5ecedb44a1113ad1eb97d509160@o4511263055675392.ingest.us.sentry.io/4511263057707008',

  // Performance tracing — 10% of navigations / interactions.
  tracesSampleRate: 0.1,

  // Session replay — capture 10% of sessions, 100% of sessions with errors.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Release + env tags (matches server config for grouped cross-runtime traces).
  release: process.env.NEXT_PUBLIC_BUILD_ID || undefined,
  environment: process.env.NODE_ENV || 'development',

  // Mask all text + block all media in replays — enterprise-safe defaults.
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  ignoreErrors: ['AbortError', 'NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
})

// Required by Next.js 15+ for router-transition tracing; no-op on 14 but safe.
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/#manual-setup
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
