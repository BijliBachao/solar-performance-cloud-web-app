/**
 * SPC Design Tokens — centralized style lookups for status, providers, and health grades.
 *
 * Single source of truth for all semantic color usage across components.
 * Pair with DESIGN.md (root), tailwind.config.ts, and app/globals.css.
 *
 * USAGE:
 *   import { STATUS_STYLES, statusKeyFromStringStatus } from '@/lib/design-tokens'
 *   const style = STATUS_STYLES[statusKeyFromStringStatus(string.status)]
 *   <span className={`${style.fg} ${style.bg} border ${style.border}`}>...</span>
 *
 * RULE: components MUST NOT hardcode Tailwind color classes for status/health/provider.
 *       Always go through a lookup from this module.
 */

import {
  PLANT_HEALTH_HEALTHY,
  PLANT_HEALTH_FAULTY,
  classifyStringPerformance,
  classifyDataCompleteness,
  perfBandToDonutBucket,
  type PerfBand,
  type CompletenessBand,
  type StringStatus,
  type AlertSeverity,
  type ConnectivityStatus,
  type PlantOpStatus,
} from '@/lib/string-health'

// ━━━ STATUS STYLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Used for string-level status, alert severity, plant health, and any
// "this is the current state" indicator across the app.

export type StatusKey =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'offline'
  | 'open-circuit'
  | 'info'
  | 'peer-excluded'
  | 'frozen'
  | 'idle'

export interface StatusStyle {
  fg: string // text + icon color
  bg: string // soft background wash (for badges, row highlights)
  border: string // matching border
  solid: string // solid-fill variant (for buttons, active indicators)
  dot: string // dot indicator (stats bars, legend markers)
  label: string // default display label
  shortDesc: string // one-line description (tooltips, compact legends)
  fullDesc: string // full explanation (Fault Diagnosis panel, help card)
  whatToCheck: string // actionable next step
}

