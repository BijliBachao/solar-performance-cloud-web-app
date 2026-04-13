import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createErrorResponse, ApiAuthError } from '@/lib/api-auth'
import { requirePlantAccess } from '@/lib/api-access'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const userContext = await getUserFromRequest()
    await requirePlantAccess(userContext, params.code)

    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'hourly'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const deviceId = searchParams.get('device_id')

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const toDate = to ? new Date(to) : new Date()

    const where: any = {
      plant_id: params.code,
    }
    if (deviceId) where.device_id = deviceId

    if (period === 'hourly') {
      where.hour = { gte: fromDate, lte: toDate }
      const data = await prisma.string_hourly.findMany({
        where,
        orderBy: { hour: 'asc' },
      })
      return NextResponse.json({ period: 'hourly', data })
    } else {
      where.date = { gte: fromDate, lte: toDate }
      const data = await prisma.string_daily.findMany({
        where,
        orderBy: { date: 'asc' },
      })
      return NextResponse.json({ period: 'daily', data })
    }
  } catch (error) {
    if (error instanceof ApiAuthError) return createErrorResponse(error)
    console.error('[Plant History GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
