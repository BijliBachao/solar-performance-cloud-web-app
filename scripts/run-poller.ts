import cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

let isPolling = false

async function pollAll() {
  const { pollHuawei } = await import('../lib/huawei-poller')
  const { pollSolis } = await import('../lib/solis-poller')
  const { pollGrowatt } = await import('../lib/growatt-poller')
  const { pollSungrow } = await import('../lib/sungrow-poller')
  const { pollCsi } = await import('../lib/csi-poller')

  const cycleStart = Date.now()
  const results = await Promise.allSettled([
    pollHuawei(),
    pollSolis(),
    pollGrowatt(),
    pollSungrow(),
    pollCsi(),
  ])

  results.forEach((r, i) => {
    const name = ['Huawei', 'Solis', 'Growatt', 'Sungrow', 'CSI'][i]
    if (r.status === 'rejected') console.error(`[${name}] Poll failed:`, r.reason)
    else console.log(`[${name}] Poll complete`)
  })

  // Cycle-duration visibility: when this approaches the 5-min cron interval,
  // the isPolling guard starts SILENTLY skipping cycles (dropping data
  // resolution) — make that observable before it happens. (CQ audit #5.)
  const cycleSec = Math.round((Date.now() - cycleStart) / 1000)
  const level = cycleSec > 240 ? 'warn' : 'log'
  console[level](`[Poller] Cycle completed in ${cycleSec}s${cycleSec > 240 ? ' — approaching the 5-min interval; next cycle may be skipped' : ''}`)
}

async function main() {
  console.log('[Poller] Starting multi-provider poller...')
  console.log(`[Poller] Database URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Huawei API URL: ${process.env.HUAWEI_API_URL || 'NOT SET'}`)
  console.log(`[Poller] Solis API ID: ${process.env.SOLIS_API_ID ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Growatt API Token: ${process.env.GROWATT_API_TOKEN ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Sungrow App Key: ${process.env.SUNGROW_APP_KEY ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] CSI App ID:      ${process.env.CSI_APP_ID ? 'SET' : 'NOT SET'}`)

  // Run immediately on start
  try {
    await pollAll()
    console.log('[Poller] Initial poll complete')
  } catch (err) {
    console.error('[Poller] Initial poll failed:', err)
  }

  // Schedule every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (isPolling) {
      console.log('[Poller] Previous cycle still running, skipping')
      return
    }
    isPolling = true
    console.log(`[Poller] Running poll at ${new Date().toISOString()}`)
    try {
      await pollAll()
    } catch (err) {
      console.error('[Poller] Poll failed:', err)
    } finally {
      isPolling = false
    }
  })

  // Run data retention cleanup daily at 2:00 AM:
  //   - 30-day retention for raw string_measurements (high churn, cheap to drop)
  //   - 90-day retention for resolved vendor_alarms (keeps recent fault history
  //     for technician root-cause investigation; OPEN alarms never deleted)
  //   - Hourly/daily aggregates kept indefinitely for historical analysis
  cron.schedule('0 2 * * *', async () => {
    console.log('[Poller] Running data retention cleanup...')
    try {
      const { prisma } = await import('../lib/prisma')

      const measurementsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      console.log(`[Poller] Deleting string_measurements older than ${measurementsCutoff.toISOString()}`)
      const measurementsResult = await prisma.string_measurements.deleteMany({
        where: { timestamp: { lt: measurementsCutoff } },
      })
      console.log(`[Poller] Deleted ${measurementsResult.count} old string_measurements`)

      // Only prune RESOLVED vendor alarms — open ones stay regardless of age.
      const alarmsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      console.log(`[Poller] Deleting resolved vendor_alarms resolved before ${alarmsCutoff.toISOString()}`)
      const alarmsResult = await prisma.vendor_alarms.deleteMany({
        where: { resolved_at: { not: null, lt: alarmsCutoff } },
      })
      console.log(`[Poller] Deleted ${alarmsResult.count} old resolved vendor_alarms`)
    } catch (err) {
      console.error('[Poller] Data retention cleanup failed:', err)
    }
  })

  console.log('[Poller] Scheduled: every 5 minutes + daily cleanup at 2:00 AM')
}

main().catch((err) => {
  console.error('[Poller] Fatal error:', err)
  process.exit(1)
})
