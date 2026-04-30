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
  HEALTH_HEALTHY,
  HEALTH_CAUTION,
  HEALTH_WARNING,
  HEALTH_SEVERE,
  type StringStatus,
  type AlertSeverity,
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
  // Indigo — distinct from healthy/warning/critical (status) and from offline
  // (no data). Conveys "intentionally out of peer pool" — admin flagged this
  // string as non-standard install (wall, east/west, shaded). Producing real
  // energy; just not peer-comparable.
  'peer-excluded': {
    fg: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    solid: 'bg-indigo-600 text-white',
    dot: 'bg-indigo-500',
    label: 'Non-standard',
    shortDesc: 'Excluded from peer comparison — non-standard orientation or shaded.',
    fullDesc: 'Admin has flagged this string as a non-standard install (wall mount, east/west tilt, partial shade). Lower output is expected by design, so it is removed from the peer-comparison pool. Hardware alarms, dead-string detection, and stale-data detection remain active. Peer-relative scoring resumes when Performance Ratio (Phase 2) lands.',
    whatToCheck: 'No action needed for the peer flag. Verify any underlying alarms (vendor codes, OPEN_CIRCUIT, OFFLINE) separately.',
  },
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

// ━━━ HEALTH GRADE STYLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// For daily health scores (0–100), heatmaps, monthly reports, performance cells.
// Buckets: >=90 healthy, 75–89 caution, 50–74 warning, 25–49 severe, 0–24 dead.

export type HealthGrade =
  | 'healthy'
  | 'caution'
  | 'warning'
  | 'severe'
  | 'dead'
  | 'no-data'

export interface HealthGradeStyle {
  fg: string
  bg: string
  label: string
}

export const HEALTH_GRADE_STYLES: Record<HealthGrade, HealthGradeStyle> = {
  healthy: { fg: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Healthy' },
  caution: { fg: 'text-amber-800', bg: 'bg-amber-100', label: 'Caution' },
  warning: { fg: 'text-amber-700', bg: 'bg-amber-50', label: 'Warning' },
  severe: { fg: 'text-red-700', bg: 'bg-red-50', label: 'Severe' },
  dead: { fg: 'text-red-900', bg: 'bg-red-100', label: 'Dead' },
  'no-data': { fg: 'text-slate-400', bg: 'bg-slate-50', label: '—' },
}

export function gradeFromScore(score: number | null): HealthGrade {
  if (score === null || score === undefined) return 'no-data'
  if (score >= HEALTH_HEALTHY) return 'healthy'
  if (score >= HEALTH_CAUTION) return 'caution'
  if (score >= HEALTH_WARNING) return 'warning'
  if (score >= HEALTH_SEVERE) return 'severe'
  return 'dead'
}

// ━━━ PROVIDER BADGE STYLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-inverter-brand badge styling. Used wherever a plant/device is listed.

export type ProviderKey = 'huawei' | 'solis' | 'growatt' | 'sungrow'

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
