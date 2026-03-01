import cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

let isPolling = false

async function pollAll() {
  const { pollHuawei } = await import('../lib/huawei-poller')
  const { pollSolis } = await import('../lib/solis-poller')
  const { pollGrowatt } = await import('../lib/growatt-poller')

  const results = await Promise.allSettled([
    pollHuawei(),
    pollSolis(),
    pollGrowatt(),
  ])

  results.forEach((r, i) => {
    const name = ['Huawei', 'Solis', 'Growatt'][i]
    if (r.status === 'rejected') console.error(`[${name}] Poll failed:`, r.reason)
    else console.log(`[${name}] Poll complete`)
  })
}

async function main() {
  console.log('[Poller] Starting multi-provider poller...')
  console.log(`[Poller] Database URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Huawei API URL: ${process.env.HUAWEI_API_URL || 'NOT SET'}`)
  console.log(`[Poller] Solis API ID: ${process.env.SOLIS_API_ID ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Growatt API Token: ${process.env.GROWATT_API_TOKEN ? 'SET' : 'NOT SET'}`)

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

  // Run data retention cleanup daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Poller] Running data retention cleanup...')
    try {
      const { prisma } = await import('../lib/prisma')
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      const result = await prisma.string_measurements.deleteMany({
        where: { timestamp: { lt: cutoff } },
      })
      console.log(`[Poller] Deleted ${result.count} old string_measurements (older than 30 days)`)
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
