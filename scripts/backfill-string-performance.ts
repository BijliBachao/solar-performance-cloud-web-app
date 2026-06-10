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
}
main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
