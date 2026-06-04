import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyDeviceWrite,
  readingSignature,
  NIGHT_MAX_PHANTOM_W,
} from '../string-health'

// ─── classifyDeviceWrite (DQ v2 device write gate) ───────────────────
// Root cause: vendor clouds replay the last daytime snapshot when a logger
// goes quiet (confirmed live 2026-06-05: identical-to-0.01W values every 5 min
// for days, kW-level "production" at 1 AM PKT).

const strings = (over: Partial<{ p1: number; p2: number }> = {}) => [
  { string_number: 1, voltage: 600, current: 5, power: over.p1 ?? 3000 },
  { string_number: 2, voltage: 610, current: 5.1, power: over.p2 ?? 3111 },
]

describe('classifyDeviceWrite', () => {
  it('skip_duplicate when the signature matches the previous poll (replay)', () => {
    const s = strings()
    expect(classifyDeviceWrite(s, readingSignature(s), true)).toBe('skip_duplicate')
    // …even at night — duplicate is the more specific diagnosis
    expect(classifyDeviceWrite(s, readingSignature(s), false)).toBe('skip_duplicate')
  })

  it('skip_night_phantom when sun is down but a string claims real production', () => {
    expect(classifyDeviceWrite(strings(), 'different-sig', false)).toBe('skip_night_phantom')
    // single phantom string among zeros is enough
    expect(classifyDeviceWrite(strings({ p1: 0, p2: NIGHT_MAX_PHANTOM_W + 1 }), null, false)).toBe('skip_night_phantom')
  })

  it('write for honest night zeros / noise below the phantom floor', () => {
    expect(classifyDeviceWrite(strings({ p1: 0, p2: 0 }), 'different-sig', false)).toBe('write')
    expect(classifyDeviceWrite(strings({ p1: 12, p2: 0 }), null, false)).toBe('write')
  })

  it('write for changing daytime production', () => {
    expect(classifyDeviceWrite(strings(), 'different-sig', true)).toBe('write')
    expect(classifyDeviceWrite(strings(), null, true)).toBe('write')
  })

  it('empty string list never matches a stored signature (no false dedup)', () => {
    expect(classifyDeviceWrite([], readingSignature([]), true)).toBe('write')
  })
})

// ─── updateDailyAggregates scoring gate ──────────────────────────────
// A brand-new PKT day must not get health scores from its first scraps of
// data (the "7 critical strings at 00:15 AM" bug) — scores need at least
// MIN_PRODUCTIVE_HOURS_FOR_DAILY_SCORE distinct productive hours.

const mockPrisma = {
  string_measurements: { findMany: vi.fn() },
  string_daily: { upsert: vi.fn((args: any) => args) },
  devices: { update: vi.fn(), findUnique: vi.fn() },
  alerts: { updateMany: vi.fn() },
  $transaction: vi.fn(async (x: any) => x),
}
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

// ─── sunUpForWriteGate — Pakistan bounding-box clamp ─────────────────
// Review finding (Critical): plants carrying vendor-default Beijing coords
// (39.9/116.4) hit "Beijing sunset" ~3h before Pakistan's — trusting those
// coords would discard 2-3h of REAL evening production every day.

const PKT_DUSK = new Date('2026-06-05T12:30:00Z')      // 17:30 PKT — Pak sun well up, Beijing sun down
const PKT_MIDNIGHT = new Date('2026-06-05T19:05:00Z')  // 00:05 PKT (Jun 6)
const PKT_NOON = new Date('2026-06-05T07:00:00Z')      // 12:00 PKT

describe('sunUpForWriteGate', () => {
  it('Beijing vendor-default coords are clamped to fleet centroid → still daytime at PKT dusk', async () => {
    const { sunUpForWriteGate } = await import('../poller-utils')
    expect(sunUpForWriteGate({ latitude: 39.9, longitude: 116.4 }, PKT_DUSK)).toBe(true)
  })
  it('null coords → fleet centroid (day at noon, night at midnight)', async () => {
    const { sunUpForWriteGate } = await import('../poller-utils')
    expect(sunUpForWriteGate(null, PKT_NOON)).toBe(true)
    expect(sunUpForWriteGate({ latitude: null, longitude: null }, PKT_MIDNIGHT)).toBe(false)
  })
  it('plausible Pakistani coords are used as-is', async () => {
    const { sunUpForWriteGate } = await import('../poller-utils')
    expect(sunUpForWriteGate({ latitude: 24.86, longitude: 67.0 }, PKT_NOON)).toBe(true)   // Karachi noon
    expect(sunUpForWriteGate({ latitude: 24.86, longitude: 67.0 }, PKT_MIDNIGHT)).toBe(false)
  })
})

// ─── resolveAlertsForUntrustedFeed ───────────────────────────────────
// Review finding (Important): alerts opened from phantom data would otherwise
// stay open for the whole freeze (generateAlerts never runs on gated cycles).

describe('resolveAlertsForUntrustedFeed', () => {
  it('resolves all open alerts for the device', async () => {
    mockPrisma.alerts.updateMany.mockClear()
    const { resolveAlertsForUntrustedFeed } = await import('../poller-utils')
    await resolveAlertsForUntrustedFeed('dev-frozen')
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.alerts.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ device_id: 'dev-frozen', resolved_at: null })
    expect(arg.data.resolved_at).toBeInstanceOf(Date)
  })
})

const NOON_PKT_UTC = new Date('2026-06-05T07:00:00Z') // 12:00 PKT

const configs = {
  unusedSet: new Set<number>(),
  peerExcludedSet: new Set<number>(),
  panelCountByString: new Map<number, number>(),
}

function measurementsAtHours(hoursUtc: string[], power = 2000) {
  // Two equal strings per hour → P2P should score both healthy when scoreable.
  return hoursUtc.flatMap((h) => [1, 2].map((sn) => ({
    string_number: sn,
    voltage: 600,
    current: power / 600,
    power,
    timestamp: new Date(h),
  })))
}

describe('updateDailyAggregates — daily scoring gate (DQ v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOON_PKT_UTC)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('1 productive hour → health_score is NULL (day not scoreable yet)', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      expect(args.update.health_score).toBeNull()
      expect(args.update.performance).toBeNull()
      // data columns still written — only the JUDGMENT is withheld
      expect(Number(args.update.avg_power)).toBeGreaterThan(0)
    }
  })

  it('3 productive hours → health_score IS written', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z', '2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      expect(args.update.health_score).not.toBeNull()
    }
  })

  it('hours of near-zero power do not count as productive (night zeros stay unscored)', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T03:05:00Z', '2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z'], 5),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    for (const [args] of mockPrisma.string_daily.upsert.mock.calls) {
      expect(args.update.health_score).toBeNull()
    }
  })
})
