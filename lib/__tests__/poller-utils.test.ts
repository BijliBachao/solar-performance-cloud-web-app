import { describe, it, expect, vi, beforeAll } from 'vitest'

// poller-utils.ts transitively loads @/lib/prisma which instantiates a real
// PrismaClient at module-eval time. Stub prisma so these pure-function tests
// stay offline and DB-independent.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

let safeArray: any, safeObject: any, safeInt: any, safeFloat: any
beforeAll(async () => {
  // Dynamic import after vi.mock has been hoisted — top-level await would
  // require module:es2022, but the project targets es5.
  const mod = await import('@/lib/poller-utils')
  safeArray = mod.safeArray
  safeObject = mod.safeObject
  safeInt = mod.safeInt
  safeFloat = mod.safeFloat
})

// These helpers are the foundation of the defensive parsing introduced in
// commit 280a9ff. They run at the iteration boundary where vendor JSON enters
// our code, so their behaviour must be deterministic for every malformed
// shape we have actually observed in production logs and vendor docs.

describe('safeArray', () => {
  it('returns the same array reference when given an array', () => {
    const a = [1, 2, 3]
    expect(safeArray(a)).toBe(a)
  })

  it('returns [] when given null (Huawei stations.list:null per Developer Guide §4.1.1 — partial outage)', () => {
    expect(safeArray(null)).toEqual([])
  })

  it('returns [] when given undefined (Solis page:undefined when records key is absent per SolisCloud API §4.1)', () => {
    expect(safeArray(undefined)).toEqual([])
  })

  it('returns [] when given an object (Growatt data:{} where {plants:[]} expected per V1 plant/list shape)', () => {
    expect(safeArray({ plants: 'not-an-array' })).toEqual([])
  })

  it('returns [] when given a string (Growatt data sometimes a status string on rate-limit per VALIDATED-FINDINGS §8)', () => {
    expect(safeArray('error')).toEqual([])
  })

  it('returns [] when given a number', () => {
    expect(safeArray(0)).toEqual([])
    expect(safeArray(42)).toEqual([])
  })

  it('returns [] for boolean inputs', () => {
    expect(safeArray(true)).toEqual([])
    expect(safeArray(false)).toEqual([])
  })

  it('preserves array contents including null elements (per-element guard is the caller responsibility)', () => {
    expect(safeArray([null, { a: 1 }, undefined])).toEqual([null, { a: 1 }, undefined])
  })
})

describe('safeObject', () => {
  it('returns the same object reference when given a plain object', () => {
    const o = { a: 1 }
    expect(safeObject(o)).toBe(o)
  })

  it('returns {} when given null (Sungrow result_data:null per SUNGROW-API-KNOWLEDGE §3 — E901 token errors)', () => {
    expect(safeObject(null)).toEqual({})
  })

  it('returns {} when given undefined (Huawei dataItemMap absent per Developer Guide §4.1.4 — device with no live data)', () => {
    expect(safeObject(undefined)).toEqual({})
  })

  it('returns {} when given an array (Growatt V4 data:[] vs data:{} ambiguity per VALIDATED-FINDINGS §6)', () => {
    expect(safeObject([1, 2, 3])).toEqual({})
  })

  it('returns {} when given a string', () => {
    expect(safeObject('error')).toEqual({})
  })

  it('returns {} when given a number', () => {
    expect(safeObject(42)).toEqual({})
  })

  it('returns {} for boolean inputs', () => {
    expect(safeObject(true)).toEqual({})
    expect(safeObject(false)).toEqual({})
  })

  it('preserves object with mixed value types', () => {
    const obj = { pv1_u: 650.5, pv1_i: null, day_cap: '52.35' }
    expect(safeObject(obj)).toBe(obj)
  })
})

