/**
 * Settled-day String Performance — compute one COMPLETED PKT day from string_hourly.
 * Pure prep (prepSettledDayInputs) + thin I/O wrapper (computeSettledDayPerformance).
 * Called by the daily cron (run-poller.ts) and the 30-day backfill — the SAME path.
 * Spec §2A. Idempotent: UPDATEs existing string_daily rows only.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { scoreStringPerformance, computeOperatingAvailability, median, type PerfStringInput } from '@/lib/string-performance'
import { MIN_CURRENT_FOR_COMPARISON, MIN_PRODUCING_CURRENT, MIN_SUNUP_HOURS_FOR_DAILY_SCORE } from '@/lib/string-health'

export interface HourlyCurrentRow { string_number: number; hour: Date; avg_current: number }

export interface PreppedDay {
  perfInputs: PerfStringInput[]
  sunUpHours: number
  availability: Map<number, { producingHours: number; sunUpHours: number }>
}

/** PURE. Turn a device's hourly current rows for one PKT day into scorer inputs. */
export function prepSettledDayInputs(
  rows: HourlyCurrentRow[],
  cfg: { unused: Set<number>; peerExcluded: Set<number> },
): PreppedDay {
  const byHour = new Map<number, Map<number, number>>()
  const strings = new Set<number>()
  for (const r of rows) {
    if (cfg.unused.has(r.string_number)) continue
    if (!Number.isFinite(r.avg_current) || r.avg_current < 0) continue
    strings.add(r.string_number)
    const hk = Math.floor(r.hour.getTime() / 3_600_000)
    let m = byHour.get(hk); if (!m) { m = new Map(); byHour.set(hk, m) }
    m.set(r.string_number, r.avg_current)
  }
  const sunUp: number[] = []
  for (const [hk, m] of byHour) {
    let sum = 0; for (const c of m.values()) sum += c
    if (sum >= MIN_CURRENT_FOR_COMPARISON) sunUp.push(hk)
  }
  const scoreable = sunUp.length >= MIN_SUNUP_HOURS_FOR_DAILY_SCORE

  const availability = new Map<number, { producingHours: number; sunUpHours: number }>()
  const perfInputs: PerfStringInput[] = [...strings].map(sn => {
    const samples: number[] = []
    let producing = 0
    for (const hk of sunUp) {
      const c = byHour.get(hk)?.get(sn)
      if (c == null) continue
      samples.push(c)
      if (c > MIN_PRODUCING_CURRENT) producing++
    }
    availability.set(sn, { producingHours: producing, sunUpHours: sunUp.length })
    return {
      string_number: sn,
      is_used: true,
      exclude_from_peer_comparison: cfg.peerExcluded.has(sn),
      repr_current: scoreable && samples.length > 0 ? median(samples) : null,
    }
  })
  return { perfInputs, sunUpHours: sunUp.length, availability }
}

/** I/O. Load string_hourly for (device, PKT date), compute, UPDATE string_daily.
 *  Returns rows updated — caller MUST assert > 0 (silent-no-op guard). */
export async function computeSettledDayPerformance(
  prisma: PrismaClient,
  device: { id: string },
  pktDate: string, // 'YYYY-MM-DD'
): Promise<number> {
  const startUtc = new Date(`${pktDate}T00:00:00+05:00`)
  const endUtc = new Date(startUtc.getTime() + 86_400_000)
  const [hourly, cfgRows] = await Promise.all([
    prisma.string_hourly.findMany({
      where: { device_id: device.id, hour: { gte: startUtc, lt: endUtc } },
      select: { string_number: true, hour: true, avg_current: true },
    }),
    prisma.string_configs.findMany({
      where: { device_id: device.id },
      select: { string_number: true, is_used: true, exclude_from_peer_comparison: true },
    }),
  ])
  if (hourly.length === 0) return 0
  const rows: HourlyCurrentRow[] = hourly.map(r => ({
    string_number: r.string_number, hour: r.hour, avg_current: r.avg_current ? Number(r.avg_current) : 0,
  }))
  const unused = new Set(cfgRows.filter(c => c.is_used === false).map(c => c.string_number))
  const peerExcluded = new Set(cfgRows.filter(c => c.exclude_from_peer_comparison).map(c => c.string_number))

  const { perfInputs, availability } = prepSettledDayInputs(rows, { unused, peerExcluded })
  const scored = scoreStringPerformance(perfInputs)
  // ⚠️ `date` MUST equal what the poller wrote via getPKTDateForDB() (Postgres DATE);
  // a mismatched Date silently matches 0 rows. UTC-midnight of the PKT calendar date
  // is what getPKTDateForDB produces — VERIFY via the returned count.
  const dateOnly = new Date(`${pktDate}T00:00:00Z`)

  let updated = 0
  for (const r of scored) {
    const av = availability.get(r.string_number)
    const avail = av ? computeOperatingAvailability(av.producingHours, av.sunUpHours) : null
    const res = await prisma.string_daily.updateMany({
      where: { device_id: device.id, string_number: r.string_number, date: dateOnly },
      data: {
        performance: r.performance != null ? new Prisma.Decimal(r.performance.toFixed(2)) : null,
        health_score: r.performance != null ? new Prisma.Decimal(r.performance.toFixed(2)) : null,
        availability: avail != null ? new Prisma.Decimal(avail.toFixed(2)) : null,
      },
    })
    updated += res.count
  }
  return updated
}
