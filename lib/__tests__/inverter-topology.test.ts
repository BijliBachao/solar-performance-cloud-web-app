import { describe, it, expect } from 'vitest'
import {
  getInverterTopology,
  getMpptForString,
  getMpptGroupKey,
  isTopologyHighConfidence,
} from '@/lib/inverter-topology'

// Topology lookup contract:
//   - Model match wins over max_strings fallback
//   - Even max_strings → 2 strings/MPPT (commercial inverter default)
//   - Odd max_strings → 1 string/MPPT (residential default)
//   - Null model + null max_strings → no topology (caller falls back to inverter-level)

describe('getInverterTopology — model-keyed', () => {
  it('returns exact match for known Huawei models', () => {
    expect(getInverterTopology('SUN2000-100KTL-INM0', null))
      .toMatchObject({ mppts: 10, stringsPerMppt: 2 })
    expect(getInverterTopology('SUN2000-330KTL-H2', null))
      .toMatchObject({ mppts: 14, stringsPerMppt: 2 })
    expect(getInverterTopology('SUN2000-10KTL-M1', null))
      .toMatchObject({ mppts: 2, stringsPerMppt: 1 })
  })

  it('returns exact match for known CSI models', () => {
    expect(getInverterTopology('CSI-110K-T', null))
      .toMatchObject({ mppts: 9, stringsPerMppt: 4 })
    expect(getInverterTopology('CSI-125KTL-GS', null))
      .toMatchObject({ mppts: 10, stringsPerMppt: 2 })
  })

  it('model match wins even when max_strings would suggest different topology', () => {
    // CSI-110K-T explicitly has 4 strings/MPPT; max_strings=36 would default to 2/MPPT
    const layout = getInverterTopology('CSI-110K-T', 36)
    expect(layout?.stringsPerMppt).toBe(4)
    expect(layout?.mppts).toBe(9)
  })

  it('trims whitespace on model field', () => {
    expect(getInverterTopology('  SUN2000-100KTL-INM0  ', null))
      .toMatchObject({ mppts: 10, stringsPerMppt: 2 })
  })

  it('unknown model + max_strings → falls back to max-strings heuristic', () => {
    const layout = getInverterTopology('UNKNOWN-MODEL-XYZ', 20)
    expect(layout?.mppts).toBe(10)
    expect(layout?.stringsPerMppt).toBe(2)
    expect(layout?.source).toMatch(/fallback/i)
  })

  it('null model + null max_strings returns null (no topology)', () => {
    expect(getInverterTopology(null, null)).toBeNull()
    expect(getInverterTopology(undefined, undefined)).toBeNull()
    expect(getInverterTopology('', 0)).toBeNull()
  })
})

describe('getInverterTopology — max_strings fallback', () => {
  it('even max_strings → 2 strings/MPPT (commercial default)', () => {
    expect(getInverterTopology(null, 20)).toMatchObject({ mppts: 10, stringsPerMppt: 2 })
    expect(getInverterTopology(null, 28)).toMatchObject({ mppts: 14, stringsPerMppt: 2 })
    expect(getInverterTopology(null, 36)).toMatchObject({ mppts: 18, stringsPerMppt: 2 })
    expect(getInverterTopology(null, 8)).toMatchObject({ mppts: 4, stringsPerMppt: 2 })
  })

  it('odd max_strings → 1 string/MPPT (residential default)', () => {
    expect(getInverterTopology(null, 11)).toMatchObject({ mppts: 11, stringsPerMppt: 1 })
    expect(getInverterTopology(null, 17)).toMatchObject({ mppts: 17, stringsPerMppt: 1 })
  })

  it('max_strings < 2 returns null', () => {
    expect(getInverterTopology(null, 1)).toBeNull()
    expect(getInverterTopology(null, 0)).toBeNull()
  })

  it('fallback source string mentions populating devices.model', () => {
    const layout = getInverterTopology(null, 20)
    expect(layout?.source).toContain('devices.model')
  })
})

describe('getMpptForString', () => {
  it('uniform 2-string/MPPT layout maps correctly', () => {
    const args = ['SUN2000-100KTL-INM0', null] as const  // 10 mppts × 2 strings
    expect(getMpptForString(...args, 1)).toBe(1)
    expect(getMpptForString(...args, 2)).toBe(1)
    expect(getMpptForString(...args, 3)).toBe(2)
    expect(getMpptForString(...args, 4)).toBe(2)
    expect(getMpptForString(...args, 19)).toBe(10)
    expect(getMpptForString(...args, 20)).toBe(10)
  })

  it('uniform 4-string/MPPT layout (CSI-110K-T)', () => {
    expect(getMpptForString('CSI-110K-T', null, 1)).toBe(1)
    expect(getMpptForString('CSI-110K-T', null, 4)).toBe(1)
    expect(getMpptForString('CSI-110K-T', null, 5)).toBe(2)
    expect(getMpptForString('CSI-110K-T', null, 8)).toBe(2)
    expect(getMpptForString('CSI-110K-T', null, 36)).toBe(9)
  })

  it('returns null for out-of-range string numbers', () => {
    expect(getMpptForString('SUN2000-100KTL-INM0', null, 21)).toBeNull()  // 20 max
    expect(getMpptForString('SUN2000-100KTL-INM0', null, 0)).toBeNull()
    expect(getMpptForString('SUN2000-100KTL-INM0', null, -1)).toBeNull()
  })

  it('returns null when no topology is known', () => {
    expect(getMpptForString(null, null, 1)).toBeNull()
    expect(getMpptForString('UNKNOWN-MODEL', null, 1)).toBeNull()
  })

  it('uses max_strings fallback when model is missing', () => {
    // 36 strings → fallback: 18 MPPTs × 2 strings
    expect(getMpptForString(null, 36, 1)).toBe(1)
    expect(getMpptForString(null, 36, 2)).toBe(1)
    expect(getMpptForString(null, 36, 35)).toBe(18)
  })
})

describe('getMpptGroupKey', () => {
  it('returns mppt-keyed group when topology is known', () => {
    expect(getMpptGroupKey('dev1', 'SUN2000-100KTL-INM0', null, 1))
      .toBe('dev1:mppt1')
    expect(getMpptGroupKey('dev1', 'SUN2000-100KTL-INM0', null, 3))
      .toBe('dev1:mppt2')
  })

  it('falls back to device-wide group when topology unknown', () => {
    expect(getMpptGroupKey('dev1', null, null, 1)).toBe('dev1:device')
    expect(getMpptGroupKey('dev1', 'UNKNOWN', null, 1)).toBe('dev1:device')
  })

  it('different devices produce different keys even at same MPPT number', () => {
    const k1 = getMpptGroupKey('dev1', 'SUN2000-100KTL-INM0', null, 1)
    const k2 = getMpptGroupKey('dev2', 'SUN2000-100KTL-INM0', null, 1)
    expect(k1).not.toBe(k2)
  })
})

describe('isTopologyHighConfidence', () => {
  it('returns true for known models', () => {
    expect(isTopologyHighConfidence('SUN2000-100KTL-INM0')).toBe(true)
    expect(isTopologyHighConfidence('CSI-110K-T')).toBe(true)
  })

  it('returns false for unknown / empty / null model', () => {
    expect(isTopologyHighConfidence(null)).toBe(false)
    expect(isTopologyHighConfidence('')).toBe(false)
    expect(isTopologyHighConfidence(undefined)).toBe(false)
    expect(isTopologyHighConfidence('UNKNOWN-MODEL-XYZ')).toBe(false)
  })
})