export const STATUS_STYLES: Record<StatusKey, StatusStyle> = {
  healthy: {
    fg: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    solid: 'bg-emerald-600 text-white',
    dot: 'bg-emerald-500',
    label: 'Healthy',
    shortDesc: 'Producing normally — output matches peer strings.',
    fullDesc: 'The string is producing current very close to what its neighbour strings on the same inverter are producing. Everything is working correctly.',
    whatToCheck: 'No action needed. Continue routine monitoring.',
  },
  warning: {
    fg: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    solid: 'bg-amber-600 text-white',
    dot: 'bg-amber-500',
    label: 'Underperforming',
    shortDesc: 'Producing 10 – 50% less than peer strings.',
    fullDesc: 'This string is generating noticeably less than its neighbours — typically 10 to 50 percent below. Usual causes: shading (a tree or building casting a shadow), dust or dirt on the panel surface, bird droppings, or minor panel degradation.',
    whatToCheck: 'Check the panel surface during daylight hours. Often a quick clean or trim solves it.',
  },
  critical: {
    fg: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    solid: 'bg-red-600 text-white',
    dot: 'bg-red-500',
    label: 'Major Loss',
    shortDesc: 'Producing more than 50% less than peer strings.',
    fullDesc: 'This string is generating less than half of what its neighbours produce — a serious panel-level problem. Possible causes: heavy permanent shading, physical panel damage (cracked glass, delamination), a failed cell, or severe soiling.',
    whatToCheck: 'On-site inspection is needed — this usually cannot wait. Consider an I-V curve test.',
  },
  offline: {
    fg: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    solid: 'bg-slate-500 text-white',
    dot: 'bg-slate-400',
    label: 'Offline',
    shortDesc: 'No recent data — comms loss or DC input powered off.',
    fullDesc: 'No data is coming from this string. Either the inverter has lost its connection to our monitoring gateway (network outage, router issue, power cut at the inverter), or the string\'s DC input has been switched off at the inverter.',
    whatToCheck: 'Check the inverter local display first. If it shows this string as active, the issue is comms. If the inverter also shows "no input", check DC breakers and physical connections.',
  },
  'open-circuit': {
    // Crimson (rose family) — conveys severity without colliding with CRITICAL's red
    fg: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    solid: 'bg-rose-600 text-white',
    dot: 'bg-rose-500',
    label: '0 A Fault',
    shortDesc: 'Voltage present but no current — wiring break in the DC path.',
    fullDesc: 'The panels ARE generating voltage (sunlight is hitting them, the panels are working) — but zero current is flowing through the string. The electrical circuit has a physical break somewhere between the panels and the inverter. This is NOT a panel issue — inspecting panels is a waste of time.',
    whatToCheck: 'Focus on the wiring path. Check, in order: (1) loose or disconnected MC4 connectors — common after heavy rain, wind, or animals. (2) Blown string fuses in the combiner box. (3) Open string switches or damaged DC isolators. (4) Broken DC cables between panels and combiner.',
  },
  info: {
    fg: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    solid: 'bg-blue-700 text-white',
    dot: 'bg-blue-500',
    label: 'Info',
    shortDesc: 'Informational — monitor the trend.',
    fullDesc: 'An informational signal, typically mild underperformance (less than 10-25 percent below peer average) that may resolve on its own.',
    whatToCheck: 'Monitor trend. If persistent, schedule a routine cleaning or inspection.',
  },
  // Violet — distinct from healthy/warning/critical (status) and from offline
  // (no data). Moved off indigo (indigo is now the brand CTA colour). Conveys
  // "intentionally out of peer pool" — admin flagged this string as non-standard
  // install (wall, east/west, shaded). Producing real energy; just not peer-comparable.
  'peer-excluded': {
    fg: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    solid: 'bg-violet-600 text-white',
    dot: 'bg-violet-500',
    label: 'Non-standard',
    shortDesc: 'Excluded from peer comparison — non-standard orientation or shaded.',
    fullDesc: 'Admin has flagged this string as a non-standard install (wall mount, east/west tilt, partial shade). Lower output is expected by design, so it is removed from the peer-comparison pool. Hardware alarms, dead-string detection, and stale-data detection remain active. Peer-relative scoring resumes when Performance Ratio (Phase 2) lands.',
    whatToCheck: 'No action needed for the peer flag. Verify any underlying alarms (vendor codes, OPEN_CIRCUIT, OFFLINE) separately.',
  },
  // Orange — distinct from warning's amber. Inverter is still "connected" but the
  // vendor's data has not advanced for 2h+ during daylight: the feed is stalled
  // (the CSI 2026-05-25 failure mode). Connectivity status, not a panel issue.
  frozen: {
    fg: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    solid: 'bg-orange-600 text-white',
    dot: 'bg-orange-500',
    label: 'Frozen',
    shortDesc: 'Data feed stalled — no new readings for 2h+ during daylight.',
    fullDesc: 'The inverter is still reachable but its data stopped advancing — we are receiving the same readings every poll. Usually a datalogger or vendor-cloud problem (the logger lost its uplink, or the monitoring portal is serving a cached snapshot), not a panel or string fault.',
    whatToCheck: 'Check the datalogger / WiFi stick at the site (power + network LEDs). If the logger looks healthy, the vendor monitoring portal may be stalled — open a ticket with the vendor quoting the "last data" time.',
  },
  // Muted slate — calmer than offline. No data, but the sun is down, so this is
  // expected and not an alarm.
  idle: {
    fg: 'text-slate-400',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    solid: 'bg-slate-400 text-white',
    dot: 'bg-slate-300',
    label: 'Idle (night)',
    shortDesc: 'No data — sun is down. Expected; not a fault.',
    fullDesc: 'The sun is below the production threshold for this plant, so the inverter is not generating and not reporting. This is normal overnight behaviour and is not an alarm.',
    whatToCheck: 'No action needed. Connectivity is re-evaluated automatically after sunrise.',
  },
}

/** Connectivity status → StatusKey. live reuses the green "healthy" style. */
export function statusKeyFromConnectivity(c: ConnectivityStatus): StatusKey {
  switch (c) {
    case 'live': return 'healthy'
    case 'frozen': return 'frozen'
    case 'offline': return 'offline'
    case 'idle': return 'idle'
  }
}

/** Unified plant operational status → StatusKey (Status Unification 2026-06-05).
 *  THE mapper for plant-level status chips on every screen. */
export function statusKeyFromPlantOp(s: PlantOpStatus): StatusKey {
  switch (s) {
    case 'live': return 'healthy'
    case 'idle': return 'idle'
    case 'frozen': return 'frozen'
    case 'offline': return 'offline'
    case 'faulty': return 'critical'
  }
}

// ━━━ MAPPERS: domain state → StatusKey ━━━━━━━━━━━━━━━━━━━━━━━━━━
// One function per place where state is produced. Components use these
// instead of branching on the raw state themselves.

export function statusKeyFromStringStatus(s: StringStatus): StatusKey {
  switch (s) {
    case 'NORMAL':
      return 'healthy'
    case 'WARNING':
      return 'warning'
    case 'CRITICAL':
      return 'critical'
    case 'OPEN_CIRCUIT':
      return 'open-circuit'
    case 'OFFLINE':
      return 'offline'
  }
}

