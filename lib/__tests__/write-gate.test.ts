import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyDeviceWrite,
  readingSignature,
  clampToFleetCoords,
  NIGHT_MAX_PHANTOM_W,
  FLEET_DEFAULT_LAT,
  FLEET_DEFAULT_LNG,
} from '../string-health'

// ─── clampToFleetCoords — shared by write gate AND connectivity display ──
// Live finding 2026-06-05 02:20 PKT: Zahoor Diary Farm's Beijing-default
// coords hit "Beijing sunrise" at ~01:45 PKT → 2 sleeping inverters read
// OFFLINE on the NOC. Same clamp must guard every isDaylight() call site.
describe('clampToFleetCoords', () => {
  it('Beijing vendor defaults → fleet centroid', () => {
    expect(clampToFleetCoords(39.906922, 116.397551)).toEqual({ lat: FLEET_DEFAULT_LAT, lng: FLEET_DEFAULT_LNG })
  })
  it('null/missing → fleet centroid', () => {
    expect(clampToFleetCoords(null, null)).toEqual({ lat: FLEET_DEFAULT_LAT, lng: FLEET_DEFAULT_LNG })
    expect(clampToFleetCoords(31.5, null)).toEqual({ lat: FLEET_DEFAULT_LAT, lng: FLEET_DEFAULT_LNG })
  })
  it('plausible Pakistani coords pass through (accepts Decimal-ish strings)', () => {
    expect(clampToFleetCoords(24.86, 67.0)).toEqual({ lat: 24.86, lng: 67.0 })   // Karachi
    expect(clampToFleetCoords('31.262719', '74.164873')).toEqual({ lat: 31.262719, lng: 74.164873 })
  })
})

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

  it('skip_night_phantom when sun is down but a string claims real production (multi-amp + >50W)', () => {
    expect(classifyDeviceWrite(strings(), 'different-sig', false)).toBe('skip_night_phantom')
    // single phantom string among zeros is enough (fixture current = 5.1A)
    expect(classifyDeviceWrite(strings({ p1: 0, p2: NIGHT_MAX_PHANTOM_W + 1 }), null, false)).toBe('skip_night_phantom')
  })

  it('write for honest night zeros / noise below the phantom floor', () => {
    expect(classifyDeviceWrite(strings({ p1: 0, p2: 0 }), 'different-sig', false)).toBe('write')
    expect(classifyDeviceWrite(strings({ p1: 12, p2: 0 }), null, false)).toBe('write')
  })

  it('NEVER drops a real night event — wind-tunnel regressions (2026-06-05)', () => {
    // Real leak, physical: darkness collapses V → tiny power
    const leak = [{ string_number: 1, voltage: 8, current: 0.8, power: 6.4 }]
    expect(classifyDeviceWrite(leak, 'different-sig', false)).toBe('write')
    // ADVERSARIAL (the found flaw): leak + quirky high-V sensor → "496W" but
    // sub-amp current. Power-only gating ate this; the current criterion saves it.
    const leakHighV = [{ string_number: 1, voltage: 620, current: 0.8, power: 496 }]
    expect(classifyDeviceWrite(leakHighV, 'different-sig', false)).toBe('write')
    // Reverse current (failed bypass diode backfeed) — negative power, must store
    const reverse = [{ string_number: 1, voltage: 15, current: -1.4, power: -21 }]
    expect(classifyDeviceWrite(reverse, 'different-sig', false)).toBe('write')
    // …while a varying daytime replay (multi-amp) is STILL caught
    const replay = [{ string_number: 1, voltage: 872, current: 2.4, power: 2092 }]
    expect(classifyDeviceWrite(replay, 'different-sig', false)).toBe('skip_night_phantom')
  })

  it('write for changing daytime production', () => {
    expect(classifyDeviceWrite(strings(), 'different-sig', true)).toBe('write')
    expect(classifyDeviceWrite(strings(), null, true)).toBe('write')
  })

  it('empty string list never matches a stored signature (no false dedup)', () => {
    expect(classifyDeviceWrite([], readingSignature([]), true)).toBe('write')
  })
})

// ─── updateDailyAggregates verdict fields ────────────────────────────
// As of the settled-day refactor, performance / health_score / availability
// are NO LONGER written by the poller — they are owned by the once-daily
// settled-day job (lib/settled-day-performance.ts). The poller only writes
// avg_* and energy_kwh so the daily row accumulates running measurements
// without clobbering the settled verdict.

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

// NOTE: The daily scoring gate (DQ v2 productive-hours logic) has been removed from the
// poller. performance / health_score / availability are now OWNED by the settled-day job
// (lib/settled-day-performance.ts). The poller writes only avg_* and energy_kwh; the
// verdict fields are absent from the upsert data object entirely so Prisma's partial UPDATE
// never clobbers what the once-daily job wrote. Tests below verify that absence.
describe('updateDailyAggregates — poller does NOT write verdict fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOON_PKT_UTC)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('poller omits health_score and performance from upsert data (1 productive hour)', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      // Verdict fields must be absent — settled-day job owns them
      expect(args.update).not.toHaveProperty('health_score')
      expect(args.update).not.toHaveProperty('performance')
      expect(args.update).not.toHaveProperty('availability')
      // Data columns still written
      expect(Number(args.update.avg_power)).toBeGreaterThan(0)
    }
  })

  it('poller omits health_score and performance from upsert data (3 productive hours)', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z', '2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      // Verdict fields must be absent regardless of how many hours are productive
      expect(args.update).not.toHaveProperty('health_score')
      expect(args.update).not.toHaveProperty('performance')
      expect(args.update).not.toHaveProperty('availability')
      // avg_* and energy_kwh are still written
      expect(Number(args.update.avg_power)).toBeGreaterThan(0)
    }
  })

  it('poller omits health_score from upsert data (hour-boundary straddle)', async () => {
    // Previously tested the span gate; now confirms the field is simply absent.
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T03:55:00Z', '2026-06-05T04:08:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })
    for (const [args] of mockPrisma.string_daily.upsert.mock.calls) {
      expect(args.update).not.toHaveProperty('health_score')
    }
  })

  it('poller omits health_score from upsert data (near-zero / night readings)', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T03:05:00Z', '2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z'], 5),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    for (const [args] of mockPrisma.string_daily.upsert.mock.calls) {
      expect(args.update).not.toHaveProperty('health_score')
    }
  })
})
