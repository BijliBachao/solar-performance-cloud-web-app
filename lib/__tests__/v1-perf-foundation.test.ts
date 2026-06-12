import { describe, it, expect } from 'vitest'
import {
  classifyStringPerformance,
  perfBandToDonutBucket,
  bucketHealthScore,
  PERF_NORMAL,
  PERF_WATCH,
  PERF_UNDERPERFORMING,
  PERF_DEAD,
} from '@/lib/string-health'
import { bucketDonutStatus } from '@/lib/string-health-donut'
import { perfBandStyleFromScore, gradeFromScore, PERF_BAND_STYLES } from '@/lib/design-tokens'

// The V1 classifier + constants are now THE single source for every
// daily-metric band surface. The band CUTOVER (2026-06-11) re-pointed
// bucketHealthScore / bucketDonutStatus / scoreToBucket / the NOC SQL FILTER /
// the design-token cell map / the UI legends ALL onto this one classifier — in
// one atomic change — so the /analysis cells, the per-plant donut, and the NOC
// console can NEVER disagree. The consistency sweep below is the "NOC == cell"
// guard.

const F = { isUsed: true, peerExcluded: false, insufficientData: false }

describe('classifyStringPerformance — V1 single source of truth (inert for now)', () => {
  it('bands by display %, upper band owns the edge', () => {
    expect(classifyStringPerformance(100, F)).toBe('normal')
    expect(classifyStringPerformance(95, F)).toBe('normal')
    expect(classifyStringPerformance(94.9, F)).toBe('watch')
    expect(classifyStringPerformance(85, F)).toBe('watch')
    expect(classifyStringPerformance(84.9, F)).toBe('underperforming')
    expect(classifyStringPerformance(60, F)).toBe('underperforming')
    expect(classifyStringPerformance(59.9, F)).toBe('serious_fault')
    expect(classifyStringPerformance(10, F)).toBe('serious_fault')
    expect(classifyStringPerformance(9.9, F)).toBe('dead')
    expect(classifyStringPerformance(0, F)).toBe('dead')
  })

  it('flag overrides beat the number', () => {
    expect(classifyStringPerformance(100, { ...F, isUsed: false })).toBe('unused')
    expect(classifyStringPerformance(100, { ...F, peerExcluded: true })).toBe('peer_excluded')
    expect(classifyStringPerformance(100, { ...F, insufficientData: true })).toBe('insufficient_data')
    expect(classifyStringPerformance(null, F)).toBe('insufficient_data')
  })

  it('band lower-bounds match the locked constants', () => {
    expect([PERF_NORMAL, PERF_WATCH, PERF_UNDERPERFORMING, PERF_DEAD]).toEqual([95, 85, 60, 10])
  })
})

