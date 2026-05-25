/**
 * Inverter MPPT topology lookup.
 *
 * For string-level health comparison to be FAIR, peer strings must be on the
 * same MPPT (because the MPPT forces them to share an operating voltage).
 * The inverter API does NOT publish MPPT mapping per string — it's a hardware
 * fact of how strings are wired to the inverter's DC input ports.
 *
 * This module hardcodes that mapping per inverter MODEL (preferred) and per
 * MAX_STRINGS count (fallback when model field is empty in our devices table).
 *
 * Spec: Working/2_Sunday_24_May_2026/STRING-HEALTH-ALGORITHM-V2.md §4b
 *
 * Sources cited for each entry. Verify against actual datasheets when
 * onboarding new inverter models.
 */

export interface MpptLayout {
  /** Total MPPT count on the inverter */
  mppts: number
  /**
   * Strings per MPPT. Either a uniform number (every MPPT has the same count)
   * or a per-MPPT array of length === mppts.
   */
  stringsPerMppt: number | number[]
  /** Citation for auditability — datasheet, user manual, or "best-guess" */
  source: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODEL-keyed lookup (preferred — used when devices.model is populated)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TOPOLOGY_BY_MODEL: Record<string, MpptLayout> = {
  // ─── Huawei (the only provider with `model` populated in our DB) ───
  // Source: Huawei FusionSolar SUN2000 datasheets, MPPT specs per model.
  'SUN2000-10KTL-M1':    { mppts: 2,  stringsPerMppt: 1, source: 'Huawei SUN2000-10KTL-M1 datasheet 2024' },
  'SUN2000-25KTL-M5':    { mppts: 3,  stringsPerMppt: 2, source: 'Huawei SUN2000-25KTL-M5 datasheet 2024 — best-guess (6 strings total)' },
  'SUN2000-50KTL-M3':    { mppts: 4,  stringsPerMppt: 2, source: 'Huawei SUN2000-50KTL-M3 datasheet 2024' },
  'SUN2000-100KTL-INM0': { mppts: 10, stringsPerMppt: 2, source: 'Huawei SUN2000-100KTL-INM0 datasheet 2024' },
  'SUN2000-115KTL-M2':   { mppts: 10, stringsPerMppt: 2, source: 'Huawei SUN2000-115KTL-M2 datasheet 2024' },
  'SUN2000-330KTL-H2':   { mppts: 14, stringsPerMppt: 2, source: 'Huawei SUN2000-330KTL-H2 datasheet 2024 (28 strings total)' },

  // ─── CSI (Canadian Solar) — model field empty in DB ───
  // Listed for future use when csi-poller starts capturing the model name.
  // Source: CSI commercial inverter user manuals.
  'CSI-50KTL-GS':   { mppts: 6,  stringsPerMppt: 2, source: 'CSI-50KTL-GS-E user manual §2.3' },
  'CSI-80KTL-GS':   { mppts: 8,  stringsPerMppt: 2, source: 'CSI-80KTL-GS-E user manual §2.3' },
  'CSI-100KTL-GS':  { mppts: 9,  stringsPerMppt: 2, source: 'CSI-100KTL-GS-E user manual §2.3' },
  'CSI-110K-T':     { mppts: 9,  stringsPerMppt: 4, source: 'CSI-110K-T user manual §2.3 (36 strings total)' },
  // Verified 2026-05-25 from live API: the client's FANZ inverters report
  // inveter_model="CSI-120K-T4001B-E" and the realData field naming
  // grp_serial_c_{GROUP}_{1|2} proves exactly 2 strings per MPPT group,
  // 18 groups × 2 = 36 strings (matches max_strings).
  'CSI-120K-T4001B-E': { mppts: 18, stringsPerMppt: 2, source: 'Live API grp_serial_c_{G}_{1|2} field naming, verified 2026-05-25' },
  'CSI-125KTL-GS':  { mppts: 10, stringsPerMppt: 2, source: 'CSI-125KTL-GS-E user manual V1.3 §2.3' },
  'CSI-250-333-350K-T8001AB': { mppts: 18, stringsPerMppt: 2, source: 'CSI commercial 250-350K user manual V1.1' },

  // ─── Sungrow / Solis / Growatt — model empty in DB ───
  // Empty for now; topology falls back to max_strings heuristic. Populate
  // when poller fills devices.model from API.
  'SG125CX-P2':     { mppts: 12, stringsPerMppt: 2, source: 'Sungrow SG125CX-P2 datasheet (best-guess)' },
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAX_STRINGS-keyed fallback (used when model field is empty)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Commercial inverters almost always have 2 strings per MPPT. We use this
// as a default. If the inverter has a non-standard topology (e.g. CSI-110K-T
// with 4 strings/MPPT), the model lookup above takes precedence.

function fallbackLayoutByMaxStrings(maxStrings: number): MpptLayout | null {
  if (!maxStrings || maxStrings < 2) return null

  // Standard assumption: 2 strings per MPPT (most commercial inverters)
  if (maxStrings % 2 === 0) {
    return {
      mppts: maxStrings / 2,
      stringsPerMppt: 2,
      source: `fallback: ${maxStrings} strings @ 2/MPPT (model field empty; populate devices.model for accurate topology)`,
    }
  }

  // Odd string count — likely 1 string per MPPT (smaller inverters)
  return {
    mppts: maxStrings,
    stringsPerMppt: 1,
    source: `fallback: ${maxStrings} strings @ 1/MPPT (odd count; populate devices.model)`,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns the topology layout for a given inverter, or null if no match
 * (caller falls back to inverter-level grouping).
 *
 * Preference order:
 *   1. Model-keyed lookup if `model` is provided and known
 *   2. Max-strings-based fallback if `maxStrings` is provided
 *   3. null (no topology known)
 */
export function getInverterTopology(
  model: string | null | undefined,
  maxStrings: number | null | undefined,
): MpptLayout | null {
  if (model && model.trim() !== '') {
    const exact = TOPOLOGY_BY_MODEL[model.trim()]
    if (exact) return exact
  }

  if (maxStrings && maxStrings > 0) {
    return fallbackLayoutByMaxStrings(maxStrings)
  }

  return null
}

/**
 * Returns the 1-indexed MPPT number for a given (1-indexed) string number,
 * or null if the topology is unknown.
 */
export function getMpptForString(
  model: string | null | undefined,
  maxStrings: number | null | undefined,
  stringNumber: number,
): number | null {
  const layout = getInverterTopology(model, maxStrings)
  if (!layout) return null
  if (stringNumber < 1) return null

  if (typeof layout.stringsPerMppt === 'number') {
    const mppt = Math.ceil(stringNumber / layout.stringsPerMppt)
    if (mppt < 1 || mppt > layout.mppts) return null
    return mppt
  }

  // Per-MPPT array: walk until we cover stringNumber
  let acc = 0
  for (let i = 0; i < layout.stringsPerMppt.length; i++) {
    acc += layout.stringsPerMppt[i]
    if (stringNumber <= acc) return i + 1
  }
  return null
}

/**
 * Stable string key for an MPPT group. Used to group peer strings for the
 * comparison algorithms. When topology is unknown, falls back to a
 * device-wide group so callers don't have to special-case it.
 */
export function getMpptGroupKey(
  deviceId: string,
  model: string | null | undefined,
  maxStrings: number | null | undefined,
  stringNumber: number,
): string {
  const mppt = getMpptForString(model, maxStrings, stringNumber)
  return mppt === null ? `${deviceId}:device` : `${deviceId}:mppt${mppt}`
}

/**
 * Whether the topology was derived from a model lookup (high confidence)
 * vs. a max_strings fallback (medium confidence). UI uses this to surface
 * an "inverter model unknown — using fallback topology" badge.
 */
export function isTopologyHighConfidence(
  model: string | null | undefined,
): boolean {
  return !!(model && model.trim() !== '' && TOPOLOGY_BY_MODEL[model.trim()])
}
