import { describe, it, expect } from 'vitest'
import { prepSettledDayInputs, type HourlyCurrentRow } from '@/lib/settled-day-performance'

const h = (string_number: number, hour: number, avg_current: number): HourlyCurrentRow =>
  ({ string_number, hour: new Date(Date.UTC(2026, 5, 8, hour)), avg_current })

describe('prepSettledDayInputs', () => {
  it('builds repr_current (median over sun-up hours) and availability per string', () => {
    const rows: HourlyCurrentRow[] = [
      h(1, 10, 6), h(2, 10, 6), h(3, 10, 6), h(4, 10, 3),
      h(1, 11, 6), h(2, 11, 6), h(3, 11, 6), h(4, 11, 3),
      h(1, 12, 6), h(2, 12, 6), h(3, 12, 6), h(4, 12, 0), // string 4 dark this hour
    ]
    const { perfInputs, sunUpHours, availability } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(sunUpHours).toBe(3)
    expect(perfInputs.find(p => p.string_number === 1)!.repr_current).toBe(6)
    expect(perfInputs.find(p => p.string_number === 4)!.repr_current).toBe(3) // median(3,3,0)=3
    expect(availability.get(4)).toEqual({ producingHours: 2, sunUpHours: 3 })
    expect(availability.get(1)).toEqual({ producingHours: 3, sunUpHours: 3 })
  })
  it('too few sun-up hours → not scoreable → repr_current null', () => {
    const rows = [h(1, 10, 6), h(2, 10, 6)] // 1 sun-up hour < MIN(2)
    const { perfInputs, sunUpHours } = prepSettledDayInputs(rows, { unused: new Set(), peerExcluded: new Set() })
    expect(sunUpHours).toBe(1)
    expect(perfInputs.every(p => p.repr_current === null)).toBe(true)
  })
  it('drops unused strings; tags peer-excluded', () => {
    const rows = [h(1, 10, 6), h(2, 10, 6), h(3, 10, 6), h(1, 11, 6), h(2, 11, 6), h(3, 11, 6)]
    const { perfInputs } = prepSettledDayInputs(rows, { unused: new Set([3]), peerExcluded: new Set([2]) })
    expect(perfInputs.find(p => p.string_number === 3)).toBeUndefined()
    expect(perfInputs.find(p => p.string_number === 2)!.exclude_from_peer_comparison).toBe(true)
  })
})
