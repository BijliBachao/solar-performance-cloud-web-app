import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireOrganization, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { prepSettledDayInputs, type HourlyCurrentRow } from '@/lib/settled-day-performance'
import { scoreStringPerformance, computeOperatingAvailability } from '@/lib/string-performance'

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserFromRequest()
    requireOrganization(userContext)
    const sp = request.nextUrl.searchParams
    const deviceId = sp.get('device_id')
    const snRaw = sp.get('string_number')
    const stringNumber = Number(snRaw)
    const date = sp.get('date')
    if (!deviceId || !date || snRaw === null || !Number.isFinite(stringNumber) || !Number.isInteger(stringNumber) || stringNumber <= 0) {
      return NextResponse.json({ error: 'device_id, string_number, date required' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    const startUtc = new Date(`${date}T00:00:00+05:00`)
    if (Number.isNaN(startUtc.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    const assignments = await prisma.plant_assignments.findMany({
      where: { organization_id: userContext.organizationId! }, select: { plant_id: true },
    })
    const device = await prisma.devices.findFirst({
      where: { id: deviceId, plant_id: { in: assignments.map(a => a.plant_id) } },
      select: { id: true, device_name: true },
    })
    if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const endUtc = new Date(startUtc.getTime() + 86_400_000)
    const [hourly, cfgRows] = await Promise.all([
      prisma.string_hourly.findMany({
        where: { device_id: deviceId, hour: { gte: startUtc, lt: endUtc } },
        select: { string_number: true, hour: true, avg_current: true }, orderBy: { hour: 'asc' },
      }),
      prisma.string_configs.findMany({
        where: { device_id: deviceId }, select: { string_number: true, is_used: true, exclude_from_peer_comparison: true },
      }),
    ])
    const rows: HourlyCurrentRow[] = hourly.map(r => ({ string_number: r.string_number, hour: r.hour, avg_current: r.avg_current ? Number(r.avg_current) : 0 }))
    const unused = new Set(cfgRows.filter(c => c.is_used === false).map(c => c.string_number))
    const peerExcluded = new Set(cfgRows.filter(c => c.exclude_from_peer_comparison).map(c => c.string_number))

    const { perfInputs, availability } = prepSettledDayInputs(rows, { unused, peerExcluded })
    const scored = scoreStringPerformance(perfInputs)
    const me = scored.find(s => s.string_number === stringNumber)
    const av = availability.get(stringNumber)

    return NextResponse.json({
      device_id: deviceId, device_name: device.device_name, string_number: stringNumber, date,
      status: me?.status ?? 'no_data',
      performance: me?.performance ?? null,
      repr_current: perfInputs.find(p => p.string_number === stringNumber)?.repr_current ?? null,
      peer_median_current: me?.peer_median_current ?? null,
      peers: perfInputs
        .filter(p => p.is_used && !p.exclude_from_peer_comparison && p.repr_current != null)
        .map(p => ({ string_number: p.string_number, repr_current: p.repr_current }))
        .sort((a, b) => (a.repr_current as number) - (b.repr_current as number)),
      hourly: rows.filter(r => r.string_number === stringNumber).map(r => ({ hour: r.hour, avg_current: r.avg_current })),
      availability: av ? { ...av, pct: computeOperatingAvailability(av.producingHours, av.sunUpHours) } : null,
    })
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Analysis String-Cell]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
