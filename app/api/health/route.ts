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
 *   - Poller liveness (age of the newest devices.last_seen_at — stamped every
 *     cycle for every device the vendor APIs return, EVEN when the DQ write
 *     gate rejects the snapshot). Measurement age is informational only: the
 *     gates correctly write NOTHING at night, so "latest measurement" would
 *     cry degraded every night while the poller is perfectly healthy
 *     (CQ audit 2026-06-05, found by the post-deploy WARN).
 *
 * Response: 200 OK on green, 503 on degraded/down. Body always JSON.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbLatencyMs: number | null = null
  let latestContactAgeSec: number | null = null
  let latestMeasurementAgeSec: number | null = null

  try {
    const t0 = Date.now()
    const rows = await prisma.$queryRaw<Array<{ latest_seen: Date | null; latest_write: Date | null }>>`
      SELECT
        (SELECT MAX(last_seen_at) FROM devices)            AS latest_seen,
        (SELECT MAX(timestamp) FROM string_measurements)   AS latest_write
    `
    dbLatencyMs = Date.now() - t0
    dbOk = true
    const seen = rows?.[0]?.latest_seen
    const write = rows?.[0]?.latest_write
    if (seen) latestContactAgeSec = Math.floor((Date.now() - new Date(seen).getTime()) / 1000)
    if (write) latestMeasurementAgeSec = Math.floor((Date.now() - new Date(write).getTime()) / 1000)
  } catch {
    dbOk = false
  }

  // Poller is lagging if it hasn't CONTACTED the vendors in 15 minutes
  // (3 missed cycles). Fall back to measurement age only while last_seen_at
  // is still unpopulated (fresh deploy) — newest of the two signals wins.
  const freshestSec =
    latestContactAgeSec !== null && latestMeasurementAgeSec !== null
      ? Math.min(latestContactAgeSec, latestMeasurementAgeSec)
      : latestContactAgeSec ?? latestMeasurementAgeSec
  const pollerStale = freshestSec === null || freshestSec > 15 * 60

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
      latest_contact_age_sec: latestContactAgeSec,
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
