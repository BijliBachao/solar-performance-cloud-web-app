import { z } from 'zod'
import { MAX_DATE_RANGE_DAYS } from '@/lib/string-health'

// ─── Shared Constants (single source of truth) ────────────────────────

export const VALID_ROLES = ['ORG_USER', 'SUPER_ADMIN'] as const
export const VALID_USER_STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING_ASSIGNMENT'] as const
export const VALID_ORG_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export const VALID_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const
export const VALID_PROVIDERS = ['huawei', 'solis', 'growatt', 'sungrow'] as const

// Human-readable per-string condition tag (string_configs.condition_tag).
// Drives the peer-comparison auto-set rule in the string-config write paths.
export const VALID_CONDITION_TAGS = [
  'normal',
  'known_shaded',
  'different_tilt',
  'different_orientation',
  'under_observation',
  'excluded',
  'other',
] as const

// V1 scoring is identical for single_location; multi_location is a V1.1 marker.
export const VALID_PLANT_TYPES = ['single_location', 'multi_location'] as const

// ─── User Schemas ─────────────────────────────────────────────────────

export const UserUpdateSchema = z.object({
  role: z.enum(VALID_ROLES).optional(),
  status: z.enum(VALID_USER_STATUSES).optional(),
  organization_id: z.string().min(1).nullable().optional(),
})

// ─── Organization Schemas ─────────────────────────────────────────────

export const OrganizationCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.union([z.string().email('Invalid email format'), z.literal('')]).optional(),
  phone: z.string().max(20).optional().default(''),
  address: z.string().max(500).optional().default(''),
})

export const OrganizationUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.union([z.string().email('Invalid email format'), z.literal(''), z.null()]).optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  status: z.enum(VALID_ORG_STATUSES).optional(),
})

// ─── Plant Assignment Schema ──────────────────────────────────────────

export const PlantAssignSchema = z.object({
  plant_id: z.string().min(1, 'plant_id is required'),
  organization_id: z.string().min(1, 'organization_id is required'),
})

// ─── String Configuration Schemas ─────────────────────────────────────
// Manual data layer attached to each (device_id, string_number).
// Vendor APIs never expose installed panel info — admins enter it here.

export const StringConfigUpsertSchema = z.object({
  panel_count: z.number().int().min(1, 'At least 1 panel').max(100, 'Max 100 panels per string').nullable().optional(),
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50, 'Min 50 W').max(1000, 'Max 1000 W').nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_used: z.boolean().optional(),
  exclude_from_peer_comparison: z.boolean().optional(),
  condition_tag: z.enum(VALID_CONDITION_TAGS).nullable().optional(),
})

export const StringConfigBulkSchema = z.object({
  panel_count: z.number().int().min(1).max(100).nullable().optional(),
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50).max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  // If true, only fill in strings that don't already have a config.
  // If false, overwrite every string under the plant.
  only_unconfigured: z.boolean().default(false),
  is_used: z.boolean().optional(),
  exclude_from_peer_comparison: z.boolean().optional(),
  condition_tag: z.enum(VALID_CONDITION_TAGS).nullable().optional(),
})

// ─── Plant Update Schema ──────────────────────────────────────────────
// Plants are auto-created by pollers (syncPlants upsert) — there is no admin
// create form. plant_type is the only admin-editable field today.

export const PlantUpdateSchema = z.object({
  plant_type: z.enum(VALID_PLANT_TYPES).optional(),
})

// ─── Condition-tag → peer-comparison auto-set ─────────────────────────
// A condition tag implies whether a string belongs in the inverter peer pool.
// Shading / non-standard tilt-or-orientation / explicit exclusion are unfair to
// peer-compare → exclude. normal / under_observation are comparable → include.
// "other" is ambiguous → leave the existing flag untouched.
//
// Returns the exclude value the tag implies, or `undefined` when the tag does
// not imply one (i.e. "other"). Callers MUST let an explicitly-sent
// exclude_from_peer_comparison override this derived value (admin override).
export function autoExcludeForConditionTag(
  tag: (typeof VALID_CONDITION_TAGS)[number] | null | undefined,
): boolean | undefined {
  switch (tag) {
    case 'known_shaded':
    case 'different_tilt':
    case 'different_orientation':
    case 'excluded':
      return true
    case 'normal':
    case 'under_observation':
      return false
    // 'other', null, undefined → no implied value
    default:
      return undefined
  }
}

// ─── Analysis Date Range Schema ───────────────────────────────────────

export const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
}).refine(
  (data) => new Date(data.from) <= new Date(data.to),
  { message: 'Start date must be before end date' }
).refine(
  (data) => {
    const diff = (new Date(data.to).getTime() - new Date(data.from).getTime()) / (1000 * 60 * 60 * 24)
    return diff <= MAX_DATE_RANGE_DAYS
  },
  { message: `Date range must be 1-${MAX_DATE_RANGE_DAYS} days` }
)
