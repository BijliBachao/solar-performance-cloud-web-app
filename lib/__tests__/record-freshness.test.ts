import { describe, it, expect, vi, beforeEach } from 'vitest'

// poller-utils imports prisma; stub it so we can assert the update calls.
vi.mock('@/lib/prisma', () => ({ prisma: { devices: { update: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { recordDeviceFreshness, recordDeviceSeen } from '../poller-utils'
import { readingSignature } from '../string-health'

const strings = [{ string_number: 1, voltage: 600, current: 5, power: 3000 }]

beforeEach(() => {
  ;(prisma.devices.update as any).mockReset()
})

describe('recordDeviceFreshness', () => {
  it('sets reading_changed_at + sig when signature is new (no prior sig)', async () => {
    await recordDeviceFreshness('dev1', strings, null, null)
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'dev1' })
    expect(typeof arg.data.last_reading_sig).toBe('string')
    expect(arg.data.reading_changed_at).toBeInstanceOf(Date)
    expect(arg.data.last_reading_sig).toBe(readingSignature(strings))
  })

  it('ALWAYS stamps last_seen_at, even when signature unchanged and no vendor ts (frozen ≠ offline)', async () => {
    const sig = readingSignature(strings)
    await recordDeviceFreshness('dev1', strings, null, sig)
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.last_seen_at).toBeInstanceOf(Date)
    expect(arg.data.reading_changed_at).toBeUndefined()
    expect(arg.data.last_reading_sig).toBeUndefined()
    expect(arg.data.vendor_last_data_at).toBeUndefined()
  })

  it('updates vendor_last_data_at even when signature unchanged (no reading_changed_at)', async () => {
    const sig = readingSignature(strings)
    const vts = new Date('2026-06-02T10:00:00Z')
    await recordDeviceFreshness('dev1', strings, vts, sig)
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.vendor_last_data_at).toEqual(vts)
    expect(arg.data.last_seen_at).toBeInstanceOf(Date)
    expect(arg.data.reading_changed_at).toBeUndefined()
    expect(arg.data.last_reading_sig).toBeUndefined()
  })

  it('sets both vendor ts and reading change when sig is new AND vendor ts given', async () => {
    const vts = new Date('2026-06-02T10:00:00Z')
    await recordDeviceFreshness('dev1', strings, vts, 'oldsig')
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.vendor_last_data_at).toEqual(vts)
    expect(arg.data.reading_changed_at).toBeInstanceOf(Date)
    expect(arg.data.last_reading_sig).toBe(readingSignature(strings))
  })
})

describe('recordDeviceFreshness — future vendor ts rejection', () => {
  it('does not store a vendor ts beyond future clock-skew tolerance (sig still updates)', async () => {
    const farFuture = new Date(Date.now() + 113 * 60_000)
    await recordDeviceFreshness('dev1', strings, farFuture, 'oldsig')
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.vendor_last_data_at).toBeUndefined()
    expect(arg.data.reading_changed_at).toBeInstanceOf(Date)
  })
})

describe('recordDeviceSeen — skipped-write path (gated replay / stale feed)', () => {
  it('stamps last_seen_at + valid vendor ts, never touching the reading signature', async () => {
    const vts = new Date('2026-06-02T10:00:00Z')
    await recordDeviceSeen('dev1', vts)
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'dev1' })
    expect(arg.data.last_seen_at).toBeInstanceOf(Date)
    expect(arg.data.vendor_last_data_at).toEqual(vts)
    expect(arg.data.reading_changed_at).toBeUndefined()
    expect(arg.data.last_reading_sig).toBeUndefined()
  })

  it('rejects a future-skewed vendor ts but still stamps last_seen_at', async () => {
    const farFuture = new Date(Date.now() + 113 * 60_000)
    await recordDeviceSeen('dev1', farFuture)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.vendor_last_data_at).toBeUndefined()
    expect(arg.data.last_seen_at).toBeInstanceOf(Date)
  })

  it('null vendor ts → only last_seen_at', async () => {
    await recordDeviceSeen('dev1', null)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(Object.keys(arg.data)).toEqual(['last_seen_at'])
  })
})
