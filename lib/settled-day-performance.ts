/**
 * Settled-day String Performance — compute one COMPLETED PKT day from string_hourly.
 * Pure prep (prepSettledDayInputs / buildPerfInputsFromHourly) + thin I/O wrapper
 * (computeSettledDayPerformance). Called by the daily cron (run-poller.ts) and the
 * 30-day backfill — the SAME path. Idempotent: UPDATEs existing string_daily rows only.
 *
 * V1 (LOCKED 2026-06-11, reyyan-message_final.txt §6/§9):
 *   - Fixed 8 AM–4 PM PKT window (UTC 03:00–11:00), end-exclusive.
 *   - Daily repr_current = median-of-medians (median of each hour's median_current).
 *   - Data completeness = Σ reading_count / expected; < 60% → insufficient_data (gated,
 *     not scored). Legacy exemption: a day whose window-hours all carry NULL reading_count
 *     is historical (predates Task 7) and is scored, not gated.
 *
 * `buildPerfInputsFromHourly` is the ONE shared helper for the window/median/completeness
 * math; the live-today poller path (updateDailyAggregates) reuses it so live === settled.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { scoreStringPerformance, computeOperatingAvailability, median, type PerfStringInput } from '@/lib/string-performance'
import {
  PERF_WINDOW_START_HOUR_PKT,
  PERF_WINDOW_END_HOUR_PKT,
  PERF_EXPECTED_READINGS,
  PERF_COMPLETENESS_GATE,
  MIN_PRODUCING_CURRENT,
} from '@/lib/string-health'

/** One string_hourly row, V1 shape: median-within-hour current + how many 5-min readings landed. */
export interface HourlyMedianRow {
  string_number: number
  hour: Date
  median_current: number
  /** Count of 5-min readings in the hour. NULL = legacy row (predates the column). */
  reading_count: number | null
}

export interface PreppedDay {
  perfInputs: PerfStringInput[]
  availability: Map<number, { producingHours: number; sunUpHours: number }>
  /** Data-completeness % per string (0–100), rounded. */
  completeness: Map<number, number>
}

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

/** PKT local hour for a UTC instant (PKT = UTC+5). */
function pktHourOf(d: Date): number {
  return new Date(d.getTime() + PKT_OFFSET_MS).getUTCHours()
}

/**
 * THE shared window/median/completeness helper. PURE.
 * Filters rows to the fixed 8 AM–4 PM PKT window, builds median-of-medians per string,
 * and gates on data completeness vs `expectedReadings` (default 96; the live path passes
 * an expected-so-far pro-rated to elapsed window-hours).
 */
export function buildPerfInputsFromHourly(
  rows: HourlyMedianRow[],
  cfg: { unused: Set<number>; peerExcluded: Set<number> },
  expectedWindowHours: number = PERF_WINDOW_END_HOUR_PKT - PERF_WINDOW_START_HOUR_PKT,
): PreppedDay {
  const byString = new Map<
    number,
    { meds: number[]; reads: number; allReal: boolean; producing: number }
  >()
  for (const r of rows) {
    if (cfg.unused.has(r.string_number)) continue
    const ph = pktHourOf(r.hour)
    if (ph < PERF_WINDOW_START_HOUR_PKT || ph >= PERF_WINDOW_END_HOUR_PKT) continue
    if (r.median_current == null || !Number.isFinite(r.median_current) || r.median_current < 0) continue
    const e = byString.get(r.string_number) ?? { meds: [], reads: 0, allReal: true, producing: 0 }
    e.meds.push(r.median_current)
    if (r.reading_count != null && Number.isFinite(r.reading_count)) {
      e.reads += r.reading_count
    } else {
      // A window-hour with no real reading_count is a legacy row (predates the
      // count column). We can't trust this day's completeness ratio → exempt the
      // WHOLE day from the gate. All-or-nothing so a deploy-day transition (legacy
      // morning hours + new afternoon hours) is never falsely gated (review I-1).
      e.allReal = false
    }
    if (r.median_current > MIN_PRODUCING_CURRENT) e.producing++
    byString.set(r.string_number, e)
  }

  const availability = new Map<number, { producingHours: number; sunUpHours: number }>()
  const completeness = new Map<number, number>()
  // Reyyan §9's gate intent is "roughly 5 of the 8 hours". His literal "58 of 96
  // readings" assumed 5-minute polling, which WRONGLY gated slower-cadence providers
  // (measured on prod: Huawei polls ~10-min → ~48 readings/day but covers all 8 window
  // hours → every Huawei string failed 58/96). So completeness + the gate are HOURS-OF-
  // COVERAGE based: how many of the 8 window hours carry data. Cadence-proof, and it
  // matches his stated "5 of 8 hours". Settled day = the full 8h (default); live-today =
  // the hours elapsed so far (passed by the poller) so a mid-day string isn't gated for
  // hours that haven't happened yet. reading_count stays stored as a finer signal but no
  // longer drives the gate.
  const denomHours = Math.max(expectedWindowHours, 1)

  const perfInputs: PerfStringInput[] = [...byString.keys()].map(sn => {
    const e = byString.get(sn)!
    const coverage = Math.min(e.meds.length / denomHours, 1) // fraction of expected window hours with data
    const insufficient = coverage < PERF_COMPLETENESS_GATE // < 0.60 ⇒ < 60% of the (expected) window hours
    availability.set(sn, { producingHours: e.producing, sunUpHours: e.meds.length })
    completeness.set(sn, Math.round(coverage * 100))
    return {
      string_number: sn,
      is_used: true,
      exclude_from_peer_comparison: cfg.peerExcluded.has(sn),
      repr_current: !insufficient && e.meds.length > 0 ? median(e.meds) : null,
      insufficient_data: insufficient,
    }
  })

  return { perfInputs, availability, completeness }
}

