// Next.js instrumentation hook — dispatches to the runtime-specific Sentry
// config based on NEXT_RUNTIME. Next.js auto-calls register() once when the
// server process starts.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Forward server-side request errors to Sentry. Exported here per Next.js
// conventions; Sentry's SDK wires it up under the hood.
export { captureRequestError as onRequestError } from '@sentry/nextjs'
