import { describe, it, expect } from 'vitest'
import {
  classifyReading,
  MAX_STRING_VOLTAGE_V,
  REVERSE_CURRENT_THRESHOLD_A,
  FROZEN_REPEAT_COUNT,
  type ClassifyContext,
} from '@/lib/data-quality'

// Lahore coords; daylight vs night instants validated in solar-geometry tests.
const LAT = 31.5204, LNG = 74.3587
const DAY = new Date('2026-05-25T07:00:00Z')   // solar noon (~79° elevation)
const NIGHT = new Date('2026-05-24T22:00:00Z') // deep night (negative elevation)

const dayCtx = (recent?: ClassifyContext['recent']): ClassifyContext => ({ lat: LAT, lng: LNG, timestamp: DAY, recent })
const nightCtx = (recent?: ClassifyContext['recent']): ClassifyContext => ({ lat: LAT, lng: LNG, timestamp: NIGHT, recent })

describe('classifyReading — valid', () => {
  it('healthy daylight reading → valid + trustworthy, power reconciled to V×I', () => {
    const r = classifyReading({ voltage: 590, current: 12, power: 99999 }, dayCtx())
    expect(r.verdict).toBe('valid')
    expect(r.trustworthy).toBe(true)
    expect(r.power).toBeCloseTo(590 * 12, 1) // vendor power 99999 IGNORED
    expect(r.alarm).toBeNull()
  })
})

describe('classifyReading — CSI vendor-power reconciliation (the proven glitch)', () => {
  it('ignores inflated vendor power, uses V×I', () => {
    // Real case: PV1 V=590 I=12 but vendor reported 13,085W
    const r = classifyReading({ voltage: 590, current: 12, power: 13085 }, dayCtx())
    expect(r.power).toBeCloseTo(7080, 0)
    expect(r.verdict).toBe('valid')
  })
  it('PV4 case: vendor power 17W but real V×I healthy → still valid (not falsely critical)', () => {
    const r = classifyReading({ voltage: 690, current: 9, power: 17 }, dayCtx())
    expect(r.verdict).toBe('valid')
    expect(r.power).toBeCloseTo(6210, 0)
  })
})

describe('classifyReading — sensor_fault (out of range / sentinels)', () => {
  it('SolarMAN 6553.5V sentinel → sensor_fault', () => {
    const r = classifyReading({ voltage: 6553.5, current: 0.2 }, dayCtx())
    expect(r.verdict).toBe('sensor_fault')
    expect(r.trustworthy).toBe(false)
    expect(r.power).toBe(0)
  })
  it('impossible current 1177A → sensor_fault', () => {
    expect(classifyReading({ voltage: 1152, current: 1177 }, dayCtx()).verdict).toBe('sensor_fault')
  })
  it('power > 25kW (V×I) → sensor_fault', () => {
    expect(classifyReading({ voltage: 1000, current: 40 }, dayCtx()).verdict).toBe('sensor_fault')
  })
  it('voltage just above MAX is fault, just below is fine', () => {
    expect(classifyReading({ voltage: MAX_STRING_VOLTAGE_V + 1, current: 5 }, dayCtx()).verdict).toBe('sensor_fault')
    expect(classifyReading({ voltage: MAX_STRING_VOLTAGE_V - 100, current: 5 }, dayCtx()).verdict).toBe('valid')
  })
  it('NaN values → sensor_fault', () => {
    expect(classifyReading({ voltage: NaN, current: 5 }, dayCtx()).verdict).toBe('sensor_fault')
  })
})

describe('classifyReading — reverse_current (Huawei −17A case)', () => {
  it('large negative current → reverse_current + alarm', () => {
    const r = classifyReading({ voltage: 261, current: -17.47 }, dayCtx())
    expect(r.verdict).toBe('reverse_current')
    expect(r.alarm).toBe('reverse_current')
    expect(r.trustworthy).toBe(false)
  })
  it('tiny negative (dawn diode leakage) is NOT reverse_current', () => {
    const r = classifyReading({ voltage: 684, current: -0.05 }, dayCtx())
    expect(r.verdict).not.toBe('reverse_current')
  })
  it('boundary: just past −threshold is reverse, just under is not', () => {
    expect(classifyReading({ voltage: 300, current: -(REVERSE_CURRENT_THRESHOLD_A + 0.1) }, dayCtx()).verdict).toBe('reverse_current')
    expect(classifyReading({ voltage: 300, current: -(REVERSE_CURRENT_THRESHOLD_A - 0.1) }, dayCtx()).verdict).not.toBe('reverse_current')
  })
})

describe('classifyReading — night gate', () => {
  it('any reading at night → night, not trustworthy', () => {
    const r = classifyReading({ voltage: 0, current: 0 }, nightCtx())
    expect(r.verdict).toBe('night')
    expect(r.trustworthy).toBe(false)
  })
  it('frozen sunset values at night → night (night decided before frozen)', () => {
    const recent = [{ voltage: 389.3, current: 0.2 }, { voltage: 389.3, current: 0.2 }]
    const r = classifyReading({ voltage: 389.3, current: 0.2 }, nightCtx(recent))
    expect(r.verdict).toBe('night')
  })
})

describe('classifyReading — ORDERING: faults never masked as night', () => {
  it('sensor fault at night → sensor_fault (not night)', () => {
    expect(classifyReading({ voltage: 6553.5, current: 0.2 }, nightCtx()).verdict).toBe('sensor_fault')
  })
  it('reverse current at night → reverse_current (not night)', () => {
    expect(classifyReading({ voltage: 261, current: -17 }, nightCtx()).verdict).toBe('reverse_current')
  })
})

describe('classifyReading — frozen / dead value (daylight)', () => {
  it('identical to recent samples in daylight → frozen', () => {
    const recent = Array.from({ length: FROZEN_REPEAT_COUNT - 1 }, () => ({ voltage: 500, current: 8 }))
    const r = classifyReading({ voltage: 500, current: 8 }, dayCtx(recent))
    expect(r.verdict).toBe('frozen')
    expect(r.trustworthy).toBe(false)
  })
  it('changing values in daylight → NOT frozen', () => {
    const recent = [{ voltage: 500, current: 8 }, { voltage: 498, current: 7.9 }]
    expect(classifyReading({ voltage: 502, current: 8.1 }, dayCtx(recent)).verdict).toBe('valid')
  })
  it('no history → not frozen (can\'t tell yet)', () => {
    expect(classifyReading({ voltage: 500, current: 8 }, dayCtx()).verdict).toBe('valid')
  })
})

describe('classifyReading — open_circuit (Popular Sole 800V/0A case)', () => {
  it('voltage present, ~0 current in daylight → open_circuit + alarm', () => {
    const r = classifyReading({ voltage: 806.5, current: 0 }, dayCtx())
    expect(r.verdict).toBe('open_circuit')
    expect(r.alarm).toBe('open_circuit')
    expect(r.trustworthy).toBe(false)
  })
  it('voltage present, 0 current at NIGHT → night (not open_circuit — expected dark)', () => {
    expect(classifyReading({ voltage: 806.5, current: 0 }, nightCtx()).verdict).toBe('night')
  })
})

describe('classifyReading — fail-safe coordinates', () => {
  it('null coords → daylight gate disabled → classified on physics (not night)', () => {
    const r = classifyReading({ voltage: 590, current: 12 }, { lat: null, lng: null, timestamp: NIGHT })
    expect(r.verdict).toBe('valid') // never suppress a real reading for an un-geo-located plant
  })
})
