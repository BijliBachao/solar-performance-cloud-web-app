import cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

async function pollAll() {
  const { pollHuawei } = await import('../lib/huawei-poller')
  const { pollSolis } = await import('../lib/solis-poller')

  const results = await Promise.allSettled([
    pollHuawei(),
    pollSolis(),
  ])

  results.forEach((r, i) => {
    const name = ['Huawei', 'Solis'][i]
    if (r.status === 'rejected') console.error(`[${name}] Poll failed:`, r.reason)
    else console.log(`[${name}] Poll complete`)
  })
}

async function main() {
  console.log('[Poller] Starting multi-provider poller...')
  console.log(`[Poller] Database URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`)
  console.log(`[Poller] Huawei API URL: ${process.env.HUAWEI_API_URL || 'NOT SET'}`)
  console.log(`[Poller] Solis API ID: ${process.env.SOLIS_API_ID ? 'SET' : 'NOT SET'}`)

  // Run immediately on start
  try {
    await pollAll()
    console.log('[Poller] Initial poll complete')
  } catch (err) {
    console.error('[Poller] Initial poll failed:', err)
  }

  // Schedule every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[Poller] Running poll at ${new Date().toISOString()}`)
    try {
      await pollAll()
    } catch (err) {
      console.error('[Poller] Poll failed:', err)
    }
  })

  console.log('[Poller] Scheduled: every 5 minutes')
}

main().catch((err) => {
  console.error('[Poller] Fatal error:', err)
  process.exit(1)
})
