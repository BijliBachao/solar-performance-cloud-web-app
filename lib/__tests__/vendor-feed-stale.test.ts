import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pure tests for isVendorFeedStale. Pins the threshold so a sloppy edit can't
// silently widen the window and let CSI's stuck snapshot back into the DB.
// See lib/string-health.ts VENDOR_FEED_STALE_MS comment for the 2026-05-25
// incident that this gate was built to catch.

import { isVendorFeedStale, VENDOR_FEED_STALE_MS } from '../string-health'

const NOW = new Date('2026-06-01T06:44:00Z')

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

describe('VENDOR_FEED_STALE_MS', () => {
  it('is exactly 2 hours', () => {
    expect(VENDOR_FEED_STALE_MS).toBe(2 * 60 * 60 * 1000)
  })
})

describe('isVendorFeedStale — missing / unparseable input', () => {
  it('treats null as stale (fail-safe)', () => {
    expect(isVendorFeedStale(null)).toBe(true)
  })
  it('treats undefined as stale', () => {
    expect(isVendorFeedStale(undefined)).toBe(true)
  })
  it('treats empty string as stale', () => {
    expect(isVendorFeedStale('')).toBe(true)
  })
  it('treats unparseable strings as stale', () => {
    expect(isVendorFeedStale('not a date')).toBe(true)
    expect(isVendorFeedStale('2026-13-45 99:99:99')).toBe(true)
  })
})

describe('isVendorFeedStale — fresh feeds (under 2h)', () => {
  it('returns false for a 5-minute-old report', () => {
    expect(isVendorFeedStale(minutesAgo(5))).toBe(false)
  })
  it('returns false for a 1-hour-old report', () => {
    expect(isVendorFeedStale(minutesAgo(60))).toBe(false)
  })
  it('returns false at 119 minutes (still inside the window)', () => {
    expect(isVendorFeedStale(minutesAgo(119))).toBe(false)
  })
  it('returns false at exactly 2 h (strict >)', () => {
    expect(isVendorFeedStale(new Date(NOW.getTime() - VENDOR_FEED_STALE_MS).toISOString())).toBe(false)
  })
})

describe('isVendorFeedStale — stale feeds (over 2h)', () => {
  it('returns true at 2h + 1ms', () => {
    expect(isVendorFeedStale(new Date(NOW.getTime() - VENDOR_FEED_STALE_MS - 1).toISOString())).toBe(true)
  })
  it('returns true for a 3-hour-old report', () => {
    expect(isVendorFeedStale(hoursAgo(3))).toBe(true)
  })
  it('returns true for a 6-day-old report (the CSI 2026-05-25 incident)', () => {
    expect(isVendorFeedStale(daysAgo(6))).toBe(true)
  })
})

describe('isVendorFeedStale — vendor timestamp formats', () => {
  it("parses CSI's 'YYYY-MM-DD HH:MM:SS' format (no TZ marker, treated as UTC on UTC host)", () => {
    // This is the exact format CSI returned on 2026-06-01 probe.
    expect(isVendorFeedStale('2026-05-25 14:17:28')).toBe(true)
  })
  it('accepts a Date instance', () => {
    expect(isVendorFeedStale(new Date(NOW.getTime() - 30 * 60_000))).toBe(false)
    expect(isVendorFeedStale(new Date(NOW.getTime() - 3 * 3_600_000))).toBe(true)
  })
  it('honours an explicit nowMs override (so tests don\'t depend on fake timers)', () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    expect(isVendorFeedStale(t0.toISOString(), t0.getTime() + 60 * 60_000)).toBe(false)
    expect(isVendorFeedStale(t0.toISOString(), t0.getTime() + 3 * 60 * 60_000)).toBe(true)
  })
})
