/**
 * Reconstruct string_hourly.reading_count from the RAW string_measurements
 * (count of 5-min rows per device/string/hour bucket) for the last ~31 days.
 *
 * Why: the V1 migration backfilled string_hourly.median_current for history but
 * left reading_count NULL. The gate logic treats a NULL-count hour as
 * "legacy → assume 100% complete", so string_daily.data_completeness is forced
 * to 100 for EVERY historical day — completeness is meaningless for history.
 * This reads the raw truth and writes only the derived reading_count column.
 *
 * Idempotent — re-running recomputes the same counts. Touches ONLY reading_count;
 * raw measurements and every scoring column are left untouched.
 *
 * Run on EC2:  npx tsx scripts/backfill-reading-count.ts
 *
 * (The daily string-performance backfill is re-run AFTER this by the operator to
 * recompute completeness + re-apply the gate — this script runs nothing else.)
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DAYS = 31

async function main() {
  const since = new Date(Date.now() - DAYS * 86_400_000)
  console.log(`backfilling string_hourly.reading_count from raw measurements since ${since.toISOString()}`)

  const updated = await prisma.$executeRaw`
    UPDATE string_hourly sh
    SET reading_count = sub.cnt
    FROM (
      SELECT device_id, string_number, date_trunc('hour', timestamp) AS hr, count(*)::int AS cnt
      FROM string_measurements
      WHERE timestamp >= ${since}
      GROUP BY device_id, string_number, date_trunc('hour', timestamp)
    ) sub
    WHERE sh.device_id = sub.device_id
      AND sh.string_number = sub.string_number
      AND sh.hour = sub.hr
  `

  console.log(`updated ${updated} string_hourly rows with reconstructed reading_count`)
}

main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
