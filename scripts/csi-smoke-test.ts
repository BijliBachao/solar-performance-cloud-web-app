/**
 * CSI smoke test — standalone diagnostic. No DB, no Prisma.
 *
 * Verifies the lib/csi-client.ts assumptions against a real sandbox response:
 *   - auth response (accessToken, uid)
 *   - plant list (first page)
 *   - device list for the first plant
 *   - device realtime data for the first inverter — THE GOLD DUMP for
 *     fieldCode taxonomy verification (DV/DC/DP regex in parseRealData)
 *   - active alerts
 *   - per-call timing (informs whether 30s fetchWithTimeout default is enough)
 *
 * Saves all raw responses to /tmp/csi-api-test-results-<timestamp>.json so
 * we never accidentally commit live API data into the repo.
 *
 * Run from the project root:
 *   CSI_APP_ID="..." CSI_APP_SECRET="..." \
 *     npx tsx scripts/csi-smoke-test.ts 2>&1 | tee /tmp/csi-smoke.log
 *
 * Reads CSI_APP_ID / CSI_APP_SECRET / CSI_API_URL from env. Default URL is
 * the documented test sandbox. Credentials are never read from .env or any
 * file — pass them via env vars only.
 */

import { writeFileSync } from 'fs'

const BASE = process.env.CSI_API_URL || 'https://sep-api.csisolar.com'
const APP_ID = process.env.CSI_APP_ID
const APP_SECRET = process.env.CSI_APP_SECRET

if (!APP_ID || !APP_SECRET) {
  console.error('✗ Set CSI_APP_ID and CSI_APP_SECRET env vars before running')
  process.exit(1)
}

interface Timing { label: string; ms: number; ok: boolean; status: number; bodyBytes: number }
const timings: Timing[] = []