export function statusKeyFromSeverity(severity: string): StatusKey {
  const s = severity.toUpperCase() as AlertSeverity | string
  if (s === 'CRITICAL') return 'critical'
  if (s === 'WARNING') return 'warning'
  if (s === 'INFO') return 'info'
  return 'offline'
}

export function statusKeyFromPlantHealth(state: number | null): StatusKey {
  if (state === PLANT_HEALTH_HEALTHY) return 'healthy'
  if (state === PLANT_HEALTH_FAULTY) return 'critical'
  return 'offline'
}

export function plantHealthLabel(state: number | null): string {
  if (state === PLANT_HEALTH_HEALTHY) return 'Healthy'
  if (state === PLANT_HEALTH_FAULTY) return 'Faulty'
  return 'Disconnected'
}

// ━━━ V1 PERFORMANCE-BAND CELL STYLES (3 colours) ━━━━━━━━━━━━━━━━
// THE central 3-band → Tailwind map for per-string DAILY-score cells
// (/analysis daily cells, perf/avail columns, PerformanceCell, monthly report).
// 3-band rebrand (2026-06-12): cells show the 3 perf bands as 3 distinct
// colours; the donut + NOC roll these up to 3 arcs via perfBandToDonutBucket —
// BOTH derive from the ONE classifier (classifyStringPerformance), so a cell
// colour and its donut arc can never disagree. Band cutpoints live in
// string-health.ts (85 / 50).
//
//   normal  (≥85)      → green   (emerald)  — "OK"
//   watch   ([50,85))  → light orange       — "Watch"
//   critical (<50)     → red                — "Critical"
//   insufficient_data  → muted grey (no score)
//   unused/peer_excluded → handled by callers (rendered blank / chip), no cell wash

export interface PerfBandStyle {
  /** text colour for the value (used by perf/avail metric cells + status text) */
  fg: string
  /** background wash for a coloured table cell */
  bg: string
  /** combined cell className (bg + text + weight) for the daily-score cells.
   *  Empty string for 'normal' so a green cell reads as the plain/clean default. */
  cell: string
  /** dot indicator (segmented bars, legends) */
  dot: string
  label: string
}

export const PERF_BAND_STYLES: Record<PerfBand, PerfBandStyle> = {
  normal: {
    fg: 'text-emerald-600 font-medium',
    bg: 'bg-emerald-50',
    cell: '', // clean default — a healthy string needs no wash
    dot: 'bg-emerald-500',
    label: 'OK',
  },
  watch: {
    // LIGHT orange (orange-100 wash, orange-400 dot) — deliberately lighter than
    // the retired underperforming band's orange-200, to read as "keep an eye on
    // it" rather than a hard fault.
    fg: 'text-orange-700 font-semibold',
    bg: 'bg-orange-100',
    cell: 'bg-orange-100 text-orange-800 font-bold',
    dot: 'bg-orange-400',
    label: 'Watch',
  },
  critical: {
    fg: 'text-red-700 font-bold',
    bg: 'bg-red-100',
    cell: 'bg-red-100 text-red-800 font-bold',
    dot: 'bg-red-500',
    label: 'Critical',
  },
  insufficient_data: {
    fg: 'text-gray-400',
    bg: 'bg-gray-100',
    cell: 'bg-gray-100 text-gray-400',
    dot: 'bg-gray-300',
    label: 'No data',
  },
  unused: {
    fg: 'text-gray-300',
    bg: 'bg-gray-50',
    cell: 'bg-gray-50 text-gray-300',
    dot: 'bg-gray-200',
    label: 'Unused',
  },
  peer_excluded: {
    fg: 'text-violet-700',
    bg: 'bg-violet-50',
    cell: 'bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
    label: 'Non-standard',
  },
}

/** Convenience: a daily score (capped %) → its V1 band style. Wraps the central
 *  classifier so callers never re-derive band→colour from raw numbers. A null
 *  score (or null overall) lands on insufficient_data → muted grey. */
export function perfBandStyleFromScore(score: number | null | undefined): PerfBandStyle {
  const band = classifyStringPerformance(score ?? null, {
    isUsed: true,
    peerExcluded: false,
    insufficientData: false,
  })
  return PERF_BAND_STYLES[band]
}

// ━━━ V1 DATA-COMPLETENESS BAND STYLES (5 bands, data-QUALITY axis) ━━━━━━━━━━━
// Reyyan §9: completeness MUST read as a SEPARATE axis from performance — "do
// not merge performance and data completeness". So this palette is deliberately
// DISTINCT from PERF_BAND_STYLES (emerald/yellow/orange/red/slate): a cool /
// neutral family (sky → slate → amber → slate) signals "this is about how much
// DATA we received", not "how well the string performed". Completeness is never
// itself a fault — these styles are informational chips only. Band cutpoints
// live in string-health.ts (COMPLETENESS_* = 95/90/80/60).

