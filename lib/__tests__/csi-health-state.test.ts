import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pure unit tests for mapCsiHealthState — pins down the "no false Faulty
// at night" contract that was the bug we fixed on 2026-05-24.
//
// Behavior:
//   - status=1 (OnLine)        → 3 (Healthy) always
//   - status=2|4 (Alarm/Brkdn) → 3 (Healthy) if lastReportTime is <24h old; else 2 (Faulty)
//   - status=0|3 (Off/Unknown) → 3 (Healthy) if lastReportTime is <24h old; else 1 (Disconnected)
//   - any other status          → 1 (Disconnected) + warn once

// poller-utils → prisma; stub prisma since these tests don't touch the DB.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const NOW = new Date('2026-05-24T15:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('mapCsiHealthState — Online status', () => {
  it('status=1 returns Healthy regardless of lastReportTime', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(1, null)).toBe(3)
    expect(mapCsiHealthState(1, daysAgo(10))).toBe(3)
    expect(mapCsiHealthState(1, minutesAgo(1))).toBe(3)
  })
})

describe('mapCsiHealthState — Alarm/Breakdown status (2 or 4)', () => {
  it('returns Healthy when lastReportTime is recent (<24h) — CSI is wrong about Faulty at night', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(2, hoursAgo(2))).toBe(3)
    expect(mapCsiHealthState(2, hoursAgo(12))).toBe(3)
    expect(mapCsiHealthState(2, hoursAgo(23))).toBe(3)
    expect(mapCsiHealthState(4, minutesAgo(30))).toBe(3)
  })

  it('returns Faulty when lastReportTime is genuinely silent (>24h)', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(2, daysAgo(2))).toBe(2)
    expect(mapCsiHealthState(4, daysAgo(7))).toBe(2)
  })

  it('returns Faulty when lastReportTime is null/missing AND status is Alarm', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(2, null)).toBe(2)
    expect(mapCsiHealthState(4, null)).toBe(2)
  })
})

describe('mapCsiHealthState — Offline status (0 or 3)', () => {
  it('returns Healthy when lastReportTime is recent (<24h) — common at night', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(0, hoursAgo(10))).toBe(3)
    expect(mapCsiHealthState(3, hoursAgo(5))).toBe(3)
  })

  it('returns Disconnected when lastReportTime is genuinely silent (>24h)', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(0, daysAgo(2))).toBe(1)
    expect(mapCsiHealthState(3, daysAgo(5))).toBe(1)
  })

  it('returns Disconnected when lastReportTime is null AND status is Offline', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(0, null)).toBe(1)
    expect(mapCsiHealthState(3, null)).toBe(1)
  })
})

describe('mapCsiHealthState — boundary: exactly 24h old', () => {
  it('lastReportTime exactly 24h ago is NOT considered recent (excluded from window)', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    // 24h exactly = boundary; the check is `< 24h`, so 24h triggers Faulty
    expect(mapCsiHealthState(2, hoursAgo(24))).toBe(2)
    expect(mapCsiHealthState(0, hoursAgo(24))).toBe(1)
  })

  it('lastReportTime 23h59m ago IS considered recent', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(2, minutesAgo(60 * 23 + 59))).toBe(3)
  })
})

describe('mapCsiHealthState — unrecognised status codes', () => {
  it('treats recently-reporting plants with unknown status as Healthy (plant is alive)', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    // Plant reported 1h ago → it's clearly producing; unknown status code doesn't matter.
    expect(mapCsiHealthState(99, hoursAgo(1))).toBe(3)
  })

  it('falls through to Disconnected for unrecognised status when no recent report', async () => {
    const { mapCsiHealthState } = await import('@/lib/csi-poller')
    expect(mapCsiHealthState(-1, null)).toBe(1)
    expect(mapCsiHealthState(99, daysAgo(3))).toBe(1)
  })
})
