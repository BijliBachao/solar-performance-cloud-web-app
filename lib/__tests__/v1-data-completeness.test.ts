import { describe, it, expect } from 'vitest'
import {
  classifyDataCompleteness,
  shouldFlagRawSensorFault,
  COMPLETENESS_EXCELLENT,
  COMPLETENESS_GOOD,
  COMPLETENESS_ACCEPTABLE,
  COMPLETENESS_POOR,
  PERF_DISPLAY_MAX,
  type CompletenessBand,
} from '@/lib/string-health'
import { COMPLETENESS_BAND_STYLES, completenessStyleFromPct } from '@/lib/design-tokens'

// Chunk E — Reyyan §9 "Data Completeness" + §10 second table.
// Completeness is a separate DATA-QUALITY axis from performance. It has its own
// 5 bands (Excellent 95–100 / Good 90–95 / Acceptable 80–90 / Poor 60–80 /
// Insufficient <60) with the SAME "upper band owns the edge" convention as the
// locked performance bands. It is NEVER itself a fault — purely informational.

describe('classifyDataCompleteness — V1 §10 completeness bands', () => {
  it('null → null (legacy / no-data day, not 0%)', () => {
    expect(classifyDataCompleteness(null)).toBeNull()
  })

  it('upper band owns each edge (matches the locked performance convention)', () => {
    expect(classifyDataCompleteness(100)).toBe('excellent')
    expect(classifyDataCompleteness(95)).toBe('excellent')
    expect(classifyDataCompleteness(94.9)).toBe('good')
    expect(classifyDataCompleteness(90)).toBe('good')
    expect(classifyDataCompleteness(89.9)).toBe('acceptable')
    expect(classifyDataCompleteness(80)).toBe('acceptable')
    expect(classifyDataCompleteness(79.9)).toBe('poor')
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
    ]).toEqual([95, 90, 80, 60])
  })
})

describe('completenessStyleFromPct — routes through the classifier', () => {
  const cases: Array<[number, CompletenessBand]> = [
    [100, 'excellent'],
    [95, 'excellent'],
    [92, 'good'],
    [85, 'acceptable'],
    [70, 'poor'],
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
  it('flags only when admin AND raw > display cap', () => {
    expect(shouldFlagRawSensorFault(true, 300)).toBe(true)
    expect(shouldFlagRawSensorFault(true, PERF_DISPLAY_MAX + 0.1)).toBe(true)
  })

  it('never flags in the customer (non-admin) view, even at 300%', () => {
    expect(shouldFlagRawSensorFault(false, 300)).toBe(false)
  })

  it('does not flag a raw % at or below the display cap', () => {
    expect(shouldFlagRawSensorFault(true, PERF_DISPLAY_MAX)).toBe(false)
    expect(shouldFlagRawSensorFault(true, 88)).toBe(false)
  })

  it('does not flag when raw is null/undefined (no score)', () => {
    expect(shouldFlagRawSensorFault(true, null)).toBe(false)
    expect(shouldFlagRawSensorFault(true, undefined)).toBe(false)
  })
})
