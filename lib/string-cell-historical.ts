/**
 * Drill-down historical "own-trend" block for peer-excluded strings (V1, Task 17).
 *
 * Strings flagged exclude_from_peer_comparison (known shaded / different
 * orientation) get a SELF-referenced trend instead of a peer ratio: today's
 * representative current vs the string's own ~30-day normal. INFORMATIONAL only
 * — never a fault, never alerted, NOT weather-adjusted in V1.
 *
 * Shared by both string-cell drill-down routes (admin + dashboard) so the
 * query + composition can never drift apart. Pure math lives in
 * lib/historical-baseline.ts; this module only does the I/O + wiring.
 */

import { prisma } from '@/lib/prisma'
import { computeHistoricalPct, pickBaseline, type BaselineSource } from '@/lib/historical-baseline'

export interface StringHistorical {
  todayRepr: number | null
  baseline: number | null
  pct: number | null
  source: BaselineSource
}

/** Lookback window (days) for the own-trend baseline. */
export const HISTORICAL_BASELINE_DAYS = 30

/**
 * Build the historical own-trend block for one peer-excluded string.
 * @param todayRepr the string's representative current for the requested day
 *   (the same median-of-medians repr_current the cell scores from), or null.
 * @param date the requested day as `YYYY-MM-DD` (PKT date of the cell).
 */
export async function loadStringHistorical(
  deviceId: string,
  stringNumber: number,
  date: string,
  todayRepr: number | null,
): Promise<StringHistorical> {
  // string_daily.date is a Postgres @db.Date the poller keys at UTC-midnight of
  // the PKT calendar date (getPKTDateForDB → Date.UTC(...,0,0,0); same form
  // computeSettledDayPerformance uses for its write). We MUST bound the column
  // with that exact convention — `${date}T00:00:00Z`, NOT a `+05:00` instant
  // (which lands at the prior day 19:00Z; it happens to bracket the midnight-Z
  // rows correctly today, but only because PKT has no DST — fragile). Window =
  // the N PKT days strictly before the requested day. [windowStart, dayStart).
  const [y, mo, d] = date.split('-').map(Number)
  const dayStartUtc = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0))
  const windowStartUtc = new Date(dayStartUtc.getTime() - HISTORICAL_BASELINE_DAYS * 86_400_000)

  const [history, cfg] = await Promise.all([
    // Own avg_current over the last N days BEFORE the requested day (string_daily
    // is keyed on a DATE column; compare against the dates in [windowStart, day)).
    prisma.string_daily.findMany({
      where: {
        device_id: deviceId,
        string_number: stringNumber,
        date: { gte: windowStartUtc, lt: dayStartUtc },
      },
      select: { avg_current: true },
    }),
    prisma.string_configs.findUnique({
      where: { device_id_string_number: { device_id: deviceId, string_number: stringNumber } },
      select: { manual_baseline_current: true },
    }),
  ])

  const history30 = history
    .map((r) => (r.avg_current != null ? Number(r.avg_current) : null))
    .filter((v): v is number => v != null)
  const manual = cfg?.manual_baseline_current != null ? Number(cfg.manual_baseline_current) : null

  const { value: baseline, source } = pickBaseline({ manual, history30 })
  const pct = computeHistoricalPct(todayRepr, baseline)

  return { todayRepr, baseline, pct, source }
}
