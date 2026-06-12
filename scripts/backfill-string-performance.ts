/**
 * Recompute the last 30 PKT days of string_daily.performance/availability/health_score
 * via the SAME settled-day function the daily cron uses (DRY). Idempotent.
 * Run on EC2:  npx tsx scripts/backfill-string-performance.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { computeSettledDayPerformance } from '@/lib/settled-day-performance'
import { INVERTER_DEVICE_TYPE_IDS } from '@/lib/constants'

const prisma = new PrismaClient()
const DAYS = 30

async function main() {
  const pktNow = new Date(Date.now() + 5 * 3600_000)
  const dates = Array.from({ length: DAYS }, (_, i) => {
    const x = new Date(pktNow.getTime() - (i + 1) * 86_400_000)
    return x.toISOString().slice(0, 10)
  })
  const devices = await prisma.devices.findMany({
    where: { device_type_id: { in: INVERTER_DEVICE_TYPE_IDS } }, select: { id: true },
  })
  for (const date of dates) {
    let updated = 0
    for (const dev of devices) updated += await computeSettledDayPerformance(prisma, dev, date)
    // C1/I3 guard: a 0-row day means the date filter didn't match what the poller
    // wrote — a silent no-op. Make it loud.
    if (updated === 0) console.warn(`⚠️  ${date}: 0 rows updated — date-filter mismatch? (C1)`)
    else console.log(`backfilled ${date}: ${updated} rows`)
  }

  // Clear stale pre-V1 leftovers. computeSettledDayPerformance only RECOMPUTES
  // strings that have 8–4 PKT hourly data that day; a string with an old-metric
  // string_daily row but no window data (logger gap) keeps its OLD, possibly
  // UNCAPPED health_score (e.g. 127%). Under V1 such a row has NO valid score, so
  // it must read "no data", not a stale number. V1 ALWAYS sets data_completeness
  // when it scores, so `data_completeness IS NULL && health_score IS NOT NULL`
  // uniquely identifies an un-recomputed pre-V1 leftover. NULL only the derived
  // display columns — the raw truth (string_measurements / string_hourly) and the
  // uncapped raw_performance are never touched.
  const earliest = dates[dates.length - 1] // oldest YYYY-MM-DD in the window
  const cleared = await prisma.string_daily.updateMany({
    where: {
      date: { gte: new Date(`${earliest}T00:00:00Z`) },
      data_completeness: null,
      health_score: { not: null },
    },
    data: { health_score: null, performance: null },
  })
  console.log(`cleared ${cleared.count} stale pre-V1 rows → no-V1-score (health_score/performance NULLed; raw data untouched)`)
}
main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
