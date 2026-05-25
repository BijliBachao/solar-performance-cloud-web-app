import { describe, it, expect } from 'vitest'
import {
  scoreDailyP2P,
  type DailyStringInput,
  type DailyScoringContext,
} from '@/lib/string-health-daily'

// Peak hours 10–13; dawn/dusk 6/18 at 10% so they fall under the 0.5 cutoff.
function peakHourly(peakPowerW: number) {
  return [
    { hour: 6, avg_power_W: peakPowerW * 0.1 },
    { hour: 10, avg_power_W: peakPowerW },
    { hour: 11, avg_power_W: peakPowerW },
    { hour: 12, avg_power_W: peakPowerW },
    { hour: 13, avg_power_W: peakPowerW },
    { hour: 18, avg_power_W: peakPowerW * 0.1 },
  ]
}

function mkStr(
  string_number: number,
  peakPowerW: number,
  opts: Partial<Pick<DailyStringInput, 'panel_count' | 'is_used' | 'exclude_from_peer_comparison'>> = {},
): DailyStringInput {
  return {
    string_number,
    panel_count: opts.panel_count ?? 16,
    is_used: opts.is_used ?? true,
    exclude_from_peer_comparison: opts.exclude_from_peer_comparison ?? false,
    hourly: peakHourly(peakPowerW),
  }
}

// Device-wide grouping (no model, no max_strings → one pool of all strings).
const deviceCtx: DailyScoringContext = { deviceId: 'dev1', inverterModel: null, inverterMaxStrings: null }
// 2-strings-per-MPPT grouping via even max_strings fallback.
const mpptCtx = (maxStrings: number): DailyScoringContext => ({ deviceId: 'dev1', inverterModel: null, inverterMaxStrings: maxStrings })

const byNum = (results: ReturnType<typeof scoreDailyP2P>) =>
  new Map(results.map((r) => [r.string_number, r]))

describe('scoreDailyP2P — core P2P (device-wide pool)', () => {
  it('median-anchored: a string at half the group median is Critical, peers Healthy', () => {
    const r = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600), mkStr(3, 800)], deviceCtx))
    // per-panel: 100, 100, 50 → median 100 → P2P 1.0, 1.0, 0.5
    expect(r.get(1)!.bucket).toBe('healthy')
    expect(r.get(2)!.bucket).toBe('healthy')
    expect(r.get(3)!.bucket).toBe('critical')
    expect(r.get(3)!.p2p).toBeCloseTo(0.5, 3)
    expect(r.get(3)!.score_persisted).toBeCloseTo(50, 1)
  })

  it('median resists a single high outlier (peers not dragged down)', () => {
    // per-panel 200, 100, 100 → median 100, NOT mean 133
    const r = byNum(scoreDailyP2P([mkStr(1, 3200), mkStr(2, 1600), mkStr(3, 1600)], deviceCtx))
    expect(r.get(2)!.p2p).toBeCloseTo(1.0, 3)
    expect(r.get(3)!.p2p).toBeCloseTo(1.0, 3)
    expect(r.get(1)!.p2p).toBeCloseTo(1.5, 3) // capped
    expect(r.get(2)!.bucket).toBe('healthy')
  })

  it('panel-count normalization: 32-panel and 16-panel strings at equal per-panel are both Healthy', () => {
    // X: 32 panels @ 3200W = 100/panel; Y: 16 panels @ 1600W = 100/panel
    const r = byNum(scoreDailyP2P([
      mkStr(1, 3200, { panel_count: 32 }),
      mkStr(2, 1600, { panel_count: 16 }),
    ], deviceCtx))
    expect(r.get(1)!.p2p).toBeCloseTo(1.0, 3)
    expect(r.get(2)!.p2p).toBeCloseTo(1.0, 3)
    expect(r.get(1)!.bucket).toBe('healthy')
    expect(r.get(2)!.bucket).toBe('healthy')
  })
})

describe('scoreDailyP2P — bucketing thresholds', () => {
  it('P2P just below 0.94 is Abnormal; just below 0.85 is Critical', () => {
    // median anchored by two full strings at 100/panel; vary the third.
    const abnormal = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600), mkStr(3, 1488)], deviceCtx))
    expect(abnormal.get(3)!.p2p).toBeCloseTo(0.93, 2)
    expect(abnormal.get(3)!.bucket).toBe('abnormal')

    const critical = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600), mkStr(3, 1344)], deviceCtx))
    expect(critical.get(3)!.p2p).toBeCloseTo(0.84, 2)
    expect(critical.get(3)!.bucket).toBe('critical')
  })
})