describe('perfBandToDonutBucket — 5 bands → 3 donut buckets (+ no_data/excluded)', () => {
  it('rolls up correctly', () => {
    expect(perfBandToDonutBucket('normal')).toBe('healthy')
    expect(perfBandToDonutBucket('watch')).toBe('abnormal')
    expect(perfBandToDonutBucket('underperforming')).toBe('abnormal')
    expect(perfBandToDonutBucket('serious_fault')).toBe('critical')
    expect(perfBandToDonutBucket('dead')).toBe('critical')
    expect(perfBandToDonutBucket('insufficient_data')).toBe('no_data')
    expect(perfBandToDonutBucket('unused')).toBeNull()
    expect(perfBandToDonutBucket('peer_excluded')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE "NOC == cell" consistency guard
// ─────────────────────────────────────────────────────────────────────────────
// Sweeps every score in [0..100] (+ fractional boundaries + null) and asserts
// that the /analysis cell band (classifyStringPerformance), the per-plant donut
// arc (bucketDonutStatus), the NOC SQL cutpoints, the analysis tally
// (bucketHealthScore), and the central cell-colour map (design-tokens) ALL agree
// for every value. If any surface drifts off the classifier, this fails.
// (Reuses the module-level `F` flags fixture declared at the top of this file.)

/** Mirror of loadFleetCounts' SQL FILTER cutpoints (interpolated PERF_* consts).
 *  healthy ≥ PERF_NORMAL; abnormal [PERF_UNDERPERFORMING, PERF_NORMAL); critical
 *  < PERF_UNDERPERFORMING; no-data = NULL. The donut folds no-data INTO abnormal. */
function sqlDonutBucket(score: number | null): 'healthy' | 'abnormal' | 'critical' {
  if (score === null) return 'abnormal' // no-data folds into the abnormal arc
  if (score >= PERF_NORMAL) return 'healthy'
  if (score >= PERF_UNDERPERFORMING) return 'abnormal'
  return 'critical'
}

/** The 5-band cell colour and the 3-arc donut bucket must come from ONE source.
 *  This is the expected donut bucket given the cell's band. */
function expectedDonutFromCell(score: number | null): 'healthy' | 'abnormal' | 'critical' {
  const band = classifyStringPerformance(score, F)
  const donut = perfBandToDonutBucket(band)
  // null score → insufficient_data → 'no_data', which the donut folds into abnormal.
  return (donut === 'no_data' || donut == null ? 'abnormal' : donut)
}

describe('CONSISTENCY GUARD: /analysis cell band ↔ donut arc ↔ NOC SQL ↔ tally', () => {
  // Integer sweep [0..100] plus the exact band boundaries (upper band owns edge).
  const scores: (number | null)[] = [
    ...Array.from({ length: 101 }, (_, i) => i),
    9.99, 10, 59.99, 60, 84.99, 85, 94.99, 95, 99.99, 100,
    null,
  ]

  it('every score yields the SAME 3-arc bucket across donut, SQL, and the cell→arc rollup', () => {
    for (const s of scores) {
      const fromCell = expectedDonutFromCell(s)        // /analysis cell band → arc
      const fromDonut = bucketDonutStatus({ healthScore: s, ...F, openCircuit: false })
      const fromSql = sqlDonutBucket(s)                // NOC counts SQL
      expect(fromDonut, `bucketDonutStatus(${s})`).toBe(fromCell)
      expect(fromSql, `sqlDonutBucket(${s})`).toBe(fromCell)
    }
  })

  it('the /analysis tally (bucketHealthScore) maps to the same arc for every score', () => {
    // bucketHealthScore: healthy→healthy, warning→abnormal, critical→critical,
    // no_data→abnormal (the donut folds no-data into the abnormal arc).
    const TALLY_TO_ARC: Record<string, 'healthy' | 'abnormal' | 'critical'> = {
      healthy: 'healthy', warning: 'abnormal', critical: 'critical', no_data: 'abnormal',
    }
    for (const s of scores) {
      const arc = TALLY_TO_ARC[bucketHealthScore(s)]
      expect(arc, `bucketHealthScore(${s})`).toBe(expectedDonutFromCell(s))
    }
  })

  it('the central cell-colour map (design-tokens) is keyed off the SAME classifier', () => {
    for (const s of scores) {
      const band = classifyStringPerformance(s, F)
      // perfBandStyleFromScore must return the exact PERF_BAND_STYLES entry for
      // the classifier's band — never a re-derived-from-numbers colour.
      expect(perfBandStyleFromScore(s), `perfBandStyleFromScore(${s})`).toBe(PERF_BAND_STYLES[band])
    }
  })

  it('gradeFromScore (plant-aggregate 3-band) tracks the same cutpoints as the cells', () => {
    const GRADE_TO_ARC: Record<string, 'healthy' | 'abnormal' | 'critical' | 'no-data'> = {
      healthy: 'healthy', warning: 'abnormal', critical: 'critical', 'no-data': 'no-data',
    }
    for (const s of scores) {
      const grade = gradeFromScore(s)
      if (s === null) {
        expect(grade).toBe('no-data')
        continue
      }
      expect(GRADE_TO_ARC[grade], `gradeFromScore(${s})`).toBe(expectedDonutFromCell(s))
    }
  })

  it('boundary scores land on the documented 5 cell bands (upper band owns edge)', () => {
    expect(classifyStringPerformance(95, F)).toBe('normal')
    expect(classifyStringPerformance(94.99, F)).toBe('watch')
    expect(classifyStringPerformance(85, F)).toBe('watch')
    expect(classifyStringPerformance(84.99, F)).toBe('underperforming')
    expect(classifyStringPerformance(60, F)).toBe('underperforming')
    expect(classifyStringPerformance(59.99, F)).toBe('serious_fault')
    expect(classifyStringPerformance(10, F)).toBe('serious_fault')
    expect(classifyStringPerformance(9.99, F)).toBe('dead')
    expect(classifyStringPerformance(0, F)).toBe('dead')
  })
})
