import { describe, it, expect } from 'vitest'
import {
  classifyStringPerformance,
  perfBandToDonutBucket,
  PERF_NORMAL,
  PERF_WATCH,
  PERF_UNDERPERFORMING,
  PERF_DEAD,
} from '@/lib/string-health'

// NOTE: this phase only ADDS the V1 classifier + constants (inert — nothing is
// wired to them yet). The band CUTOVER that re-points bucketHealthScore /
// bucketDonutStatus / the NOC SQL / the UI legends onto these is a single
// ATOMIC later phase (so NOC, donut, analysis, and cells move together and can
// never disagree mid-flight). These tests therefore exercise the new functions
// in isolation only.

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
