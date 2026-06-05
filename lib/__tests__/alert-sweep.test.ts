import { describe, it, expect, vi, beforeEach } from 'vitest'

// sweepAlertsOnDarkDevices — found live 2026-06-05 06:05 PKT: ~96 zombie
// dusk-storm alerts on Ali Enterprises (offline since 20:10 the previous
// evening). An OFFLINE device gets no poller cycle, so its open alerts could
// never resolve. The sweep closes that gap once per pollAll() cycle.

vi.mock('@/lib/prisma', () => ({
  prisma: { alerts: { updateMany: vi.fn() } },
}))

const mockLoadFleetConnectivity = vi.fn()
vi.mock('@/lib/donut-data-loader', () => ({
  loadFleetConnectivity: (...args: unknown[]) => mockLoadFleetConnectivity(...args),
}))

import { prisma } from '@/lib/prisma'
import { sweepAlertsOnDarkDevices } from '../poller-utils'

const mockPrisma = prisma as unknown as {
  alerts: { updateMany: ReturnType<typeof vi.fn> }
}

const dev = (deviceId: string, status: string) => ({
  deviceId, status,
  plantCode: 'P1', plantName: 'Plant', inverterName: 'INV', provider: 'huawei',
  effectiveFreshAt: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.alerts.updateMany.mockResolvedValue({ count: 0 })
})

describe('sweepAlertsOnDarkDevices', () => {
  it('resolves open alerts ONLY for offline + frozen devices, tagged as system sweep', async () => {
    mockLoadFleetConnectivity.mockResolvedValue({
      counts: { live: 1, frozen: 1, offline: 2, idle: 1 },
      devices: [
        dev('d-live', 'live'),
        dev('d-idle', 'idle'),
        dev('d-frozen', 'frozen'),
        dev('d-off-1', 'offline'),
        dev('d-off-2', 'offline'),
      ],
    })
    mockPrisma.alerts.updateMany.mockResolvedValue({ count: 96 })

    const n = await sweepAlertsOnDarkDevices()

    expect(n).toBe(96)
    expect(mockPrisma.alerts.updateMany).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.alerts.updateMany.mock.calls[0][0]
    expect(arg.where.device_id.in.sort()).toEqual(['d-frozen', 'd-off-1', 'd-off-2'])
    expect(arg.where.resolved_at).toBeNull()
    expect(arg.data.resolved_at).toBeInstanceOf(Date)
    expect(arg.data.resolved_by).toBe('system:dark-feed-sweep')
  })

  it('idle (night) devices are never swept — alerts persist until dawn re-evaluation', async () => {
    mockLoadFleetConnectivity.mockResolvedValue({
      counts: { live: 0, frozen: 0, offline: 0, idle: 3 },
      devices: [dev('d1', 'idle'), dev('d2', 'idle'), dev('d3', 'idle')],
    })
    const n = await sweepAlertsOnDarkDevices()
    expect(n).toBe(0)
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()
  })

  it('all-live fleet → no DB write at all', async () => {
    mockLoadFleetConnectivity.mockResolvedValue({
      counts: { live: 2, frozen: 0, offline: 0, idle: 0 },
      devices: [dev('d1', 'live'), dev('d2', 'live')],
    })
    const n = await sweepAlertsOnDarkDevices()
    expect(n).toBe(0)
    expect(mockPrisma.alerts.updateMany).not.toHaveBeenCalled()
  })
})
