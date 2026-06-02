import { describe, it, expect } from 'vitest'
import {
  readingSignature,
  classifyConnectivity,
  VENDOR_FEED_STALE_MS,
} from '../string-health'
import { deviceConnectivity } from '../connectivity'

const NOW = new Date('2026-06-02T11:00:00Z').getTime()
const minsAgo = (m: number) => NOW - m * 60_000

describe('readingSignature', () => {
  const a = [{ string_number: 1, voltage: 600, current: 5, power: 3000 }]
  it('is stable for identical readings', () => {
    expect(readingSignature(a)).toBe(readingSignature([{ ...a[0] }]))
  })
  it('is order-independent (sorted by string_number)', () => {
    const two = [
      { string_number: 2, voltage: 1, current: 1, power: 1 },
      { string_number: 1, voltage: 2, current: 2, power: 2 },
    ]
    expect(readingSignature(two)).toBe(readingSignature([...two].reverse()))
  })
  it('changes when any V/I/P changes', () => {
    expect(readingSignature(a)).not.toBe(
      readingSignature([{ string_number: 1, voltage: 600, current: 5, power: 3001 }]),
    )
  })
  it('returns a stable hash for empty input', () => {
    expect(readingSignature([])).toBe(readingSignature([]))
  })
})

describe('classifyConnectivity', () => {
  it('idle at night ONLY when no fresh data (no data + sun down)', () => {
    expect(classifyConnectivity(null, null, false, NOW)).toBe('idle')
    expect(classifyConnectivity(minsAgo(200), minsAgo(200), false, NOW)).toBe('idle')
  })
  it('live wins over idle when data is fresh even if sun-gate says night (robust to bad coords)', () => {
    expect(classifyConnectivity(minsAgo(1), minsAgo(1), false, NOW)).toBe('live')
  })
  it('live when fresh data within 2h (day)', () => {
    expect(classifyConnectivity(minsAgo(5), minsAgo(5), true, NOW)).toBe('live')
    expect(classifyConnectivity(minsAgo(119), minsAgo(1), true, NOW)).toBe('live')
  })
  it('frozen: stale data (>=2h) but still writing rows (<15m)', () => {
    expect(classifyConnectivity(minsAgo(125), minsAgo(3), true, NOW)).toBe('frozen')
  })
  it('offline: stale data and not writing rows (>15m)', () => {
    expect(classifyConnectivity(minsAgo(125), minsAgo(40), true, NOW)).toBe('offline')
    expect(classifyConnectivity(null, null, true, NOW)).toBe('offline')
  })
  it('exactly 2h is live (age <= 2h, matches isVendorFeedStale), 2h+1ms is not', () => {
    expect(classifyConnectivity(NOW - VENDOR_FEED_STALE_MS, minsAgo(1), true, NOW)).toBe('live')
    expect(classifyConnectivity(NOW - VENDOR_FEED_STALE_MS - 1, minsAgo(1), true, NOW)).toBe('frozen')
  })
})

describe('deviceConnectivity', () => {
  it('uses the newest of vendor ts and reading_changed_at', () => {
    const r = deviceConnectivity(
      { vendor_last_data_at: new Date(minsAgo(200)), reading_changed_at: new Date(minsAgo(5)) },
      minsAgo(3),
      true,
      NOW,
    )
    expect(r.status).toBe('live') // reading changed 5m ago even though vendor ts is 200m old
    expect(r.effectiveFreshAt?.getTime()).toBe(minsAgo(5))
  })
  it('null both → offline during day, effectiveFreshAt null', () => {
    const r = deviceConnectivity({ vendor_last_data_at: null, reading_changed_at: null }, null, true, NOW)
    expect(r.status).toBe('offline')
    expect(r.effectiveFreshAt).toBeNull()
  })
})
