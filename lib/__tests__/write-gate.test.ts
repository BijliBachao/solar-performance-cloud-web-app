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
// C-1: the poller writes TODAY'S LIVE verdict (performance / health_score /
// availability) again, but via the NEW current-vs-peer-median pipeline (the
// SAME pure functions the settled-day job uses), so the live "today" value and
// the overnight settled value are identical by construction. This keeps the
// NOC "Today" donut alive intraday. The 01:30 PKT settled-day job authoritatively
// re-finalizes the verdict once the day completes. When the day does NOT yet have
// ≥ MIN_SUNUP_HOURS_FOR_DAILY_SCORE (2) sun-up hours of comparable current, the
// verdict is not scoreable → performance / health_score are written as null.

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

// C-1: The poller writes today's LIVE verdict again, via the current-vs-peer-median
// pipeline (the SAME pure functions the settled-day job uses). The verdict fields
// are present in the upsert data object on EVERY cycle (so Prisma's partial UPDATE
// refreshes today's live value); they carry a Decimal when the day is scoreable
// (≥ MIN_SUNUP_HOURS_FOR_DAILY_SCORE = 2 sun-up hours of comparable current) and
// null when it isn't. The 01:30 PKT settled-day job re-finalizes the finished day.
//
// Fixture: two equal strings, each current = power/600. At power=2000 each string
// is ~3.33A, so the device-summed current per hour is ~6.67A — comfortably above
// MIN_CURRENT_FOR_COMPARISON (1.0), making every populated hour a "sun-up" hour.
// Two equal strings → peer median == each string's current → performance == 100.
describe('updateDailyAggregates — poller writes today\'s live verdict (current-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOON_PKT_UTC)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('not scoreable (1 sun-up hour < MIN 2) → performance/health_score null but present', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      // Fields are present (live verdict is refreshed every cycle) but null —
      // a single sun-up hour is below MIN_SUNUP_HOURS_FOR_DAILY_SCORE.
      expect(args.update).toHaveProperty('health_score')
      expect(args.update).toHaveProperty('performance')
      expect(args.update.health_score).toBeNull()
      expect(args.update.performance).toBeNull()
      // availability is still computed (1 sun-up hour, both producing → 100%)
      expect(Number(args.update.availability)).toBe(100)
      // Data columns still written
      expect(Number(args.update.avg_power)).toBeGreaterThan(0)
    }
  })

  it('scoreable (3 sun-up hours ≥ MIN 2) → writes the current-based verdict', async () => {
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z', '2026-06-05T06:05:00Z']),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    const upserts = mockPrisma.string_daily.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const [args] of upserts) {
      // Two equal strings → each at its peer-group median → performance 100.
      // health_score mirrors performance (current-based metric).
      expect(Number(args.update.performance)).toBe(100)
      expect(Number(args.update.health_score)).toBe(100)
      expect(Number(args.update.availability)).toBe(100)
      // avg_* and energy_kwh are still written
      expect(Number(args.update.avg_power)).toBeGreaterThan(0)
    }
  })

  it('an underperforming string scores below its healthy peers (current-based banding)', async () => {
    // Three healthy strings at 4000W (~6.67A) and one weak string at 2000W (~3.33A).
    // Peer median over 4 strings = 6.67A; weak string = 3.33/6.67 ≈ 50% → critical.
    const hours = ['2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z', '2026-06-05T06:05:00Z']
    const rows = hours.flatMap((h) =>
      [1, 2, 3, 4].map((sn) => {
        const power = sn === 4 ? 2000 : 4000
        return { string_number: sn, voltage: 600, current: power / 600, power, timestamp: new Date(h) }
      }),
    )
    mockPrisma.string_measurements.findMany.mockResolvedValue(rows)
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 4, configs, { model: null, max_strings: 4 })

    const byStringNumber = new Map<number, any>()
    for (const [args] of mockPrisma.string_daily.upsert.mock.calls) {
      byStringNumber.set(args.create.string_number, args.update)
    }
    // Healthy peers sit at 100; the weak string ~50.
    expect(Number(byStringNumber.get(1).performance)).toBe(100)
    expect(Number(byStringNumber.get(4).performance)).toBe(50)
    expect(Number(byStringNumber.get(4).health_score)).toBe(50)
  })

  it('night / near-zero readings (below comparison floor) → not scoreable → null', async () => {
    // current = 5/600 ≈ 0.0083A per string; device sum ≈ 0.017A << MIN_CURRENT_FOR_COMPARISON.
    mockPrisma.string_measurements.findMany.mockResolvedValue(
      measurementsAtHours(['2026-06-05T03:05:00Z', '2026-06-05T04:05:00Z', '2026-06-05T05:05:00Z'], 5),
    )
    const { updateDailyAggregates } = await import('../poller-utils')
    await updateDailyAggregates('dev1', 'plant1', 2, configs, { model: null, max_strings: 2 })

    for (const [args] of mockPrisma.string_daily.upsert.mock.calls) {
      expect(args.update).toHaveProperty('health_score')
      expect(args.update.health_score).toBeNull()
      expect(args.update.performance).toBeNull()
    }
  })
})