describe('scoreDailyP2P — peak window', () => {
  it('dawn/dusk hours are excluded — score reflects peak only', () => {
    // String 3 has a strong dawn reading (1600) but is weak at peak (800).
    // Dawn total stays under the peak cutoff, so hour 6 is NOT in the window;
    // peak-only average is 800/16=50 → P2P 0.5. If dawn were averaged in, the
    // mean would be 960/16=60 → P2P 0.6 — so 0.5 proves dawn was excluded.
    const weakAtPeak: DailyStringInput = {
      string_number: 3, panel_count: 16, is_used: true, exclude_from_peer_comparison: false,
      hourly: [
        { hour: 6, avg_power_W: 1600 }, // strong dawn — must be ignored
        { hour: 10, avg_power_W: 800 }, { hour: 11, avg_power_W: 800 },
        { hour: 12, avg_power_W: 800 }, { hour: 13, avg_power_W: 800 },
      ],
    }
    const r = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600), weakAtPeak], deviceCtx))
    expect(r.get(3)!.p2p).toBeCloseTo(0.5, 2) // 0.6 would mean dawn leaked in
    expect(r.get(3)!.bucket).toBe('critical')
  })

  it('string with data only at dawn (none in peak window) → no_data_in_peak_window', () => {
    const dawnOnly: DailyStringInput = {
      string_number: 3, panel_count: 16, is_used: true, exclude_from_peer_comparison: false,
      hourly: [{ hour: 6, avg_power_W: 120 }],
    }
    const r = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600), dawnOnly], deviceCtx))
    expect(r.get(3)!.p2p).toBeNull()
    expect(r.get(3)!.no_score_reason).toBe('no_data_in_peak_window')
  })

  it('no production at all today → every string no_production_today', () => {
    const r = scoreDailyP2P([mkStr(1, 0), mkStr(2, 0)], deviceCtx)
    expect(r.every((x) => x.no_score_reason === 'no_production_today')).toBe(true)
    expect(r.every((x) => x.bucket === null)).toBe(true)
  })
})

describe('scoreDailyP2P — MPPT grouping (2 strings/MPPT via even max_strings)', () => {
  it('a string is compared within its MPPT group, not the whole inverter', () => {
    // MPPT1 = {1,2} both 100/panel; MPPT2 = {3,4}: 100 and 50/panel.
    // Within MPPT2 median([100,50])=75 → string4 P2P=0.667 critical, string3 1.33 healthy.
    const r = byNum(scoreDailyP2P([
      mkStr(1, 1600), mkStr(2, 1600), mkStr(3, 1600), mkStr(4, 800),
    ], mpptCtx(4)))
    expect(r.get(4)!.p2p).toBeCloseTo(0.667, 2)
    expect(r.get(4)!.bucket).toBe('critical')
    expect(r.get(3)!.p2p).toBeCloseTo(1.333, 2)
    expect(r.get(1)!.p2p).toBeCloseTo(1.0, 3)
  })

  it('topology_is_fallback true when model null, false when model known', () => {
    const fb = scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600)], mpptCtx(4))
    expect(fb[0].topology_is_fallback).toBe(true)
    const known = scoreDailyP2P([mkStr(1, 1600), mkStr(2, 1600)], {
      deviceId: 'd', inverterModel: 'CSI-120K-T4001B-E', inverterMaxStrings: 36,
    })
    expect(known[0].topology_is_fallback).toBe(false)
  })
})

describe('scoreDailyP2P — override layers', () => {
  it('is_used=false → excluded, and does not pollute peak window or median', () => {
    // unused string carries a huge induction value that must not skew anything
    const unused = mkStr(3, 99999, { is_used: false })
    const r = byNum(scoreDailyP2P([mkStr(1, 1600), mkStr(2, 800), unused], deviceCtx))
    expect(r.get(3)!.no_score_reason).toBe('string_excluded_unused')
    expect(r.get(3)!.bucket).toBeNull()
    // median over used pool = median([100,50]) = 75 → string2 P2P 0.667
    expect(r.get(2)!.p2p).toBeCloseTo(0.667, 2)
  })

  it('exclude_from_peer_comparison → no score, NORMAL, not in median pool', () => {
    const r = byNum(scoreDailyP2P([
      mkStr(1, 1600), mkStr(2, 1600), mkStr(3, 400, { exclude_from_peer_comparison: true }),
    ], deviceCtx))
    expect(r.get(3)!.no_score_reason).toBe('string_peer_excluded')
    expect(r.get(3)!.status).toBe('NORMAL')
    // median over {1,2} only = 100 → both healthy (string3 didn't drag it)
    expect(r.get(1)!.p2p).toBeCloseTo(1.0, 3)
  })

  it('insufficient peers (single comparable string) → insufficient_peers', () => {
    const r = byNum(scoreDailyP2P([
      mkStr(1, 1600), mkStr(2, 1600, { is_used: false }),
    ], deviceCtx))
    expect(r.get(1)!.no_score_reason).toBe('insufficient_peers')
  })

  it('low-irradiance group (median per-panel < floor) → low_irradiance_group', () => {
    // 2 strings @ 64W over 16 panels = 4 W/panel < MIN_PER_PANEL_W_FOR_COMPARISON(5)
    const r = byNum(scoreDailyP2P([mkStr(1, 64), mkStr(2, 64)], deviceCtx))
    expect(r.get(1)!.no_score_reason).toBe('low_irradiance_group')
    expect(r.get(1)!.bucket).toBeNull()
  })
})

describe('scoreDailyP2P — client anchor case (CSI inverter, worst-at-peak string)', () => {
  it('the worst string at peak is flagged Critical, not "Healthy" like the legacy 24h-average', () => {
    // 9 healthy strings ~100/panel + PV10 at ~55/panel (the client complaint).
    const inputs: DailyStringInput[] = []
    for (let i = 1; i <= 9; i++) inputs.push(mkStr(i, 1600))
    inputs.push(mkStr(10, 880)) // 55 W/panel
    const r = byNum(scoreDailyP2P(inputs, deviceCtx))
    // median over the 10 ≈ 100 → PV10 P2P ≈ 0.55 → Critical
    expect(r.get(10)!.p2p).toBeLessThan(0.85)
    expect(r.get(10)!.bucket).toBe('critical')
    // and the healthy ones stay healthy
    expect(r.get(1)!.bucket).toBe('healthy')
  })
})