async function callJson<T = any>(label: string, url: string, init: RequestInit): Promise<T> {
  const start = Date.now()
  const res = await fetch(url, { ...init, headers: { 'Accept-Language': 'en-US', ...init.headers } })
  const text = await res.text()
  const ms = Date.now() - start
  timings.push({ label, ms, ok: res.ok, status: res.status, bodyBytes: text.length })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${label}: ${text.substring(0, 300)}`)
  }
  let json: any
  try { json = JSON.parse(text) }
  catch { throw new Error(`Unparseable response from ${label}: ${text.substring(0, 300)}`) }

  if (json.code !== 200) {
    throw new Error(`API error on ${label}: code=${json.code} msg=${json.msg || ''}`)
  }
  return json.data as T
}

const dump: Record<string, any> = {}

async function main() {
  console.log('━━━ CSI smoke test ━━━')
  console.log(`Base URL: ${BASE}`)
  console.log(`App ID:   ${APP_ID}`)
  console.log()

  // 1. Authenticate
  console.log('→ POST /open-api/user/authority')
  const auth = await callJson<{ accessToken: string; uid: string }>(
    'authenticate',
    `${BASE}/open-api/user/authority`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: APP_ID, appSecret: APP_SECRET }),
    },
  )
  dump.auth = auth
  console.log(`  ✓ accessToken received (uid=${auth.uid}, token len=${auth.accessToken?.length})`)
  console.log()

  const authedHeaders = { Authorization: `Bearer ${auth.accessToken}` }

  // 2. Plant list (first page)
  console.log('→ GET /open-api/plant/pageV2?page=1&size=20')
  const plants = await callJson<{ totalCount: number; totalPages: number; records: any[] }>(
    'plantList',
    `${BASE}/open-api/plant/pageV2?page=1&size=20`,
    { method: 'GET', headers: authedHeaders },
  )
  dump.plants = plants
  console.log(`  ✓ totalCount=${plants.totalCount}, returned ${plants.records?.length || 0} on page 1`)
  if (plants.records?.[0]) {
    const p = plants.records[0]
    console.log(`  first plant: id=${p.plantId} name="${p.plantName}" cap=${p.capacity}kW status=${p.status}`)
  }
  console.log()

  if (!plants.records || plants.records.length === 0) {
    console.log('⚠ No plants visible to this account on sandbox. Stopping at plant list.')
    finish()
    return
  }

  const firstPlantId = String(plants.records[0].plantId)

  // 3. Plant → device list. Verified 2026-05-07: /plant/devices/{id} returns
  // [], the working endpoint is /device/page?plantId=. Response shape can be
  // either a paged envelope {records,...} or a bare flat array — handle both.
  console.log(`→ GET /open-api/device/page?plantId=${firstPlantId}&page=1&size=100`)
  const devicesData = await callJson<any>(
    'plantDevices',
    `${BASE}/open-api/device/page?plantId=${encodeURIComponent(firstPlantId)}&page=1&size=100`,
    { method: 'GET', headers: authedHeaders },
  )
  dump.devices = devicesData
  const allDevices: any[] = Array.isArray(devicesData)
    ? devicesData
    : (devicesData?.records || [])
  const inverters = allDevices.filter((d: any) => d?.deviceType === 2)
  console.log(`  ✓ ${allDevices.length} total devices, ${inverters.length} inverters`)
  if (inverters[0]) {
    const i = inverters[0]
    console.log(`  first inverter: sn=${i.deviceSn} type=${i.deviceType} type2=${i.deviceType2} status=${i.status}`)
  }
  console.log()

  if (inverters.length === 0) {
    console.log('⚠ No inverters under this plant. Stopping at device list.')
    finish()
    return
  }

  // 4. Plant realtime
  console.log(`→ GET /open-api/plant/realtime?plantId=${firstPlantId}`)
  const realtime = await callJson<any[]>(
    'plantRealtime',
    `${BASE}/open-api/plant/realtime?plantId=${firstPlantId}`,
    { method: 'GET', headers: authedHeaders },
  )
  dump.plantRealtime = realtime
  if (realtime[0]) {
    console.log(`  ✓ power=${realtime[0].power}W dayElectric=${realtime[0].dayElectric}kWh ts=${realtime[0].timestamp}`)
  } else {
    console.log('  ⚠ realtime returned empty array')
  }
  console.log()

  // 5. THE GOLD DUMP — first inverter realData
  const firstSn = inverters[0].deviceSn
  console.log(`→ GET /open-api/device/data?deviceSnStr=${firstSn}`)
  const deviceData = await callJson<any[]>(
    'deviceData',
    `${BASE}/open-api/device/data?deviceSnStr=${encodeURIComponent(firstSn)}`,
    { method: 'GET', headers: authedHeaders },
  )
  dump.deviceData = deviceData
  if (deviceData[0]) {
    const dd = deviceData[0]
    const realData = Array.isArray(dd.realData) ? dd.realData : []
    console.log(`  ✓ realData rows: ${realData.length}`)
    console.log()
    console.log('  ━━━ realData sample (first 20 rows) ━━━')
    for (const row of realData.slice(0, 20)) {
      const dataPreview = JSON.stringify(row.data).substring(0, 60)
      console.log(`    ${row.fieldCode?.padEnd(12)} | ${(row.fieldName || '').substring(0, 30).padEnd(30)} | ${row.fieldUnitName?.padEnd(8) || '—'.padEnd(8)} | data=${dataPreview}`)
    }
    if (realData.length > 20) console.log(`    ... and ${realData.length - 20} more`)
    console.log()

    // Verify the live taxonomy still matches lib/csi-client.ts assumptions
    // (verified 2026-05-07: lowercase dv/dc/dp + elec_day, scalar data).
    const stringRows = realData.filter((r: any) =>
      /^dv\d+$|^dc\d+$|^dp\d+$/.test(r.fieldCode || '')
    )
    const dailyEnergyRow = realData.find((r: any) => r.fieldCode === 'elec_day')
    console.log(`  → dv/dc/dp fieldCodes matched (our parser): ${stringRows.length}`)
    console.log(`  → elec_day present: ${dailyEnergyRow ? `yes (data=${JSON.stringify(dailyEnergyRow.data)})` : 'NO'}`)
    if (stringRows.length === 0 && realData.length > 0) {
      console.log('  ⚠⚠⚠  No dv/dc/dp fieldCodes found! Parser regex may need updating.')
      console.log('  Likely candidates from realData:')
      const candidates = realData.filter((r: any) => {
        const name = (r.fieldName || '').toLowerCase()
        const code = String(r.fieldCode || '')
        return name.includes('pv') || name.includes('string') || name.includes('voltage') || name.includes('current') || /\d/.test(code)
      })
      for (const c of candidates.slice(0, 15)) {
        console.log(`    candidate: code=${c.fieldCode} name="${c.fieldName}" unit=${c.fieldUnitName}`)
      }
    } else if (stringRows[0]) {
      console.log(`  ✓ First match: code=${stringRows[0].fieldCode} data=${JSON.stringify(stringRows[0].data)}`)
    }
  } else {
    console.log('  ⚠ deviceData returned empty array')
  }
  console.log()

  // 6. Active alerts
  console.log(`→ GET /open-api/alert/pageV2?page=1&size=20`)
  try {
    const alerts = await callJson<{ totalCount: number; totalPages: number; records: any[] }>(
      'activeAlerts',
      `${BASE}/open-api/alert/pageV2?page=1&size=20`,
      { method: 'GET', headers: authedHeaders },
    )
    dump.alerts = alerts
    console.log(`  ✓ totalCount=${alerts.totalCount}, ${alerts.records?.length || 0} on page 1`)
    if (alerts.records?.[0]) {
      const a = alerts.records[0]
      console.log(`  first alert: id=${a.alertId} code=${a.alertCode} level=${a.alertLevel}/${a.alertLevelLabel} status=${a.status}/${a.statusLabel}`)
    }
  } catch (err: any) {
    console.log(`  ⚠ alerts call failed: ${err.message}`)
    dump.alertsError = err.message
  }
  console.log()

  finish()
}

function finish() {
  console.log('━━━ Timing summary ━━━')
  for (const t of timings) {
    console.log(`  ${t.ok ? '✓' : '✗'} ${t.label.padEnd(20)} ${t.status} · ${t.ms.toString().padStart(5)}ms · ${t.bodyBytes}B`)
  }
  const total = timings.reduce((acc, t) => acc + t.ms, 0)
  console.log(`  total: ${total}ms`)
  console.log()

  // Write to /tmp deliberately so live API data never accidentally lands in
  // the repo. If you need to keep a fixture, copy from /tmp manually after
  // reviewing for sensitive content (plant names, customer SNs, etc.).
  const outPath = `/tmp/csi-api-test-results-${Date.now()}.json`
  writeFileSync(outPath, JSON.stringify({ timings, ...dump }, null, 2))
  console.log(`→ Saved raw responses to ${outPath}`)
  console.log()
  console.log('Inspect that file to confirm:')
  console.log('  • realData[].fieldCode taxonomy (DV/DC/DP regex assumption in csi-client.ts parseRealData)')
  console.log('  • realData[].data shape (extractRealDataValue assumes {value: ...} or {data: ...} or {val: ...})')
  console.log('  • status numeric encoding for plants and devices (mapCsiHealthState assumes 1=healthy)')
  console.log('  • alertLevel encoding (mapCsiSeverity assumes 3=CRITICAL, 2=WARNING)')
}

main().catch((err) => {
  console.error()
  console.error('✗ smoke test failed:', err.message)
  console.error()
  finish()
  process.exit(1)
})