describe('safeInt', () => {
  it('returns parsed integer for numeric input', () => {
    expect(safeInt(42)).toBe(42)
    expect(safeInt(-3)).toBe(-3)
  })

  it('parses numeric strings (Sungrow returns dev_status as string per §4.3)', () => {
    expect(safeInt('100')).toBe(100)
    expect(safeInt('1')).toBe(1)
  })

  it('truncates floats like parseInt (Growatt status sometimes "1.0")', () => {
    expect(safeInt('3.7')).toBe(3)
    expect(safeInt(7.9)).toBe(7)
  })

  it('returns 0 for non-numeric strings', () => {
    expect(safeInt('abc')).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(safeInt(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(safeInt(undefined)).toBe(0)
  })

  it('returns 0 for NaN', () => {
    expect(safeInt(NaN)).toBe(0)
  })

  it('returns 0 for Infinity (Growatt occasionally reports Infinity in fault counters)', () => {
    expect(safeInt(Infinity)).toBe(0)
    expect(safeInt(-Infinity)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(safeInt('')).toBe(0)
  })

  it('returns 0 for plain objects and empty arrays', () => {
    expect(safeInt({})).toBe(0)
    expect(safeInt([])).toBe(0)
  })

  it('parses single-element arrays via JS coercion (parseInt([1,2], 10) → 1 — documenting actual behavior, callers should not rely on this branch)', () => {
    // parseInt converts the argument to string first: [1,2].toString() === "1,2",
    // and parseInt("1,2", 10) returns 1. This isn't a bug in safeInt; it's how
    // the underlying parseInt works. Vendor APIs don't return arrays where
    // an int is expected, so this branch is harmless in practice.
    expect(safeInt([1, 2])).toBe(1)
  })
})

describe('loadStringConfigs (hoist for Task #108 / unblocks #97)', () => {
  let mockFindMany: any

  beforeAll(async () => {
    // No-op — helpers are loaded by the outer beforeAll already
  })

  it('returns empty sets when no configs exist for a device (default state for newly-discovered inverter)', async () => {
    mockFindMany = vi.fn().mockResolvedValue([])
    vi.doMock('@/lib/prisma', () => ({
      prisma: { string_configs: { findMany: mockFindMany } },
    }))
    vi.resetModules()
    const { loadStringConfigs } = await import('@/lib/poller-utils')
    const result = await loadStringConfigs('device-1')
    expect(result.unusedSet.size).toBe(0)
    expect(result.peerExcludedSet.size).toBe(0)
    expect(mockFindMany).toHaveBeenCalledOnce()
  })

  it('builds unusedSet from is_used:false rows (Phase A — empty PV ports)', async () => {
    mockFindMany = vi.fn().mockResolvedValue([
      { string_number: 13, is_used: false, exclude_from_peer_comparison: false },
      { string_number: 14, is_used: false, exclude_from_peer_comparison: false },
      { string_number: 1, is_used: true, exclude_from_peer_comparison: false },
    ])
    vi.doMock('@/lib/prisma', () => ({
      prisma: { string_configs: { findMany: mockFindMany } },
    }))
    vi.resetModules()
    const { loadStringConfigs } = await import('@/lib/poller-utils')
    const result = await loadStringConfigs('device-2')
    expect(result.unusedSet).toEqual(new Set([13, 14]))
    expect(result.peerExcludedSet.size).toBe(0)
  })

  it('builds peerExcludedSet from exclude_from_peer_comparison:true rows (Phase B — non-standard orientation)', async () => {
    mockFindMany = vi.fn().mockResolvedValue([
      { string_number: 7, is_used: true, exclude_from_peer_comparison: true },
      { string_number: 1, is_used: true, exclude_from_peer_comparison: false },
    ])
    vi.doMock('@/lib/prisma', () => ({
      prisma: { string_configs: { findMany: mockFindMany } },
    }))
    vi.resetModules()
    const { loadStringConfigs } = await import('@/lib/poller-utils')
    const result = await loadStringConfigs('device-3')
    expect(result.peerExcludedSet).toEqual(new Set([7]))
    expect(result.unusedSet.size).toBe(0)
  })

  it('separates unused vs peer-excluded — a string can be both (e.g. wall-mounted port that is also disconnected)', async () => {
    mockFindMany = vi.fn().mockResolvedValue([
      { string_number: 5, is_used: false, exclude_from_peer_comparison: true },
    ])
    vi.doMock('@/lib/prisma', () => ({
      prisma: { string_configs: { findMany: mockFindMany } },
    }))
    vi.resetModules()
    const { loadStringConfigs } = await import('@/lib/poller-utils')
    const result = await loadStringConfigs('device-4')
    expect(result.unusedSet.has(5)).toBe(true)
    expect(result.peerExcludedSet.has(5)).toBe(true)
  })
})

describe('fetchWithTimeout (pre-CSI: prevent indefinite hangs from any vendor socket)', () => {
  beforeAll(async () => {})

  it('resolves normally when fetch completes before timeout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWithTimeout } = await import('@/lib/poller-utils')
    const res = await fetchWithTimeout('https://example.com', {}, 1000)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const callOpts = fetchMock.mock.calls[0][1]
    expect(callOpts.signal).toBeInstanceOf(AbortSignal)
    vi.unstubAllGlobals()
  })

  it('aborts when timeout elapses before fetch resolves (vendor hangs the socket)', async () => {
    // Simulate a fetch that respects AbortSignal — when aborted, reject with AbortError
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err: any = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWithTimeout } = await import('@/lib/poller-utils')
    await expect(fetchWithTimeout('https://example.com', {}, 50)).rejects.toThrow(/aborted/i)
    vi.unstubAllGlobals()
  })

  it('clears the timer on success so it does not leak (verify no abort fires after resolution)', async () => {
    const abortListener = vi.fn()
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', abortListener)
      return Promise.resolve(new Response('{}'))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWithTimeout } = await import('@/lib/poller-utils')
    await fetchWithTimeout('https://example.com', {}, 100)
    // Wait past the timeout to confirm no abort fires
    await new Promise((r) => setTimeout(r, 150))
    expect(abortListener).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('processInBatches (Task #97 — bounded per-device concurrency)', () => {
  beforeAll(async () => {
    // outer beforeAll already loaded helpers
  })

  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const seen: number[] = []
    const { processInBatches } = await import('@/lib/poller-utils')
    await processInBatches(items, 3, async (n) => { seen.push(n) }, 'TEST')
    expect(seen.sort((a, b) => a - b)).toEqual(items)
  })

  it('respects the concurrency cap (verified by tracking peak in-flight)', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const cap = 4
    let inFlight = 0
    let peak = 0
    const { processInBatches } = await import('@/lib/poller-utils')
    await processInBatches(items, cap, async () => {
      inFlight++
      if (inFlight > peak) peak = inFlight
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    }, 'TEST')
    expect(peak).toBeLessThanOrEqual(cap)
    expect(peak).toBeGreaterThan(1) // confirm we are actually parallelising, not serial
  })

  it('continues processing remaining items when one rejects (Promise.allSettled isolation)', async () => {
    const processed: number[] = []
    const { processInBatches } = await import('@/lib/poller-utils')
    // Silence console.error noise in test output
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await processInBatches([1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 3) throw new Error('synthetic device-3 failure')
      processed.push(n)
    }, 'TEST')
    expect(processed.sort()).toEqual([1, 2, 4, 5])
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('no-ops on empty input', async () => {
    const { processInBatches } = await import('@/lib/poller-utils')
    const processor = vi.fn()
    await processInBatches([], 5, processor, 'TEST')
    expect(processor).not.toHaveBeenCalled()
  })

  it('handles items < concurrency without padding', async () => {
    const seen: string[] = []
    const { processInBatches } = await import('@/lib/poller-utils')
    await processInBatches(['a', 'b'], 10, async (s) => { seen.push(s) }, 'TEST')
    expect(seen.sort()).toEqual(['a', 'b'])
  })
})

describe('safeFloat', () => {
  it('returns parsed float for numeric input', () => {
    expect(safeFloat(42.5)).toBe(42.5)
    expect(safeFloat(0)).toBe(0)
  })

  it('parses numeric strings (Huawei pv1_u arrives as "650.5" per Developer Guide §4.1.4)', () => {
    expect(safeFloat('650.5')).toBe(650.5)
  })

  it('returns 0 for null (Huawei dataItemMap value can be null per devTypeId 1 schema)', () => {
    expect(safeFloat(null)).toBe(0)
  })

  it('returns 0 for undefined (string index out of range)', () => {
    expect(safeFloat(undefined)).toBe(0)
  })

  it('returns 0 for NaN', () => {
    expect(safeFloat(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(safeFloat(Infinity)).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(safeFloat('not-a-number')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(safeFloat('')).toBe(0)
  })
})
