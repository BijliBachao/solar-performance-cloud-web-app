import { describe, it, expect } from 'vitest'
import {
  classifyDataCompleteness,
  shouldFlagRawSensorFault,
  COMPLETENESS_EXCELLENT,
  COMPLETENESS_GOOD,
  COMPLETENESS_ACCEPTABLE,
  COMPLETENESS_POOR,
  PERF_DISPLAY_MAX,
  SENSOR_FAULT_RAW_PCT,
  type CompletenessBand,
} from '@/lib/string-health'
import { COMPLETENESS_BAND_STYLES, completenessStyleFromPct } from '@/lib/design-tokens'

// Chunk E — Reyyan §9 "Data Completeness" + §10 second table.
// Completeness is a separate DATA-QUALITY axis from performance, purely
// informational (never a fault). It's measured as hours-of-coverage out of the 8
// window hours (cadence-proof), so the reachable values are 8/8=100, 7/8≈88,
// 6/8=75, 5/8≈63 (below 5h is gated). Cutpoints map each to a distinct band:
// Excellent=8h(95–100) / Good=7h(80–95) / Acceptable=6h(70–80) / Poor=5h(60–70) /
// Insufficient=<5h(<60). Upper band owns each edge.

describe('classifyDataCompleteness — V1 §10 completeness bands (hours-of-coverage scale)', () => {
  it('null → null (legacy / no-data day, not 0%)', () => {
    expect(classifyDataCompleteness(null)).toBeNull()
  })

  it('each reachable hours-of-coverage step maps to its own band', () => {
    expect(classifyDataCompleteness(100)).toBe('excellent')   // 8/8
    expect(classifyDataCompleteness(88)).toBe('good')         // 7/8 ≈ 87.5 → 88
    expect(classifyDataCompleteness(75)).toBe('acceptable')   // 6/8
    expect(classifyDataCompleteness(63)).toBe('poor')         // 5/8 ≈ 62.5 → 63
    expect(classifyDataCompleteness(50)).toBe('insufficient') // 4/8 (gated in practice)
  })

  it('upper band owns each edge', () => {
    expect(classifyDataCompleteness(95)).toBe('excellent')
    expect(classifyDataCompleteness(94.9)).toBe('good')
    expect(classifyDataCompleteness(80)).toBe('good')
    expect(classifyDataCompleteness(79.9)).toBe('acceptable')
    expect(classifyDataCompleteness(70)).toBe('acceptable')
    expect(classifyDataCompleteness(69.9)).toBe('poor')
    expect(classifyDataCompleteness(60)).toBe('poor')
    expect(classifyDataCompleteness(59.9)).toBe('insufficient')
    expect(classifyDataCompleteness(0)).toBe('insufficient')
  })

  it('band lower-bounds match the COMPLETENESS_* constants', () => {
    expect([
      COMPLETENESS_EXCELLENT,
      COMPLETENESS_GOOD,
      COMPLETENESS_ACCEPTABLE,
      COMPLETENESS_POOR,
    ]).toEqual([95, 80, 70, 60])
  })
})

describe('completenessStyleFromPct — routes through the classifier', () => {
  const cases: Array<[number, CompletenessBand]> = [
    [100, 'excellent'], // 8/8
    [95, 'excellent'],
    [88, 'good'],       // 7/8
    [75, 'acceptable'], // 6/8
    [63, 'poor'],       // 5/8
    [40, 'insufficient'],
  ]

  it('returns the matching COMPLETENESS_BAND_STYLES entry for each band', () => {
    for (const [pct, band] of cases) {
      expect(completenessStyleFromPct(pct)).toBe(COMPLETENESS_BAND_STYLES[band])
    }
  })

  it('null → null (no style for an unscored / legacy day)', () => {
    expect(completenessStyleFromPct(null)).toBeNull()
  })

  it('labels are exactly the spec wording', () => {
    expect(COMPLETENESS_BAND_STYLES.excellent.label).toBe('Excellent')
    expect(COMPLETENESS_BAND_STYLES.good.label).toBe('Good')
    expect(COMPLETENESS_BAND_STYLES.acceptable.label).toBe('Acceptable')
    expect(COMPLETENESS_BAND_STYLES.poor.label).toBe('Poor')
    expect(COMPLETENESS_BAND_STYLES.insufficient.label).toBe('Insufficient')
  })

  it('uses a palette DISTINCT from the performance bands (separate data-quality axis)', () => {
    // §9: completeness must NOT read as "another performance score". The
    // performance bands are emerald/yellow/orange/red/slate; completeness uses a
    // cool/neutral family. Guard: no completeness band borrows the signature
    // emerald-50/yellow-100/orange-200/red-200 performance cell washes.
    const fgs = Object.values(COMPLETENESS_BAND_STYLES).map(s => s.fg)
    expect(fgs).not.toContain('text-emerald-600 font-medium')
    expect(fgs.some(fg => fg.includes('emerald'))).toBe(false)
  })
})

describe('shouldFlagRawSensorFault — §6 admin-only raw-% sensor-fault gate', () => {
  it('flags only when admin AND raw exceeds the impossible-reading bar (>200%)', () => {
    expect(shouldFlagRawSensorFault(true, 300)).toBe(true)
    expect(shouldFlagRawSensorFault(true, SENSOR_FAULT_RAW_PCT + 0.1)).toBe(true)
  })

  it('never flags in the customer (non-admin) view, even at 300%', () => {
    expect(shouldFlagRawSensorFault(false, 300)).toBe(false)
  })

  it('does NOT flag merely-above-median strings (>100% is normal for ~half of strings)', () => {
    // The whole point of the fix: 110%, 150%, even 200% are NOT sensor faults.
    expect(shouldFlagRawSensorFault(true, PERF_DISPLAY_MAX + 0.1)).toBe(false) // 100.1%
    expect(shouldFlagRawSensorFault(true, 150)).toBe(false)
    expect(shouldFlagRawSensorFault(true, SENSOR_FAULT_RAW_PCT)).toBe(false)   // 200% exactly — strict >
    expect(shouldFlagRawSensorFault(true, 88)).toBe(false)
  })

  it('does not flag when raw is null/undefined (no score)', () => {
    expect(shouldFlagRawSensorFault(true, null)).toBe(false)
    expect(shouldFlagRawSensorFault(true, undefined)).toBe(false)
  })
})
