/**
 * Huawei inverter model → physical PV input (string) count.
 *
 * Huawei's `getDevList` endpoint returns `model` (hardware model name like
 * `SUN2000-100KTL-M2`) but NOT a string count anywhere in any endpoint.
 * Their own portal hardcodes the answer per model; this is our equivalent.
 *
 * Counts are from Huawei datasheets — # of MPPTs × strings per MPPT.
 * For modern Huawei commercial inverters, "strings per MPPT" is almost always
 * 2 (the inverter has two PV input terminals per MPPT). Residential models
 * (SUN2000-*KTL-L1, -M0, -M1) have 1 string per MPPT.
 *
 * When a new Huawei model joins the fleet, add a row here. The poller
 * logs a one-time warning per unknown model so unknowns are visible in
 * production logs.
 *
 * Lookup is case-insensitive on the full model string.
 */

// Internal mutable table — exported as a frozen Readonly view so callers
// (including tests) cannot accidentally mutate process-wide state.
// Bounded by Huawei's catalogue size (<100 SKUs); no eviction needed.
const HUAWEI_MODEL_STRINGS_MAP: Record<string, number> = {
  // ── Residential single-phase (2 MPPT × 1 string = 2 strings) ──────────
  'SUN2000-2KTL-L1': 2,
  'SUN2000-3KTL-L1': 2,
  'SUN2000-4KTL-L1': 2,
  'SUN2000-5KTL-L1': 2,
  'SUN2000-6KTL-L1': 2,

  // ── Residential / small commercial three-phase ─────────────────────────
  // 3KTL–10KTL: 2 MPPT × 1 string = 2 strings
  'SUN2000-3KTL-M0': 2,
  'SUN2000-4KTL-M0': 2,
  'SUN2000-5KTL-M0': 2,
  'SUN2000-6KTL-M0': 2,
  'SUN2000-8KTL-M0': 2,
  'SUN2000-10KTL-M0': 2,
  'SUN2000-3KTL-M1': 2,
  'SUN2000-4KTL-M1': 2,
  'SUN2000-5KTL-M1': 2,
  'SUN2000-6KTL-M1': 2,
  'SUN2000-8KTL-M1': 2,
  'SUN2000-10KTL-M1': 2,
  // 12KTL–20KTL: 2 MPPT × 2 strings = 4 strings
  'SUN2000-12KTL-M1': 4,
  'SUN2000-15KTL-M1': 4,
  'SUN2000-15KTL-M2': 4,
  'SUN2000-17KTL': 4,
  'SUN2000-17KTL-M2': 4,
  'SUN2000-20KTL': 4,
  'SUN2000-20KTL-M0': 4,
  'SUN2000-20KTL-M2': 4,

  // ── Mid commercial (25–60 kW; varies by variant) ───────────────────────
  // The four entries marked [VERIFY DATASHEET] below were flagged in
  // pre-deploy review (2026-05-07). They are not in our current production
  // fleet; values are best-effort from MPPT × strings/MPPT and should be
  // double-checked against Huawei's PDF datasheets before any customer
  // running one of these models is onboarded.
  'SUN2000-25KTL-NA': 4,           // 2 MPPT × 2
  'SUN2000-25KTL-M0': 4,           // 2 MPPT × 2
  'SUN2000-30KTL-A': 4,            // 2 MPPT × 2  [VERIFY DATASHEET]
  'SUN2000-30KTL-M0': 8,           // 4 MPPT × 2  [VERIFY DATASHEET]
  'SUN2000-30KTL-M3': 8,           // 4 MPPT × 2
  'SUN2000-33KTL-A': 4,            // 2 MPPT × 2
  'SUN2000-33KTL-NA': 4,           // 2 MPPT × 2
  'SUN2000-36KTL': 4,              // 2 MPPT × 2
  'SUN2000-40KTL': 4,              // 2 MPPT × 2
  'SUN2000-40KTL-M3': 8,           // 4 MPPT × 2
  'SUN2000-40KTL-MG0': 8,          // 4 MPPT × 2
  'SUN2000-50KTL-M0': 8,           // 4 MPPT × 2  [VERIFY DATASHEET]
  'SUN2000-50KTL-M3': 8,           // 4 MPPT × 2
  'SUN2000-50KTL-JPM0': 8,         // 4 MPPT × 2
  'SUN2000-50KTL-JPM1': 8,         // 4 MPPT × 2
  'SUN2000-60KTL-M0': 12,          // 6 MPPT × 2  [VERIFY DATASHEET]
  'SUN2000-60KTL-HV-D1': 12,       // 6 MPPT × 2
  'SUN2000-60KTL-HV-D1-001': 12,   // 6 MPPT × 2

  // ── Large commercial (100–125 kW, 10 MPPT × 2 = 20 strings) ────────────
  // This family is the production-critical case. Verified against Huawei
  // SUN2000-100KTL/115KTL datasheets and against the user's portal which
  // shows 20 PV input slots per inverter.
  'SUN2000-100KTL-USH0': 20,
  'SUN2000-100KTL-M0': 20,
  'SUN2000-100KTL-M1': 20,
  'SUN2000-100KTL-M2': 20,
  'SUN2000-105KTL-H1': 20,
  'SUN2000-110KTL-M0': 20,
  'SUN2000-115KTL-M0': 20,
  'SUN2000-115KTL-M2': 20,
  'SUN2000-125KTL-M0': 20,
  'SUN2000-125KTL-JPM0': 20,

  // ── Utility-scale (12 MPPT × 2 = 24 strings) ───────────────────────────
  'SUN2000-185KTL-H1': 24,
  'SUN2000-185KTL-INH0': 24,
  'SUN2000-196KTL-H0': 24,
  'SUN2000-215KTL-H0': 24,
  'SUN2000-215KTL-H3': 24,

  // ── Very large utility (18 MPPT × 2 = 36 strings) ──────────────────────
  'SUN2000-330KTL-H1': 36,
}

/**
 * Look up max strings for a Huawei inverter hardware model name.
 *
 * Returns `null` if the model is unknown. Caller should fall back to
 * heuristic detection (highest string number seen in API response) and
 * log a warning so the model can be added to the table.
 *
 * Matching is case-insensitive on the trimmed model string.
 */
export function getHuaweiMaxStrings(model: string | null | undefined): number | null {
  if (!model) return null
  const normalized = model.trim().toUpperCase()
  if (!normalized) return null
  return HUAWEI_MODEL_STRINGS_MAP[normalized] ?? null
}

/**
 * Read-only view of the lookup table. Frozen so consumers (including tests)
 * cannot mutate process-wide state by accident.
 */
export const HUAWEI_MODEL_STRINGS: Readonly<Record<string, number>> =
  Object.freeze({ ...HUAWEI_MODEL_STRINGS_MAP })
