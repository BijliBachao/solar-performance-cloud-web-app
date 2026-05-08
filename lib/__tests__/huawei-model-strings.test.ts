import { describe, it, expect } from 'vitest'
import { getHuaweiMaxStrings, HUAWEI_MODEL_STRINGS } from '@/lib/huawei-model-strings'

describe('getHuaweiMaxStrings — null/empty input', () => {
  it('returns null for null', () => {
    expect(getHuaweiMaxStrings(null)).toBeNull()
  })
  it('returns null for undefined', () => {
    expect(getHuaweiMaxStrings(undefined)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(getHuaweiMaxStrings('')).toBeNull()
  })
  it('returns null for whitespace-only', () => {
    expect(getHuaweiMaxStrings('   ')).toBeNull()
  })
})

describe('getHuaweiMaxStrings — known models', () => {
  it('matches the SUN2000-115KTL-M0 (the production "Popular Sole" plants)', () => {
    expect(getHuaweiMaxStrings('SUN2000-115KTL-M0')).toBe(20)
  })

  it('matches the SUN2000-100KTL-M2 family at 20 strings', () => {
    expect(getHuaweiMaxStrings('SUN2000-100KTL-M2')).toBe(20)
  })

  it('matches utility-scale 215KTL at 24 strings', () => {
    expect(getHuaweiMaxStrings('SUN2000-215KTL-H0')).toBe(24)
  })

  it('matches small residential 5KTL at 2 strings', () => {
    expect(getHuaweiMaxStrings('SUN2000-5KTL-L1')).toBe(2)
  })
})

describe('getHuaweiMaxStrings — normalization', () => {
  it('matches lowercase input', () => {
    expect(getHuaweiMaxStrings('sun2000-100ktl-m2')).toBe(20)
  })

  it('matches mixed-case input', () => {
    expect(getHuaweiMaxStrings('Sun2000-100KTL-M2')).toBe(20)
  })

  it('matches input with surrounding whitespace', () => {
    expect(getHuaweiMaxStrings('  SUN2000-100KTL-M2  ')).toBe(20)
  })
})

describe('getHuaweiMaxStrings — unknown models', () => {
  it('returns null for an unrecognised commercial model', () => {
    expect(getHuaweiMaxStrings('SUN2000-999KTL-M99')).toBeNull()
  })

  it('returns null for a non-Huawei model name', () => {
    expect(getHuaweiMaxStrings('Solis-100K-5G')).toBeNull()
  })

  it('returns null for a firmware version (the historical bug we are fixing)', () => {
    // V500R023C00SPC156 etc. are firmware identifiers, not hardware models.
    // Before this fix, we were storing these as `model`. The lookup must
    // return null so the caller falls back to heuristic detection rather
    // than mis-applying a 0-string answer.
    expect(getHuaweiMaxStrings('V500R023C00SPC156')).toBeNull()
    expect(getHuaweiMaxStrings('V500R023C00SPC119')).toBeNull()
    expect(getHuaweiMaxStrings('V100R001C00SPC168')).toBeNull()
  })
})

describe('HUAWEI_MODEL_STRINGS table — sanity', () => {
  it('every entry has a positive integer string count', () => {
    for (const [model, count] of Object.entries(HUAWEI_MODEL_STRINGS)) {
      expect(Number.isInteger(count), `${model} is not an integer`).toBe(true)
      expect(count, `${model} count <= 0`).toBeGreaterThan(0)
      expect(count, `${model} count > 64 (sanity ceiling)`).toBeLessThanOrEqual(64)
    }
  })

  it('every entry key is uppercase (so case-insensitive lookup is reliable)', () => {
    for (const model of Object.keys(HUAWEI_MODEL_STRINGS)) {
      expect(model, `${model} is not uppercase`).toBe(model.toUpperCase())
    }
  })

  it('table contains the production-critical 100/115KTL family', () => {
    expect(HUAWEI_MODEL_STRINGS['SUN2000-100KTL-M0']).toBe(20)
    expect(HUAWEI_MODEL_STRINGS['SUN2000-115KTL-M0']).toBe(20)
  })
})
