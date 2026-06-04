import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'
import { deviceConnectivity } from '@/lib/connectivity'
import { clampToFleetCoords } from '@/lib/string-health'
import { isDaylight } from '@/lib/solar-geometry'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const plant = await prisma.plants.findUnique({
      where: { id: params.code },
      include: {
        devices: {
          select: {
            id: true,
            device_name: true,
            device_type_id: true,
            provider: true,
            model: true,
            max_strings: true,
            last_synced: true,
            vendor_last_data_at: true,
            reading_changed_at: true,
            last_seen_at: true,
          },
        },
      },
    })

    if (!plant) {
      return NextResponse.json({ error: 'Plant not found' }, { status: 404 })
    }

    // Most recent string measurement timestamp (updated every ~5 min by poller)
    const latestMeasurement = await prisma.string_measurements.findFirst({
      where: { plant_id: params.code },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    })

    // Per-device last-write time = MAX(string_measurements.timestamp). Combined
    // with the freshness columns + the sun gate, this yields each inverter's
    // connectivity status (live/frozen/offline/idle) for the plant UI.
    const lastWriteRows = await prisma.string_measurements.groupBy({
      by: ['device_id'],
      where: { plant_id: params.code },
      _max: { timestamp: true },
    })
    const lastWriteByDevice = new Map(
      lastWriteRows.map((r) => [r.device_id, r._max.timestamp?.getTime() ?? null]),
    )
    const now = Date.now()
    // Coords clamped to the Pakistan bounding box (fleet default for missing
    // OR garbage values like vendor-default Beijing) — garbage coords would
    // mis-gate the sun calc and flag sleeping inverters offline at night.
    const clamped = clampToFleetCoords(plant.latitude, plant.longitude)
    const sunUp = isDaylight(clamped.lat, clamped.lng, new Date(now))
    const devicesWithConnectivity = plant.devices.map((d) => {
      // "Last contact" = newest of last_seen_at (poll saw the device even when
      // the DQ write gate skipped a duplicate replay) and MAX(measurement ts).
      // Keeps frozen (seen, values stuck) distinguishable from offline (gone).
      const seenMs = d.last_seen_at?.getTime() ?? null
      const writeMs = lastWriteByDevice.get(d.id) ?? null
      const lastContactMs = seenMs == null && writeMs == null ? null : Math.max(seenMs ?? 0, writeMs ?? 0)
      const conn = deviceConnectivity(
        { vendor_last_data_at: d.vendor_last_data_at, reading_changed_at: d.reading_changed_at },
        lastContactMs,
        sunUp,
        now,
      )
      return { ...d, connectivity: conn.status, effective_fresh_at: conn.effectiveFreshAt }
    })

    return NextResponse.json({
      ...plant,
      devices: devicesWithConnectivity,
      last_data_at: latestMeasurement?.timestamp || null,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plant Detail GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