/** PURE. Turn a device's hourly median rows for one COMPLETED PKT day into scorer inputs. */
export function prepSettledDayInputs(
  rows: HourlyMedianRow[],
  cfg: { unused: Set<number>; peerExcluded: Set<number> },
): PreppedDay {
  return buildPerfInputsFromHourly(rows, cfg) // settled = full window (default 8h)
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
      select: { string_number: true, hour: true, median_current: true, reading_count: true },
    }),
    prisma.string_configs.findMany({
      where: { device_id: device.id },
      select: { string_number: true, is_used: true, exclude_from_peer_comparison: true },
    }),
  ])
  if (hourly.length === 0) return 0
  const rows: HourlyMedianRow[] = hourly.map(r => ({
    string_number: r.string_number,
    hour: r.hour,
    median_current: r.median_current != null ? Number(r.median_current) : 0,
    reading_count: r.reading_count ?? null,
  }))
  const unused = new Set(cfgRows.filter(c => c.is_used === false).map(c => c.string_number))
  const peerExcluded = new Set(cfgRows.filter(c => c.exclude_from_peer_comparison).map(c => c.string_number))

  const { perfInputs, availability, completeness } = prepSettledDayInputs(rows, { unused, peerExcluded })
  const scored = scoreStringPerformance(perfInputs)
  // ⚠️ `date` MUST equal what the poller wrote via getPKTDateForDB() (Postgres DATE);
  // a mismatched Date silently matches 0 rows. UTC-midnight of the PKT calendar date
  // is what getPKTDateForDB produces — VERIFY via the returned count.
  const dateOnly = new Date(`${pktDate}T00:00:00Z`)

  let updated = 0
  for (const r of scored) {
    const av = availability.get(r.string_number)
    const avail = av ? computeOperatingAvailability(av.producingHours, av.sunUpHours) : null
    const comp = completeness.get(r.string_number) ?? null
    const res = await prisma.string_daily.updateMany({
      where: { device_id: device.id, string_number: r.string_number, date: dateOnly },
      data: {
        performance: r.performance != null ? new Prisma.Decimal(r.performance.toFixed(2)) : null, // DISPLAY ≤100
        health_score: r.performance != null ? new Prisma.Decimal(r.performance.toFixed(2)) : null, // donut/cells read this
        raw_performance: r.raw_performance != null ? new Prisma.Decimal(r.raw_performance.toFixed(2)) : null,
        data_completeness: comp != null ? new Prisma.Decimal(comp.toFixed(2)) : null,
        availability: avail != null ? new Prisma.Decimal(avail.toFixed(2)) : null,
      },
    })
    updated += res.count
  }
  return updated
}
