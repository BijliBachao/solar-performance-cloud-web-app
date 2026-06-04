import { describe, it, expect } from 'vitest'
import {
  rollupPlantStatus,
  PLANT_OP_LABEL,
  PLANT_HEALTH_HEALTHY,
  PLANT_HEALTH_FAULTY,
  PLANT_HEALTH_DISCONNECTED,
  type ConnectivityStatus,
} from '../string-health'
import { statusKeyFromPlantOp } from '../design-tokens'

// Status Unification (2026-06-05): ONE plant-status taxonomy from the
// per-device connectivity engine. These tests pin the rollup contract that
// every screen (admin plants, plant page, dashboard, NOC rollups) renders.

const d = (...s: ConnectivityStatus[]) => s

describe('rollupPlantStatus', () => {
  it('no devices → offline', () => {
    expect(rollupPlantStatus([], PLANT_HEALTH_HEALTHY)).toBe('offline')
  })

  it('sleeping fleet at night → idle (NOT offline — the /admin/plants regression)', () => {
    expect(rollupPlantStatus(d('idle', 'idle', 'idle'), PLANT_HEALTH_HEALTHY)).toBe('idle')
  })

  it('all live → live; mixed live+idle (dawn partial wake) → live', () => {
    expect(rollupPlantStatus(d('live', 'live'), PLANT_HEALTH_HEALTHY)).toBe('live')
    expect(rollupPlantStatus(d('live', 'idle'), PLANT_HEALTH_HEALTHY)).toBe('live')
  })

  it('worst-first: any frozen (no offline) → frozen; any offline → offline even with live peers', () => {
    expect(rollupPlantStatus(d('live', 'frozen'), PLANT_HEALTH_HEALTHY)).toBe('frozen')
    expect(rollupPlantStatus(d('live', 'live', 'offline'), PLANT_HEALTH_HEALTHY)).toBe('offline')
    expect(rollupPlantStatus(d('frozen', 'offline'), PLANT_HEALTH_HEALTHY)).toBe('offline')
  })

  it('faulty overlay requires fresh contact (live or frozen)', () => {
    expect(rollupPlantStatus(d('live', 'live'), PLANT_HEALTH_FAULTY)).toBe('faulty')
    expect(rollupPlantStatus(d('frozen'), PLANT_HEALTH_FAULTY)).toBe('faulty')
    // vendor says faulty but nothing fresh to verify → connectivity truth wins
    expect(rollupPlantStatus(d('idle', 'idle'), PLANT_HEALTH_FAULTY)).toBe('idle')
    expect(rollupPlantStatus(d('offline'), PLANT_HEALTH_FAULTY)).toBe('offline')
  })

  it('vendor DISCONNECTED never overrides our connectivity (vendors mark sleeping plants offline at night)', () => {
    expect(rollupPlantStatus(d('idle'), PLANT_HEALTH_DISCONNECTED)).toBe('idle')
    expect(rollupPlantStatus(d('live'), PLANT_HEALTH_DISCONNECTED)).toBe('live')
    expect(rollupPlantStatus(d('live'), null)).toBe('live')
  })
})

describe('one vocabulary + one style mapping', () => {
  it('every status has a label and a StatusKey', () => {
    const all: Array<'live' | 'idle' | 'frozen' | 'offline' | 'faulty'> =
      ['live', 'idle', 'frozen', 'offline', 'faulty']
    for (const s of all) {
      expect(PLANT_OP_LABEL[s]).toBeTruthy()
      expect(statusKeyFromPlantOp(s)).toBeTruthy()
    }
    expect(PLANT_OP_LABEL.idle).toBe('Idle · night')
    expect(PLANT_OP_LABEL.frozen).toBe('Frozen feed')
    expect(statusKeyFromPlantOp('faulty')).toBe('critical')
    expect(statusKeyFromPlantOp('live')).toBe('healthy')
  })
})