export interface CompletenessBandStyle {
  fg: string // text + icon colour
  bg: string // soft background wash (chip)
  border: string // matching border
  dot: string // dot indicator
  label: string // display label (exact spec wording)
}

export const COMPLETENESS_BAND_STYLES: Record<CompletenessBand, CompletenessBandStyle> = {
  excellent: {
    fg: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    dot: 'bg-sky-600',
    label: 'Excellent',
  },
  good: {
    fg: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    dot: 'bg-sky-400',
    label: 'Good',
  },
  acceptable: {
    fg: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    dot: 'bg-slate-500',
    label: 'Acceptable',
  },
  poor: {
    fg: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    label: 'Poor',
  },
  insufficient: {
    fg: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
    label: 'Insufficient',
  },
}

/** Convenience: a completeness % → its band style. Wraps the central classifier
 *  so callers never re-derive band→colour from raw numbers. null (legacy /
 *  no-data day) → null so the caller can render "not available", never a 0%. */
export function completenessStyleFromPct(pct: number | null | undefined): CompletenessBandStyle | null {
  const band = classifyDataCompleteness(pct ?? null)
  return band ? COMPLETENESS_BAND_STYLES[band] : null
}

// ━━━ HEALTH GRADE STYLES (3-band rollup) ━━━━━━━━━━━━━━━━━━━━━━━━
// For PLANT-LEVEL aggregate health % and 3-band rollup surfaces (heatmaps,
// monthly summary headers). Derived from the SAME classifier as the cells via
// the donut rollup, so the cutpoints move in lockstep with the cells:
//   normal→healthy, watch→warning, critical→critical.

export type HealthGrade =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'no-data'

export interface HealthGradeStyle {
  fg: string
  bg: string
  label: string
}

export const HEALTH_GRADE_STYLES: Record<HealthGrade, HealthGradeStyle> = {
  healthy: { fg: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Healthy' },
  warning: { fg: 'text-amber-700', bg: 'bg-amber-50', label: 'Warning' },
  critical: { fg: 'text-red-700', bg: 'bg-red-50', label: 'Critical' },
  'no-data': { fg: 'text-slate-400', bg: 'bg-slate-50', label: '—' },
}

export function gradeFromScore(score: number | null): HealthGrade {
  const donut = perfBandToDonutBucket(
    classifyStringPerformance(score ?? null, {
      isUsed: true,
      peerExcluded: false,
      insufficientData: false,
    }),
  )
  switch (donut) {
    case 'healthy': return 'healthy'
    case 'abnormal': return 'warning'
    case 'critical': return 'critical'
    default: return 'no-data'
  }
}

// ━━━ PROVIDER BADGE STYLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-inverter-brand badge styling. Used wherever a plant/device is listed.

export type ProviderKey = 'huawei' | 'solis' | 'growatt' | 'sungrow' | 'csi'

export interface ProviderBadgeStyle {
  fg: string
  bg: string
  border: string
  label: string
}

export const PROVIDER_BADGE_STYLES: Record<ProviderKey, ProviderBadgeStyle> = {
  huawei: {
    fg: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    label: 'Huawei',
  },
  solis: {
    fg: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Solis',
  },
  growatt: {
    fg: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'Growatt',
  },
  sungrow: {
    fg: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    label: 'Sungrow',
  },
  csi: {
    fg: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'Canadian Solar',
  },
}

/**
 * Look up a provider's badge style from a raw provider string.
 * Returns null for unknown/missing providers so callers can render nothing.
 */
export function providerBadge(provider?: string | null): ProviderBadgeStyle | null {
  if (!provider) return null
  const key = provider.toLowerCase() as ProviderKey
  return PROVIDER_BADGE_STYLES[key] ?? null
}

/**
 * Centralized chart palette — single source for decorative chart/series colours.
 * Charts/SVG read these `var(--chart-N)` strings (defined in globals.css :root),
 * so changing a chart colour is a one-line edit there. Replaces the old
 * gold-containing INVERTER_COLORS / TREND_LINE_COLORS arrays.
 *
 * NOTE: status arcs (healthy/warning/critical) do NOT use this — they stay
 * semantic via STATUS_STYLES / the --status-* vars.
 */
export const CHART_SERIES = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
] as const

/** Dashed reference bands / baseline lines on charts (neutral, not brand). */
export const CHART_REFERENCE = 'var(--color-hairline)'
