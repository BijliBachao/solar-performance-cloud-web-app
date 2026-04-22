import { NextResponse } from 'next/server'

/**
 * Sentry verification endpoint. Hit this once after deploy to confirm
 * server-side errors land in the Sentry dashboard. Delete after verification,
 * or keep behind an internal IP allow-list.
 *
 * Curl:
 *   curl -s https://spc.bijlibachao.pk/api/sentry-test
 *
 * Expected response: HTTP 500 + JSON with the error name. Sentry should
 * show the event within 30 seconds under project "javascript-nextjs".
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Intentional error — the canonical Sentry smoke-test call.
  // @ts-expect-error — intentionally undefined for the test
  myUndefinedFunction()

  return NextResponse.json({ status: 'should never reach' })
}
