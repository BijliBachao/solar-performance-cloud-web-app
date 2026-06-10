import { describe, it, expect } from 'vitest'
import {
  bucketDonutStatus,
  aggregateForDonut,
  DONUT_OPEN_CIRCUIT_THRESHOLD,
  type DonutInput,
  type DonutBucket,
} from '@/lib/string-health-donut'

// String-Health Donut v2 — single source of truth for bucketing rules.
// These tests pin down every override interaction so the donut's 3-bucket
// taxonomy stays honest under boundary inputs.

describe('bucketDonutStatus — score-only path', () => {
  // Unified bands (2026-06-10): Healthy >= 94, Abnormal [85, 94), Critical < 85.
  it('score at or above the Healthy threshold (94) buckets Healthy', () => {
    expect(bucketDonutStatus({ healthScore: 94, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('healthy')
    expect(bucketDonutStatus({ healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('healthy')
    expect(bucketDonutStatus({ healthScore: 100, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('healthy')
  })

  it('score in [85, 94) buckets Abnormal — incl. 92 (was Healthy under 90/50)', () => {
    expect(bucketDonutStatus({ healthScore: 85, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('abnormal')
    expect(bucketDonutStatus({ healthScore: 92, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('abnormal')
    expect(bucketDonutStatus({ healthScore: 93.99, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('abnormal')
  })

  it('score below the Warning threshold (85) buckets Critical — incl. 70 (was Abnormal)', () => {
    expect(bucketDonutStatus({ healthScore: 84.99, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('critical')
    expect(bucketDonutStatus({ healthScore: 70, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('critical')
    expect(bucketDonutStatus({ healthScore: 25, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('critical')
    expect(bucketDonutStatus({ healthScore: 0, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('critical')
  })
})

describe('bucketDonutStatus — exclusion overrides (rules #1, #2)', () => {
  it('returns null when is_used: false (unused wired-but-empty port)', () => {
    expect(bucketDonutStatus({ healthScore: 95, isUsed: false, peerExcluded: false, openCircuit: false })).toBeNull()
    expect(bucketDonutStatus({ healthScore: 0, isUsed: false, peerExcluded: false, openCircuit: false })).toBeNull()
    expect(bucketDonutStatus({ healthScore: null, isUsed: false, peerExcluded: false, openCircuit: false })).toBeNull()
  })

  it('returns null when peer_excluded (non-standard orientation; score is meaningless)', () => {
    expect(bucketDonutStatus({ healthScore: 95, isUsed: true, peerExcluded: true, openCircuit: false })).toBeNull()
    expect(bucketDonutStatus({ healthScore: 30, isUsed: true, peerExcluded: true, openCircuit: false })).toBeNull()
  })

  it('exclusion beats every other override (peer-excluded string with 0A fault is still excluded)', () => {
    expect(bucketDonutStatus({ healthScore: null, isUsed: true, peerExcluded: true, openCircuit: true })).toBeNull()
  })
})

describe('bucketDonutStatus — OPEN_CIRCUIT override (rule #3)', () => {
  it('open_circuit forces Critical even when score is Healthy', () => {
    expect(bucketDonutStatus({ healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: true })).toBe('critical')
  })

  it('open_circuit forces Critical even when score is null', () => {
    expect(bucketDonutStatus({ healthScore: null, isUsed: true, peerExcluded: false, openCircuit: true })).toBe('critical')
  })
})

describe('bucketDonutStatus — no-data override (rule #4)', () => {
  it('null score + is_used + no open_circuit => Abnormal (string should report and doesn\'t)', () => {
    expect(bucketDonutStatus({ healthScore: null, isUsed: true, peerExcluded: false, openCircuit: false })).toBe('abnormal')
  })

  it('does NOT promote no-data to Critical (avoid false alarms from single poller miss)', () => {
    const result = bucketDonutStatus({ healthScore: null, isUsed: true, peerExcluded: false, openCircuit: false })
    expect(result).not.toBe('critical')
  })
})

describe('aggregateForDonut — counts the right things', () => {
  it('returns all zeros when input is empty', () => {
    const out = aggregateForDonut([])
    expect(out.totalStrings).toBe(0)
    expect(out.counts).toEqual({ healthy: 0, abnormal: 0, critical: 0, noData: 0 })
    expect(out.excluded).toEqual({ unused: 0, nonStandard: 0 })
  })

  it('sums Healthy / Abnormal / Critical across mixed inputs (94/85 bands)', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false }, // healthy (>=94)
      { healthScore: 92, isUsed: true, peerExcluded: false, openCircuit: false }, // abnormal [85,94)
      { healthScore: 70, isUsed: true, peerExcluded: false, openCircuit: false }, // critical (<85)
      { healthScore: 40, isUsed: true, peerExcluded: false, openCircuit: false }, // critical
    ]
    const out = aggregateForDonut(strings)
    expect(out.totalStrings).toBe(4)
    expect(out.counts).toEqual({ healthy: 1, abnormal: 1, critical: 2, noData: 0 })
  })

  it('excludes is_used=false from totals and surfaces them under excluded.unused', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: false, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: false, peerExcluded: false, openCircuit: false },
    ]
    const out = aggregateForDonut(strings)
    expect(out.totalStrings).toBe(1)
    expect(out.counts.healthy).toBe(1)
    expect(out.excluded.unused).toBe(2)
    expect(out.excluded.nonStandard).toBe(0)
  })

  it('excludes peer_excluded=true from totals and surfaces them under excluded.nonStandard', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: 30, isUsed: true, peerExcluded: true, openCircuit: false },
    ]
    const out = aggregateForDonut(strings)
    expect(out.totalStrings).toBe(1)
    expect(out.excluded.nonStandard).toBe(1)
    expect(out.counts.critical).toBe(0) // peer-excluded string did NOT land in Critical
  })

  it('applies OPEN_CIRCUIT override and tracks it under breakdown.critical.openCircuit', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: true }, // overridden to critical
      { healthScore: 40, isUsed: true, peerExcluded: false, openCircuit: false }, // critical by score
    ]
    const out = aggregateForDonut(strings)
    expect(out.counts.critical).toBe(2)
    expect(out.breakdown.critical.byScore).toBe(1)
    expect(out.breakdown.critical.openCircuit).toBe(1)
  })

  it('tracks no-data strings under breakdown.abnormal.noData and counts.noData', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: 90, isUsed: true, peerExcluded: false, openCircuit: false }, // abnormal by score [85,94)
    ]
    const out = aggregateForDonut(strings)
    expect(out.counts.abnormal).toBe(3)
    expect(out.counts.noData).toBe(2)
    expect(out.breakdown.abnormal.byScore).toBe(1)
    expect(out.breakdown.abnormal.noData).toBe(2)
  })

  it('handles the all-OPEN_CIRCUIT scenario (e.g., DC main breaker cut)', () => {
    const strings: DonutInput[] = Array.from({ length: 10 }, () => ({
      healthScore: 95,
      isUsed: true,
      peerExcluded: false,
      openCircuit: true,
    }))
    const out = aggregateForDonut(strings)
    expect(out.counts.critical).toBe(10)
    expect(out.breakdown.critical.openCircuit).toBe(10)
    expect(out.counts.healthy).toBe(0)
  })

  it('totalStrings never includes excluded strings', () => {
    const strings: DonutInput[] = [
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: false, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: true, peerExcluded: true, openCircuit: false },
    ]
    const out = aggregateForDonut(strings)
    expect(out.totalStrings).toBe(1)
    expect(out.excluded.unused + out.excluded.nonStandard).toBe(2)
  })
})

describe('DONUT_OPEN_CIRCUIT_THRESHOLD constant', () => {
  it('is exported and equals 0.5 (>50% of window samples)', () => {
    expect(DONUT_OPEN_CIRCUIT_THRESHOLD).toBe(0.5)
  })
})

describe('bucket type safety', () => {
  it('every non-null return is one of the 3 buckets', () => {
    const inputs: DonutInput[] = [
      { healthScore: 100, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: 50, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: 0, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: null, isUsed: true, peerExcluded: false, openCircuit: false },
      { healthScore: 95, isUsed: true, peerExcluded: false, openCircuit: true },
    ]
    const allowed: DonutBucket[] = ['healthy', 'abnormal', 'critical']
    for (const i of inputs) {
      const out = bucketDonutStatus(i)
      expect(out === null || allowed.includes(out)).toBe(true)
    }
  })
})
