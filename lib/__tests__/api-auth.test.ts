import { describe, it, expect, vi } from 'vitest'

// api-auth.ts imports Clerk + Prisma at module top (used by getUserFromRequest).
// plantScopeWhere itself is pure; stub the heavy deps so the module loads.
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { plantScopeWhere } from '@/lib/api-auth'

const admin = { role: 'SUPER_ADMIN' }
const org = { role: 'ORG_USER' }

describe('plantScopeWhere — tenant scoping invariant', () => {
  it('SUPER_ADMIN with no plant filter is unrestricted (sees all)', () => {
    expect(plantScopeWhere(admin, [], null)).toEqual({})
  })

  it('SUPER_ADMIN with a plant filter scopes to that plant', () => {
    expect(plantScopeWhere(admin, [], 'p1')).toEqual({ plant_id: 'p1' })
  })

  it('ORG_USER with assignments scopes to the assigned set', () => {
    expect(plantScopeWhere(org, ['p1', 'p2'], null)).toEqual({ plant_id: { in: ['p1', 'p2'] } })
  })

  it('ORG_USER with a (validated) specific plant scopes to it', () => {
    expect(plantScopeWhere(org, ['p1', 'p2'], 'p2')).toEqual({ plant_id: 'p2' })
  })

  it('SECURITY INVARIANT: ORG_USER with NO assignments matches NOTHING, never falls open', () => {
    const w = plantScopeWhere(org, [], null)
    // Must be { plant_id: { in: [] } } — an empty `in` matches zero rows in Postgres.
    expect(w).toEqual({ plant_id: { in: [] } })
    // The bug we are guarding against: returning {} (no filter → all tenants).
    expect(w).not.toEqual({})
    expect('plant_id' in w).toBe(true)
  })

  it('any non-admin role is treated as scoped (not just ORG_USER)', () => {
    expect(plantScopeWhere({ role: 'SOMETHING_ELSE' }, [], null)).toEqual({ plant_id: { in: [] } })
  })
})
