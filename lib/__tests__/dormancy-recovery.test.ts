import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  recoveryBucket,
  daysSinceActive,
  RECOVERY_PRIORITY,
  RECOVERY_ACTIVE_DAYS,
  RECOVERY_COOLING_DAYS,
  RECOVERY_AT_RISK_DAYS,
} from '@/lib/dormancy'

// recoveryBucket drives the /admin/recovery worklist. Solar clients check
// weekly/monthly, so thresholds are intentionally lenient (14/45/90 days).

const NOW = new Date('2026-05-25T00:00:00Z')
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('recoveryBucket', () => {
  it('zero logins or no activity → never', () => {
    expect(recoveryBucket(0, null)).toBe('never')
    expect(recoveryBucket(0, daysAgo(1))).toBe('never')
    expect(recoveryBucket(5, null)).toBe('never')
  })

  it('within active window → active', () => {
    expect(recoveryBucket(3, daysAgo(0))).toBe('active')
    expect(recoveryBucket(3, daysAgo(7))).toBe('active')
    expect(recoveryBucket(3, daysAgo(RECOVERY_ACTIVE_DAYS))).toBe('active') // boundary inclusive
  })

  it('between active and cooling thresholds → cooling', () => {
    expect(recoveryBucket(3, daysAgo(RECOVERY_ACTIVE_DAYS + 1))).toBe('cooling')
    expect(recoveryBucket(3, daysAgo(30))).toBe('cooling')
    expect(recoveryBucket(3, daysAgo(RECOVERY_COOLING_DAYS))).toBe('cooling')
  })

  it('between cooling and at-risk thresholds → at_risk', () => {
    expect(recoveryBucket(3, daysAgo(RECOVERY_COOLING_DAYS + 1))).toBe('at_risk')
    expect(recoveryBucket(3, daysAgo(60))).toBe('at_risk')
    expect(recoveryBucket(3, daysAgo(RECOVERY_AT_RISK_DAYS))).toBe('at_risk')
  })

  it('beyond at-risk threshold → lost', () => {
    expect(recoveryBucket(3, daysAgo(RECOVERY_AT_RISK_DAYS + 1))).toBe('lost')
    expect(recoveryBucket(3, daysAgo(180))).toBe('lost')
    expect(recoveryBucket(3, daysAgo(400))).toBe('lost')
  })

  it('real client examples from prod data', () => {
    // faizan.fanzspinning last active May 21 (~4 days before NOW=May 25) → active
    expect(recoveryBucket(2, daysAgo(4))).toBe('active')
    // abdullah5555 last active May 2 (~23 days) → cooling
    expect(recoveryBucket(1, daysAgo(23))).toBe('cooling')
    // ali.ahmed.eml last active Feb 2 (~112 days) → lost
    expect(recoveryBucket(1, daysAgo(112))).toBe('lost')
  })
})

describe('RECOVERY_PRIORITY — worklist sort order', () => {
  it('lost is most urgent, active least', () => {
    expect(RECOVERY_PRIORITY.lost).toBeLessThan(RECOVERY_PRIORITY.at_risk)
    expect(RECOVERY_PRIORITY.at_risk).toBeLessThan(RECOVERY_PRIORITY.never)
    expect(RECOVERY_PRIORITY.never).toBeLessThan(RECOVERY_PRIORITY.cooling)
    expect(RECOVERY_PRIORITY.cooling).toBeLessThan(RECOVERY_PRIORITY.active)
  })

  it('sorting an array by priority puts urgent clients first', () => {
    const buckets: Array<keyof typeof RECOVERY_PRIORITY> =
      ['active', 'lost', 'cooling', 'at_risk', 'never']
    const sorted = [...buckets].sort((a, b) => RECOVERY_PRIORITY[a] - RECOVERY_PRIORITY[b])
    expect(sorted).toEqual(['lost', 'at_risk', 'never', 'cooling', 'active'])
  })
})

describe('daysSinceActive', () => {
  it('returns whole days', () => {
    expect(daysSinceActive(daysAgo(5))).toBe(5)
    expect(daysSinceActive(daysAgo(0))).toBe(0)
  })

  it('null for missing or future timestamps', () => {
    expect(daysSinceActive(null)).toBeNull()
    expect(daysSinceActive(new Date(NOW.getTime() + 86_400_000).toISOString())).toBeNull()
  })
})
