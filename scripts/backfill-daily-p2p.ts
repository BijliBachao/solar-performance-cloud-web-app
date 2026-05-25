/**
 * Backfill last 30 PKT days of string_daily.health_score + performance with the
 * Algorithm v2 daily P2P (spec §4d, Q4). Recomputes from string_hourly using the
 * SAME module the live write-path uses, so historical Analysis/donut views match
 * going-forward data.
 *
 * Idempotent: only UPDATEs existing string_daily rows; re-running yields the same
 * result. Run from repo root on EC2:  npx tsx scripts/backfill-daily-p2p.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { scoreDailyP2P, type DailyStringInput } from '@/lib/string-health-daily'
import { p2pToHealthScore, MS_PER_HOUR } from '@/lib/string-health'

const prisma = new PrismaClient()
const DAYS = 30
const PKT_OFFSET_MS = 5 * 3600 * 1000
const pktDateStr = (utc: Date) => new Date(utc.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10)

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const todayPkt = new Date(Date.now() + PKT_OFFSET_MS).toISOString().slice(0, 10)
  const startUtc = new Date(`${todayPkt}T00:00:00+05:00`)
  startUtc.setUTCDate(startUtc.getUTCDate() - DAYS)
  const endUtc = new Date(`${todayPkt}T00:00:00+05:00`) // exclude today (live write-path owns it)
  console.log(`Backfill ${dryRun ? '(DRY RUN) ' : ''}window UTC [${startUtc.toISOString()} .. ${endUtc.toISOString()}) — ${DAYS} PKT days`)

  const devices = await prisma.devices.findMany({ select: { id: true, model: true, max_strings: true, provider: true } })
  let totalRows = 0, totalDeviceDays = 0
  const provCounts = new Map<string, number>()

  for (const dev of devices) {
    const [hourly, cfgRows] = await Promise.all([
      prisma.string_hourly.findMany({
        where: { device_id: dev.id, hour: { gte: startUtc, lt: endUtc } },
        select: { string_number: true, hour: true, avg_power: true },
      }),
      prisma.string_configs.findMany({
        where: { device_id: dev.id },
        select: { string_number: true, is_used: true, exclude_from_peer_comparison: true, panel_count: true },
      }),
    ])
    if (hourly.length === 0) continue

    const unused = new Set(cfgRows.filter(c => c.is_used === false).map(c => c.string_number))
    const excluded = new Set(cfgRows.filter(c => c.exclude_from_peer_comparison).map(c => c.string_number))
    const panelCount = new Map(cfgRows.filter(c => c.panel_count != null).map(c => [c.string_number, c.panel_count as number]))

    // Group: date → string_number → hourly samples
    const byDate = new Map<string, Map<number, { hour: number; avg_power_W: number }[]>>()
    for (const h of hourly) {
      if (unused.has(h.string_number)) continue // unused ports never get a daily row
      const d = pktDateStr(h.hour)
      if (!byDate.has(d)) byDate.set(d, new Map())
      const sMap = byDate.get(d)!
      const arr = sMap.get(h.string_number) || []
      arr.push({ hour: Math.floor(h.hour.getTime() / MS_PER_HOUR), avg_power_W: h.avg_power ? Number(h.avg_power) : 0 })
      sMap.set(h.string_number, arr)
    }

    const updates = []
    for (const [date, sMap] of byDate) {
      totalDeviceDays++
      const inputs: DailyStringInput[] = [...sMap.entries()].map(([sn, hrs]) => ({
        string_number: sn,
        panel_count: panelCount.get(sn) ?? null,
        is_used: true,
        exclude_from_peer_comparison: excluded.has(sn),
        hourly: hrs,
      }))
      const results = scoreDailyP2P(inputs, { deviceId: dev.id, inverterModel: dev.model, inverterMaxStrings: dev.max_strings })
      const dateObj = new Date(`${date}T00:00:00.000Z`)
      for (const r of results) {
        const hs = p2pToHealthScore(r.p2p)
        updates.push(
          prisma.string_daily.updateMany({
            where: { device_id: dev.id, string_number: r.string_number, date: dateObj },
            data: {
              health_score: hs != null ? Number(hs.toFixed(2)) : null,
              performance: r.score_persisted != null ? Number(r.score_persisted.toFixed(2)) : null,
            },
          }),
        )
      }
    }

    if (!dryRun && updates.length > 0) {
      // Chunk to keep transactions bounded.
      for (let i = 0; i < updates.length; i += 200) {
        const res = await prisma.$transaction(updates.slice(i, i + 200))
        totalRows += res.reduce((a, x) => a + x.count, 0)
      }
    } else {
      totalRows += updates.length
    }
    provCounts.set(dev.provider, (provCounts.get(dev.provider) ?? 0) + updates.length)
  }

  console.log(`\nDone. device-days=${totalDeviceDays}, rows ${dryRun ? 'WOULD update' : 'updated'}=${totalRows}`)
  console.log('Per provider:', Object.fromEntries(provCounts))
  await prisma.$disconnect()
}
main().catch((e) => { console.error('BACKFILL ERROR:', e.message); process.exit(1) })
