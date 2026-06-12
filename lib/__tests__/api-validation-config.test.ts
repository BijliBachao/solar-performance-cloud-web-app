import { describe, it, expect } from 'vitest'
import {
  StringConfigUpsertSchema,
  StringConfigBulkSchema,
  PlantUpdateSchema,
  VALID_CONDITION_TAGS,
  VALID_PLANT_TYPES,
} from '@/lib/api-validation'

// Chunk C — config UI. The DB columns (string_configs.condition_tag,
// plants.plant_type) already exist; these schemas are the request-validation
// gate in front of them.

describe('StringConfigUpsertSchema — condition_tag', () => {
  it('accepts every one of the 7 condition tags', () => {
    for (const tag of VALID_CONDITION_TAGS) {
      const r = StringConfigUpsertSchema.safeParse({ condition_tag: tag })
      expect(r.success).toBe(true)
    }
  })

  it('accepts null and omitted condition_tag', () => {
    expect(StringConfigUpsertSchema.safeParse({ condition_tag: null }).success).toBe(true)
    expect(StringConfigUpsertSchema.safeParse({}).success).toBe(true)
  })

  it('rejects an unknown condition_tag', () => {
    const r = StringConfigUpsertSchema.safeParse({ condition_tag: 'sunny' })
    expect(r.success).toBe(false)
  })

  it('still validates the pre-existing fields alongside condition_tag', () => {
    const r = StringConfigUpsertSchema.safeParse({
      panel_count: 8,
      condition_tag: 'known_shaded',
      exclude_from_peer_comparison: true,
    })
    expect(r.success).toBe(true)
  })
})

describe('StringConfigBulkSchema — condition_tag', () => {
  it('accepts a valid condition_tag', () => {
    expect(StringConfigBulkSchema.safeParse({ condition_tag: 'different_tilt' }).success).toBe(true)
  })

  it('rejects a bad condition_tag', () => {
    expect(StringConfigBulkSchema.safeParse({ condition_tag: 'nope' }).success).toBe(false)
  })

  it('keeps the only_unconfigured default', () => {
    const r = StringConfigBulkSchema.safeParse({ condition_tag: 'normal' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.only_unconfigured).toBe(false)
  })
})

describe('PlantUpdateSchema — plant_type', () => {
  it('accepts both valid plant types', () => {
    for (const t of VALID_PLANT_TYPES) {
      expect(PlantUpdateSchema.safeParse({ plant_type: t }).success).toBe(true)
    }
  })

  it('rejects an unknown plant_type', () => {
    expect(PlantUpdateSchema.safeParse({ plant_type: 'orbital' }).success).toBe(false)
  })

  it('accepts an empty body (plant_type optional)', () => {
    expect(PlantUpdateSchema.safeParse({}).success).toBe(true)
  })
})
