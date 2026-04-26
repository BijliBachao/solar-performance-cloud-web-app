import { z } from 'zod'
import { MAX_DATE_RANGE_DAYS } from '@/lib/string-health'

// ─── Shared Constants (single source of truth) ────────────────────────

export const VALID_ROLES = ['ORG_USER', 'SUPER_ADMIN'] as const
export const VALID_USER_STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING_ASSIGNMENT'] as const
export const VALID_ORG_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export const VALID_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const
export const VALID_PROVIDERS = ['huawei', 'solis', 'growatt', 'sungrow'] as const

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
  panel_count: z.number().int().min(1, 'At least 1 panel').max(100, 'Max 100 panels per string'),
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50, 'Min 50 W').max(1000, 'Max 1000 W').nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export const StringConfigBulkSchema = z.object({
  panel_count: z.number().int().min(1).max(100),
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50).max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  // If true, only fill in strings that don't already have a config.
  // If false, overwrite every string under the plant.
  only_unconfigured: z.boolean().default(false),
})

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
