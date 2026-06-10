import { describe, it, expect } from 'vitest'
import {
  scoreLiveSr,
  summarizeLiveScoring,
  type LiveStringInput,
  type LiveScoringContext,
} from '@/lib/string-health-live'

// Helpers
function s(
  string_number: number,
  voltage: number,
  current: number,
  power: number,
  opts: Partial<LiveStringInput> = {},
): LiveStringInput {
  return {
    string_number,
    voltage,
    current,
    power,
    panel_count: 16,
    is_used: true,
    exclude_from_peer_comparison: false,
    stale: false,
    ...opts,
  }
}

const huaweiInverter: LiveScoringContext = {
  deviceId: 'dev1',
  inverterModel: 'SUN2000-100KTL-INM0', // 10 MPPTs × 2 strings/MPPT
  inverterMaxStrings: 20,
  armed: true,
}

const csiInverter36: LiveScoringContext = {
  deviceId: 'devCSI',
  inverterModel: null, // CSI has no model in DB → falls back to max-strings
  inverterMaxStrings: 36,
  armed: true,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — happy path', () => {
  it('all strings producing equally → all Healthy SR=1.0', () => {
    // Two strings sharing MPPT 1, both at full output
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 10, 6000),
      ],
      huaweiInverter,
    )
    expect(result[0].sr).toBeCloseTo(1.0, 2)
    expect(result[0].bucket).toBe('healthy')
    expect(result[1].sr).toBeCloseTo(1.0, 2)
    expect(result[1].bucket).toBe('healthy')
  })

  it('one string slightly below peer → both Healthy (median anchor)', () => {
    // MEDIAN anchor (2-member group → median = mean). S2 at 5700 vs median 5850
    // = 0.974 → healthy. Under the old MAX anchor this read 0.95.
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 9.5, 5700),
      ],
      huaweiInverter,
    )
    expect(result[0].bucket).toBe('healthy')
    expect(result[1].bucket).toBe('healthy')
    expect(result[1].sr).toBeCloseTo(0.974, 2)
  })

  it('one string well below peer → Abnormal (median anchor)', () => {
    // S2 at 5100 vs median 5550 = 0.919 → abnormal (>=0.85, <0.94).
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 8.5, 5100),
      ],
      huaweiInverter,
    )
    expect(result[1].sr).toBeCloseTo(0.919, 2)
    expect(result[1].bucket).toBe('abnormal')
  })

  it('one string at 50% of peer → Critical', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 5, 3000), // 50%
      ],
      huaweiInverter,
    )
    expect(result[1].bucket).toBe('critical')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Panel count normalization — the CLIENT'S exact issue
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — panel count normalization (THE CLIENT BUG)', () => {
  it('15-panel string and 17-panel string producing proportionally → both Healthy', () => {
    // 17-panel produces more total power, but per-panel power is equal
    // 15-panel: 15 panels × 400W/panel = 6000W total
    // 17-panel: 17 panels × 400W/panel = 6800W total
    // per-panel-W = 400W for both → SR = 1.0 for both
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000, { panel_count: 15 }),
        s(2, 600, 11.33, 6800, { panel_count: 17 }),
      ],
      huaweiInverter,
    )
    expect(result[0].bucket).toBe('healthy')
    expect(result[1].bucket).toBe('healthy')
    expect(result[0].sr).toBeCloseTo(1.0, 1)
    expect(result[1].sr).toBeCloseTo(1.0, 1)
  })

  it('without normalization, mixed-panel strings would falsely flag the smaller one', () => {
    // Same data but raw current (without panel normalization) would say:
    // String 1 (10A) vs String 2 (11.33A) → String 1 looks ~88% of peer
    // With normalization both are 400 W/panel → both 100%
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000, { panel_count: 15 }),
        s(2, 600, 11.33, 6800, { panel_count: 17 }),
      ],
      huaweiInverter,
    )
    // The 15-panel string MUST NOT be flagged abnormal due to fewer panels
    expect(result[0].bucket).not.toBe('abnormal')
    expect(result[0].bucket).not.toBe('critical')
  })

  it('null panel_count falls back to default (16); flag panel_count_is_default=true', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000, { panel_count: null }),
        s(2, 600, 10, 6000, { panel_count: null }),
      ],
      huaweiInverter,
    )
    expect(result[0].panel_count_is_default).toBe(true)
    expect(result[1].panel_count_is_default).toBe(true)
    expect(result[0].bucket).toBe('healthy')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MPPT grouping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — MPPT grouping (Huawei known topology)', () => {
  it('strings on DIFFERENT MPPTs are not directly compared', () => {
    // MPPT 1: string 1 (very strong) + string 2 (weak)
    // MPPT 2: string 3 (medium) + string 4 (medium)
    // With MPPT grouping, string 2 is compared to string 1 (Critical)
    // String 3,4 are compared to each other (Healthy)
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),  // MPPT1 peer max
        s(2, 600, 4, 2400),   // MPPT1 — 40% of peer → Critical
        s(3, 600, 8, 4800),   // MPPT2 — equal peers → Healthy
        s(4, 600, 8, 4800),   // MPPT2 — equal peers → Healthy
      ],
      huaweiInverter,
    )
    expect(result.find((r) => r.string_number === 2)?.bucket).toBe('critical')
    expect(result.find((r) => r.string_number === 3)?.bucket).toBe('healthy')
    expect(result.find((r) => r.string_number === 4)?.bucket).toBe('healthy')
  })

  it('CSI inverter (model empty) uses max-strings fallback → 2 strings/MPPT', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 5, 3000),  // paired with #1 → Critical
      ],
      csiInverter36,
    )
    expect(result[1].bucket).toBe('critical')
    expect(result[1].topology_is_fallback).toBe(true)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exclusions / override layers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — exclusion and override layers', () => {
  it('is_used=false → no score, status=OFFLINE, reason=string_excluded_unused', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 10, 6000),
        s(3, 0, 0, 0, { is_used: false }),
      ],
      huaweiInverter,
    )
    const r3 = result.find((r) => r.string_number === 3)!
    expect(r3.sr).toBeNull()
    expect(r3.bucket).toBeNull()
    expect(r3.no_score_reason).toBe('string_excluded_unused')
  })

  it('exclude_from_peer_comparison=true → no score, reason=string_peer_excluded', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 10, 6000),
        s(3, 600, 5, 3000, { exclude_from_peer_comparison: true }),
      ],
      huaweiInverter,
    )
    const r3 = result.find((r) => r.string_number === 3)!
    expect(r3.sr).toBeNull()
    expect(r3.no_score_reason).toBe('string_peer_excluded')
  })

  it('OPEN_CIRCUIT override (V>0, I<threshold) → Critical bucket regardless of peer', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 10, 6000),
        s(3, 600, 0.05, 30),  // voltage but no current → open circuit
      ],
      huaweiInverter,
    )
    const r3 = result.find((r) => r.string_number === 3)!
    expect(r3.bucket).toBe('critical')
    expect(r3.status).toBe('OPEN_CIRCUIT')
    expect(r3.no_score_reason).toBe('string_open_circuit')
  })

  it('nighttime (V=0, I=0) → no score, status=OFFLINE', () => {
    const result = scoreLiveSr(
      [
        s(1, 0, 0, 0),
        s(2, 0, 0, 0),
        s(3, 0, 0, 0),
      ],
      huaweiInverter,
    )
    for (const r of result) {
      expect(r.bucket).toBeNull()
      expect(r.status).toBe('OFFLINE')
    }
  })

  it('stale string → no score, status=OFFLINE, reason=string_stale', () => {
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 600, 10, 6000),
        s(3, 600, 10, 6000, { stale: true }),
      ],
      huaweiInverter,
    )
    const r3 = result.find((r) => r.string_number === 3)!
    expect(r3.bucket).toBeNull()
    expect(r3.no_score_reason).toBe('string_stale')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — edge cases', () => {
  it('multiple singleton-MPPT strings → form a valid fallback pool together', () => {
    // 3 strings on 3 different MPPTs (no peer in MPPT) → all dropped to fallback pool.
    // Fallback pool size = 3 ≥ MIN_PEERS_FOR_MPPT_GROUP → comparison valid.
    // Strings 1, 3 at full power. String 5 at 50% → Critical against the fallback max.
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),    // MPPT1 alone
        s(3, 600, 10, 6000),    // MPPT2 alone
        s(5, 600, 5,  3000),    // MPPT3 alone — 50% of fallback peer max
      ],
      huaweiInverter,
    )
    expect(result.find((r) => r.string_number === 1)?.bucket).toBe('healthy')
    expect(result.find((r) => r.string_number === 3)?.bucket).toBe('healthy')
    expect(result.find((r) => r.string_number === 5)?.bucket).toBe('critical')
  })

  it('stringsAreMppts: a whole bad MPPT-pair is Critical (device-wide), not falsely Healthy by self-pairing', () => {
    // THE regression guard. With a normal 2-per-MPPT model (maxStrings=8), strings
    // 3&4 PAIR into one MPPT group. If they are a whole UNDERPERFORMING MPPT-pair
    // (both at half output), pairing compares them to EACH OTHER → SR=1.0 →
    // falsely Healthy (the exact bug this fix kills). With stringsAreMppts each is
    // its own MPPT → all fall to the device-wide pool → the half pair is compared
    // to the full strings → correctly Critical. This test FAILS if the flag ever
    // stops threading (3&4 would pair and read Healthy again).
    const mpptDevice: LiveScoringContext = {
      deviceId: 'gw1', inverterModel: null, inverterMaxStrings: 8,
      stringsAreMppts: true, armed: true,
    }
    const result = scoreLiveSr(
      [s(1, 600, 10, 6000), s(2, 600, 10, 6000), s(3, 600, 5, 3000), s(4, 600, 5, 3000)],
      mpptDevice,
    )
    expect(result.find((r) => r.string_number === 1)?.bucket).toBe('healthy')
    expect(result.find((r) => r.string_number === 3)?.bucket).toBe('critical')
    expect(result.find((r) => r.string_number === 4)?.bucket).toBe('critical')
    expect(result.find((r) => r.string_number === 3)?.sr ?? 1).toBeLessThan(0.85)
  })

  it('only one valid string in entire inverter → insufficient_peers', () => {
    // 1 producing + 1 excluded + 1 nighttime = no peer pool can form
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),                                       // alone, no MPPT peer
        s(2, 600, 8, 4800, { exclude_from_peer_comparison: true }), // excluded
      ],
      huaweiInverter,
    )
    expect(result.find((r) => r.string_number === 1)?.no_score_reason)
      .toBe('insufficient_peers')
  })

  it('all peers in deep shade (per-panel-W < threshold) → low_irradiance_group', () => {
    const result = scoreLiveSr(
      [
        s(1, 100, 0.5, 50),  // 50W / 16 panels = 3.125 W/panel → below threshold
        s(2, 100, 0.5, 50),
      ],
      huaweiInverter,
    )
    expect(result[0].no_score_reason).toBe('low_irradiance_group')
    expect(result[0].bucket).toBeNull()
    expect(result[1].no_score_reason).toBe('low_irradiance_group')
  })

  it('only one valid peer in entire inverter → insufficient_peers', () => {
    // Everything excluded or non-comparable except string 1
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),
        s(2, 0, 0, 0),                                           // nighttime
        s(3, 600, 10, 6000, { is_used: false }),                 // unused
      ],
      huaweiInverter,
    )
    const r1 = result.find((r) => r.string_number === 1)!
    expect(r1.no_score_reason).toBe('insufficient_peers')
    expect(r1.bucket).toBeNull()
  })

  it('client scenario — mixed panel counts on CSI inverter (15/16/17) with one truly broken string', () => {
    // Inspired by FANZ CSI Inverter (00254424270149J015)
    // CSI fallback topology → 2 strings/MPPT
    // MPPT1: PV1 (17 panels @ 6000W) + PV2 (17 panels @ 6000W) → equal, healthy
    // MPPT2: PV3 (17 panels @ 6000W) + PV4 (15 panels @ 5290W → 352 W/panel vs 352 W/panel) → equal
    // MPPT3: PV5 (17 panels @ 1700W) + PV6 (17 panels @ 6000W) → PV5 is 28% → Critical
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000, { panel_count: 17 }),
        s(2, 600, 10, 6000, { panel_count: 17 }),
        s(3, 600, 10, 6000, { panel_count: 17 }),
        s(4, 600, 8.82, 5290, { panel_count: 15 }),
        s(5, 600, 2.83, 1700, { panel_count: 17 }), // 100 W/panel
        s(6, 600, 10, 6000, { panel_count: 17 }),    // 353 W/panel - peer
      ],
      csiInverter36,
    )
    expect(result.find((r) => r.string_number === 4)?.bucket).toBe('healthy')   // 15-panel not falsely flagged
    expect(result.find((r) => r.string_number === 5)?.bucket).toBe('critical')   // genuine fault
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sun-elevation arming (FANZ low-sun open-circuit false-red, audit 2026-06-07)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — sun-elevation arming (armed=false)', () => {
  it('FANZ night standby (167V, 0A) does NOT flag open-circuit critical when disarmed', () => {
    // Replayed live 2026-06-07: every CSI string ~167V/0A at low sun. With the
    // old (gateless) path this was a sea of "open-circuit critical".
    const result = scoreLiveSr(
      [
        s(1, 167, 0, 0),
        s(2, 167, 0, 0),
        s(3, 167, 0, 0),
        s(4, 167, 0, 0),
      ],
      { ...csiInverter36, armed: false },
    )
    for (const r of result) {
      expect(r.bucket).toBeNull()                      // NOT critical
      expect(r.status).toBe('OFFLINE')                 // donut openCircuit flag → false
      expect(r.no_score_reason).toBe('low_sun')
    }
  })

  it('same standby readings WHEN ARMED (daytime) still flag open-circuit — a real daytime fault is not suppressed', () => {
    const result = scoreLiveSr(
      [s(1, 167, 0, 0), s(2, 600, 10, 6000), s(3, 600, 10, 6000)],
      { ...csiInverter36, armed: true },
    )
    expect(result.find((r) => r.string_number === 1)?.bucket).toBe('critical')
    expect(result.find((r) => r.string_number === 1)?.status).toBe('OPEN_CIRCUIT')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MEDIAN anchor — robust to one overperformer (was the max-anchor false-red)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scoreLiveSr — median anchor (robust to overperformer)', () => {
  it('a typical string is NOT critical when one peer overperforms hugely (the FANZ daytime over-flag)', () => {
    // Device-wide fallback group (singleton MPPTs): three normal strings + one
    // outlier overperformer. Under the OLD max anchor, the normal strings read
    // 375/625 = 0.60 → falsely CRITICAL. Under the median anchor (median 375),
    // they read 375/375 = 1.0 → healthy. This is the daytime fix.
    const result = scoreLiveSr(
      [
        s(1, 600, 10, 6000),    // 375 W/panel
        s(3, 600, 10, 6000),    // 375 (different MPPT → singletons → fallback pool)
        s(5, 600, 10, 6000),    // 375
        s(7, 600, 16.7, 10000), // 625 — outlier overperformer (would pin a max anchor)
      ],
      { deviceId: 'devX', inverterModel: null, inverterMaxStrings: 8, armed: true },
    )
    const c = result.find((r) => r.string_number === 5)!
    expect(c.sr).toBeCloseTo(1.0, 2)
    expect(c.bucket).toBe('healthy')
  })

  it('a genuinely below-median string is STILL critical (median anchor does not mask real faults)', () => {
    // MPPT pair: peer 6000W (375/panel), broken 1700W (106/panel). median 240.5;
    // 106/240.5 = 0.44 → critical. Real faults still caught.
    const result = scoreLiveSr(
      [s(1, 600, 10, 6000), s(2, 600, 2.83, 1700)],
      huaweiInverter,
    )
    const broken = result.find((r) => r.string_number === 2)!
    expect(broken.bucket).toBe('critical')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('summarizeLiveScoring', () => {
  it('aggregates bucket counts and surfaces panel_count_is_default rollup', () => {
    const results = scoreLiveSr(
      [
        s(1, 600, 10, 6000, { panel_count: null }), // default
        s(2, 600, 10, 6000, { panel_count: null }), // default
        s(3, 600, 5, 3000, { panel_count: 17 }),
      ],
      huaweiInverter,
    )
    const summary = summarizeLiveScoring('dev1', results)
    expect(summary.using_default_panel_count).toBe(2)
    expect(summary.bucket_counts.healthy + summary.bucket_counts.abnormal + summary.bucket_counts.critical)
      .toBeGreaterThan(0)
  })
})
