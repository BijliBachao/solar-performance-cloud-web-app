/**
 * Data Quality — central per-reading classifier (Layer 2).
 *
 * The missing layer between RAW capture (string_measurements) and REPORTING
 * (donut/analysis/alerts). Every per-string reading passes through here to get
 * a trust verdict, so downstream surfaces only compute from trustworthy data
 * and flag the rest — instead of silently filtering real faults or displaying
 * garbage.
 *
 * PURE + stateless: frozen-value detection takes recent history as an argument.
 * Not yet wired into the pollers — wiring the write path is a separate,
 * deliberate step (it changes stored semantics).
 *
 * Standards: IEC 61724-1 clause 12 (night gate, dead-value, range/physics
 * checks); confirmed by the 2026-05-24/25 live audit.
 * Spec: Working/2_Sunday_24_May_2026/PROVIDER-DATA-INTEGRITY-AUDIT.md
 */

import {
  ACTIVE_CURRENT_THRESHOLD,
  MAX_STRING_CURRENT_A,
  MAX_STRING_POWER_W,
} from '@/lib/string-health'
import { isDaylight } from '@/lib/solar-geometry'

/** Upper bound for a single-string DC voltage (V). Above = sensor fault /
 * sentinel (e.g., SolarMAN's 6553.5 = 65535/10 uint16 overflow). Covers
 * 1000V and 1500V system classes with margin. */
export const MAX_STRING_VOLTAGE_V = 1600

/** Current below −this (amps) during daylight = reverse current (failed
 * bypass diode / severe mismatch — a real fault). Small negatives near zero
 * are dawn/dusk diode leakage and are NOT flagged. Anchored on the Huawei
 * −17A finding (2026-05-24). */
export const REVERSE_CURRENT_THRESHOLD_A = 1.0

/** How many consecutive byte-identical (V,I) samples mark a reading as
 * frozen/stale (dead-value detection, IEC 61724-1 §12.2.1). 3 polls ≈ 15 min. */
export const FROZEN_REPEAT_COUNT = 3

export type ReadingVerdict =
  | 'valid'           // trustworthy live reading — use for metrics
  | 'night'           // sun below the daylight gate — expected dark
  | 'frozen'          // identical to recent readings — stale/cached
  | 'sensor_fault'    // physically impossible — out of range / sentinel
  | 'reverse_current' // current flowing backward — real electrical fault
  | 'open_circuit'    // voltage present, ~0 current in daylight — wiring break

export interface RawReading {
  voltage: number
  current: number
  /** Vendor-reported power. NOT trusted — we always reconcile to V×I. */
  power?: number
}

export interface ClassifyContext {
  /** Plant coordinates for the sun-elevation gate (null → gate disabled, fail-safe to daylight). */
  lat: number | null
  lng: number | null
  timestamp: Date
  /** Recent (V,I) samples for THIS string, most-recent-first, for frozen detection. */
  recent?: Array<{ voltage: number; current: number }>
}

export interface ClassifiedReading {
  verdict: ReadingVerdict
  /** Safe to use for performance metrics / aggregates? */
  trustworthy: boolean
  /** Reconciled power = V×I (we never trust the vendor power field). */
  power: number
  /** Fault to route to the alarm pipeline, if any. */
  alarm: 'reverse_current' | 'open_circuit' | null
}

function isFrozen(reading: RawReading, recent: Array<{ voltage: number; current: number }> | undefined): boolean {
  if (!recent || recent.length < FROZEN_REPEAT_COUNT - 1) return false
  // Need (FROZEN_REPEAT_COUNT − 1) prior samples identical to the current one.
  const window = recent.slice(0, FROZEN_REPEAT_COUNT - 1)
  return window.every(
    (r) => r.voltage === reading.voltage && r.current === reading.current,
  )
}

/**
 * Classify one per-string reading. Order matters: physical impossibility and
 * real faults are decided BEFORE the night gate, so a genuine daytime fault
 * is never masked as "night".
 */
export function classifyReading(reading: RawReading, ctx: ClassifyContext): ClassifiedReading {
  const v = reading.voltage
  const i = reading.current
  const reconciledPower = v * i

  // 1. Sensor fault — physically impossible / sentinel values.
  const outOfRange =
    !Number.isFinite(v) || !Number.isFinite(i) ||
    v > MAX_STRING_VOLTAGE_V ||
    Math.abs(i) > MAX_STRING_CURRENT_A ||
    reconciledPower > MAX_STRING_POWER_W
  if (outOfRange) {
    return { verdict: 'sensor_fault', trustworthy: false, power: 0, alarm: null }
  }

  // 2. Reverse current — current flowing backward into the string. Real fault.
  if (i < -REVERSE_CURRENT_THRESHOLD_A) {
    return { verdict: 'reverse_current', trustworthy: false, power: reconciledPower, alarm: 'reverse_current' }
  }

  // 3. Night — sun below the daylight gate. Expected dark; not a fault.
  //    Decided AFTER faults so a daytime fault is never mislabeled night.
  const daylight = isDaylight(ctx.lat ?? NaN, ctx.lng ?? NaN, ctx.timestamp)
  if (!daylight) {
    return { verdict: 'night', trustworthy: false, power: reconciledPower, alarm: null }
  }

  // 4. Frozen / dead value — identical to recent samples (stale cache).
  if (isFrozen(reading, ctx.recent)) {
    return { verdict: 'frozen', trustworthy: false, power: reconciledPower, alarm: null }
  }

  // 5. Open circuit — voltage present but ~no current, in daylight. Wiring
  //    break / blown fuse / disconnected string. Real fault.
  if (v > 0 && Math.abs(i) < ACTIVE_CURRENT_THRESHOLD) {
    return { verdict: 'open_circuit', trustworthy: false, power: reconciledPower, alarm: 'open_circuit' }
  }

  // 6. Valid — trustworthy live reading. Power reconciled to V×I.
  return { verdict: 'valid', trustworthy: true, power: reconciledPower, alarm: null }
}
