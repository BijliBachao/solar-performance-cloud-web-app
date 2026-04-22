import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Public health endpoint — no auth. Consumed by:
 *   - UptimeRobot (external uptime monitor)
 *   - scripts/audit-post-deploy.sh (deploy smoke test)
 *   - load balancer probes (future)
 *
 * Checks:
 *   - DB reachable (cheap SELECT 1)
 *   - Poller freshness (age of latest measurement)
 *
 * Response: 200 OK on green, 503 on degraded/down. Body always JSON.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbLatencyMs: number | null = null
  let latestMeasurementAgeSec: number | null = null

  try {
    const t0 = Date.now()
    const rows = await prisma.$queryRaw<Array<{ latest: Date | null }>>`
      SELECT MAX(timestamp) as latest FROM string_measurements
    `
    dbLatencyMs = Date.now() - t0
    dbOk = true
    const latest = rows?.[0]?.latest
    if (latest) {
      latestMeasurementAgeSec = Math.floor((Date.now() - new Date(latest).getTime()) / 1000)
    }
  } catch {
    dbOk = false
  }

  // Poller is considered lagging if no measurement in 15 minutes
  // (matches STALE_MS from lib/string-health.ts).
  const pollerStale =
    latestMeasurementAgeSec === null || latestMeasurementAgeSec > 15 * 60

  const status: 'ok' | 'degraded' | 'down' = !dbOk
    ? 'down'
    : pollerStale
    ? 'degraded'
    : 'ok'

  const body = {
    status,
    build: process.env.NEXT_PUBLIC_BUILD_ID || null,
    uptime_sec: Math.floor(process.uptime()),
    db: {
      ok: dbOk,
      latency_ms: dbLatencyMs,
    },
    poller: {
      latest_measurement_age_sec: latestMeasurementAgeSec,
      stale: pollerStale,
    },
    response_ms: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, {
    status: status === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
