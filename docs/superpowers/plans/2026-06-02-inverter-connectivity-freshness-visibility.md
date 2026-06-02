# Inverter Connectivity & Data-Freshness Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-inverter Live/Frozen/Offline/Idle status + "data last received" on the plant page and a NOC connectivity donut, so a frozen feed (like CSI on 2026-05-25) is visible to any operator.

**Architecture:** Two persisted per-device signals — the vendor's own data-time (`vendor_last_data_at`, CSI/Solis/Growatt) and a value-change marker (`reading_changed_at` + `last_reading_sig`, all 5 providers). A pure `classifyConnectivity()` in `lib/string-health.ts` combines them with the existing sun-elevation gate. Pollers set the signals each cycle; the plant API + NOC API expose computed connectivity.

**Tech Stack:** Next.js 14, Prisma/PostgreSQL, Vitest. Spec: `docs/superpowers/specs/2026-06-02-inverter-connectivity-freshness-visibility-design.md`.

**Key references (verified 2026-06-02):**
- `lib/string-health.ts`: `VENDOR_FEED_STALE_MS` (2 h), `STALE_MS` (15 min) already exist.
- `lib/solar-geometry.ts`: `isDaylight(latDeg, lngDeg, date)` (line 98), `solarElevationDeg`, `DAYLIGHT_MIN_ELEVATION_DEG=3`.
- Vendor fields: CSI `data.lastReportTime`; Solis `detail.dataTimestamp` (ms); Growatt `deviceData.time` (parse as PKT `+05:00`); Huawei/Sungrow = none.
- `/api/plants/[code]/route.ts` already returns `last_data_at` from `MAX(string_measurements.timestamp)`.

---

### Task 1: Schema — add freshness columns to `devices`

**Files:**
- Modify: `prisma/schema.prisma` (model `devices`)

- [ ] **Step 1: Add columns**

In `model devices`, after `last_synced`:
```prisma
  vendor_last_data_at  DateTime?
  reading_changed_at   DateTime?
  last_reading_sig     String?   @db.VarChar(64)
```

- [ ] **Step 2: Generate client + push (local dev DB)**

Run: `npx prisma generate`
Then (prod handled at deploy via `npx prisma db push`): verify locally `npx prisma validate` → "schema is valid".

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add device freshness columns (vendor_last_data_at, reading_changed_at, last_reading_sig)"
```

---

### Task 2: Pure helpers — `readingSignature` + `classifyConnectivity`

**Files:**
- Modify: `lib/string-health.ts`
- Test: `lib/__tests__/connectivity.test.ts` (create)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { readingSignature, classifyConnectivity, VENDOR_FEED_STALE_MS, STALE_MS } from '../string-health'

const NOW = new Date('2026-06-02T11:00:00Z').getTime()
const minsAgo = (m: number) => NOW - m * 60_000

describe('readingSignature', () => {
  const a = [{ string_number: 1, voltage: 600, current: 5, power: 3000 }]
  it('is stable for identical readings', () => {
    expect(readingSignature(a)).toBe(readingSignature([{ ...a[0] }]))
  })
  it('is order-independent (sorted by string_number)', () => {
    const two = [
      { string_number: 2, voltage: 1, current: 1, power: 1 },
      { string_number: 1, voltage: 2, current: 2, power: 2 },
    ]
    expect(readingSignature(two)).toBe(readingSignature([...two].reverse()))
  })
  it('changes when any V/I/P changes', () => {
    expect(readingSignature(a)).not.toBe(
      readingSignature([{ string_number: 1, voltage: 600, current: 5, power: 3001 }]),
    )
  })
})

describe('classifyConnectivity', () => {
  it('idle at night regardless of data', () => {
    expect(classifyConnectivity(minsAgo(1), minsAgo(1), false, NOW)).toBe('idle')
    expect(classifyConnectivity(null, null, false, NOW)).toBe('idle')
  })
  it('live when fresh data within 2h (day)', () => {
    expect(classifyConnectivity(minsAgo(5), minsAgo(5), true, NOW)).toBe('live')
    expect(classifyConnectivity(minsAgo(119), minsAgo(1), true, NOW)).toBe('live')
  })
  it('frozen: stale data (>=2h) but still writing rows (<15m)', () => {
    expect(classifyConnectivity(minsAgo(125), minsAgo(3), true, NOW)).toBe('frozen')
  })
  it('offline: stale data and not writing rows (>15m)', () => {
    expect(classifyConnectivity(minsAgo(125), minsAgo(40), true, NOW)).toBe('offline')
    expect(classifyConnectivity(null, null, true, NOW)).toBe('offline')
  })
  it('2h boundary is live (strict <)', () => {
    expect(classifyConnectivity(NOW - VENDOR_FEED_STALE_MS, minsAgo(1), true, NOW)).toBe('live')
    expect(classifyConnectivity(NOW - VENDOR_FEED_STALE_MS - 1, minsAgo(1), true, NOW)).toBe('frozen')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run lib/__tests__/connectivity.test.ts`
Expected: FAIL ("readingSignature is not a function").

- [ ] **Step 3: Implement in `lib/string-health.ts`**

Add at top (with other imports): `import { createHash } from 'crypto'`. Then near `classifyVendorFeed`:
```ts
export type ConnectivityStatus = 'live' | 'frozen' | 'offline' | 'idle'

/** Stable, order-independent signature of a device's strings. Identical readings
 *  → identical signature; any V/I/P change → different signature. Restart-safe
 *  when persisted to devices.last_reading_sig. */
export function readingSignature(
  strings: { string_number: number; voltage: number; current: number; power: number }[],
): string {
  const body = [...strings]
    .sort((a, b) => a.string_number - b.string_number)
    .map((s) => `${s.string_number}:${s.voltage.toFixed(2)}:${s.current.toFixed(3)}:${s.power.toFixed(2)}`)
    .join('|')
  return createHash('sha1').update(body).digest('hex')
}

/** Inverter connectivity. effectiveFreshAtMs = newest of (vendor_last_data_at,
 *  reading_changed_at); lastWriteAtMs = MAX(string_measurements.timestamp). */
export function classifyConnectivity(
  effectiveFreshAtMs: number | null,
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
): ConnectivityStatus {
  if (!sunUp) return 'idle'
  if (effectiveFreshAtMs != null && nowMs - effectiveFreshAtMs < VENDOR_FEED_STALE_MS) return 'live'
  if (lastWriteAtMs != null && nowMs - lastWriteAtMs < STALE_MS) return 'frozen'
  return 'offline'
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run lib/__tests__/connectivity.test.ts` → PASS.
Run: `bash scripts/validate-centralized.sh` → 20/20.

- [ ] **Step 5: Commit**
```bash
git add lib/string-health.ts lib/__tests__/connectivity.test.ts
git commit -m "feat(connectivity): readingSignature + classifyConnectivity pure helpers"
```

---

### Task 3: Shared poller helper — `recordDeviceFreshness`

Writes both signals with at most one `devices.update`. Skips the update entirely when nothing changed (no churn for a frozen feed except the first stall cycle).

**Files:**
- Modify: `lib/poller-utils.ts`
- Test: `lib/__tests__/record-freshness.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: { devices: { update: vi.fn() } } }))
import { prisma } from '@/lib/prisma'
import { recordDeviceFreshness } from '../poller-utils'

const strings = [{ string_number: 1, voltage: 600, current: 5, power: 3000 }]

beforeEach(() => { (prisma.devices.update as any).mockReset() })

describe('recordDeviceFreshness', () => {
  it('sets reading_changed_at + sig when signature is new', async () => {
    await recordDeviceFreshness('dev1', strings, null, null) // no prior sig
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'dev1' })
    expect(arg.data.last_reading_sig).toBeTypeOf('string')
    expect(arg.data.reading_changed_at).toBeInstanceOf(Date)
  })
  it('does NOT update reading_changed_at when signature unchanged and no vendor ts', async () => {
    const { readingSignature } = await import('../string-health')
    const sig = readingSignature(strings)
    await recordDeviceFreshness('dev1', strings, null, sig)
    expect(prisma.devices.update).not.toHaveBeenCalled()
  })
  it('updates vendor_last_data_at even when signature unchanged', async () => {
    const { readingSignature } = await import('../string-health')
    const sig = readingSignature(strings)
    const vts = new Date('2026-06-02T10:00:00Z')
    await recordDeviceFreshness('dev1', strings, vts, sig)
    expect(prisma.devices.update).toHaveBeenCalledTimes(1)
    const arg = (prisma.devices.update as any).mock.calls[0][0]
    expect(arg.data.vendor_last_data_at).toEqual(vts)
    expect(arg.data.reading_changed_at).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run lib/__tests__/record-freshness.test.ts`
Expected: FAIL ("recordDeviceFreshness is not a function").

- [ ] **Step 3: Implement in `lib/poller-utils.ts`**

Add import: `import { readingSignature } from '@/lib/string-health'`. Then:
```ts
/**
 * Persist per-device freshness signals. Computes the reading signature and,
 * if it changed vs prevSig, stamps reading_changed_at=now + stores the new sig.
 * Always stores vendor_last_data_at when provided. Issues at most ONE
 * devices.update, and none when nothing changed (frozen feed → no churn).
 *
 * @param prevSig  the device's stored last_reading_sig (caller passes it in to
 *                 avoid an extra read — pollers already select the device row).
 */
export async function recordDeviceFreshness(
  deviceId: string,
  strings: { string_number: number; voltage: number; current: number; power: number }[],
  vendorLastDataAt: Date | null,
  prevSig: string | null,
): Promise<void> {
  const sig = readingSignature(strings)
  const data: { vendor_last_data_at?: Date; reading_changed_at?: Date; last_reading_sig?: string } = {}
  if (vendorLastDataAt) data.vendor_last_data_at = vendorLastDataAt
  if (sig !== prevSig) {
    data.reading_changed_at = new Date()
    data.last_reading_sig = sig
  }
  if (Object.keys(data).length === 0) return
  await prisma.devices.update({ where: { id: deviceId }, data })
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run lib/__tests__/record-freshness.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/poller-utils.ts lib/__tests__/record-freshness.test.ts
git commit -m "feat(poller): recordDeviceFreshness helper (value-change + vendor ts)"
```

---

### Task 4: Wire freshness into the CSI poller

**Files:**
- Modify: `lib/csi-poller.ts` (`processCsiDevice`) + its device `select`
- Modify: `lib/poller-utils.ts` `loadStringConfigs` callers unaffected

- [ ] **Step 1:** In `fetchCsiStringData`, add `last_reading_sig: true` to the device `findMany` select (so `processCsiDevice` receives `prevSig`). Update the `processCsiDevice` param type to include `last_reading_sig: string | null`.

- [ ] **Step 2:** In `processCsiDevice`, parse the vendor time once near the top (after `parseRealData`), before the existing stale-gate early-returns record it:
```ts
const csiVendorTs = data.lastReportTime
  ? new Date(String(data.lastReportTime).replace(' ', 'T') + (String(data.lastReportTime).includes('+') || String(data.lastReportTime).endsWith('Z') ? '' : 'Z'))
  : null
const vendorTs = csiVendorTs && !isNaN(csiVendorTs.getTime()) ? csiVendorTs : null
```

- [ ] **Step 3:** After `measurements` are built and written (right after the existing `createMany`), call:
```ts
await recordDeviceFreshness(device.id, measurements.map(m => ({
  string_number: m.string_number, voltage: Number(m.voltage), current: Number(m.current), power: Number(m.power),
})), vendorTs, device.last_reading_sig)
```
Add `recordDeviceFreshness` to the existing `@/lib/poller-utils` import.

- [ ] **Step 4:** For the stale/duplicate gate early-return branch (the `isVendorFeedStale`/frozen path that returns before writing): record the vendor ts there too so a frozen CSI shows its true last-data time:
```ts
if (/* stale gate triggers */) {
  await recordDeviceFreshness(device.id, [], vendorTs, device.last_reading_sig) // sig of [] won't match → but pass [] only to store vendor ts; guard: only call if vendorTs
  ...existing downgrade + return
}
```
> Implementation note: pass `prevSig` so an empty-strings signature does NOT overwrite a real sig — instead, in the stale branch call with the **same** sig to avoid changing reading_changed_at. Simplest: `await prisma.devices.update({ where:{id:device.id}, data: vendorTs ? { vendor_last_data_at: vendorTs } : {} })` guarded by `vendorTs`. Use this direct form in the stale branch rather than recordDeviceFreshness to avoid signature side-effects.

- [ ] **Step 5:** Run CSI tests: `npx vitest run lib/__tests__/csi-client.test.ts lib/__tests__/csi-health-state.test.ts` → PASS. Run `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git add lib/csi-poller.ts
git commit -m "feat(csi): record vendor_last_data_at + reading freshness"
```

---

### Task 5: Wire freshness into the Solis poller

**Files:**
- Modify: `lib/solis-poller.ts` (`processSolisDevice`) + device `select`

- [ ] **Step 1:** Add `last_reading_sig: true` to the `fetchSolisStringData` device `findMany` select; extend the `processSolisDevice` device param type with `last_reading_sig: string | null`.

- [ ] **Step 2:** Compute `const vendorTs = detail.dataTimestamp != null ? new Date(detail.dataTimestamp) : null` near the top of `processSolisDevice` (after `getInverterDetail`).

- [ ] **Step 3:** In the existing freshness-gate branches: on `'stale'`/`'duplicate'` early-return, before returning do `if (vendorTs) await prisma.devices.update({ where:{id:device.id}, data:{ vendor_last_data_at: vendorTs } })`.

- [ ] **Step 4:** On the normal write path (after `createMany`), call:
```ts
await recordDeviceFreshness(device.id, measurements.map(m => ({
  string_number: m.string_number, voltage: Number(m.voltage), current: Number(m.current), power: Number(m.power),
})), vendorTs, device.last_reading_sig)
```
Add `recordDeviceFreshness` to the `@/lib/poller-utils` import.

- [ ] **Step 5:** Run `npx vitest run lib/__tests__/solis-poller.test.ts lib/__tests__/solis-client.test.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add lib/solis-poller.ts
git commit -m "feat(solis): record vendor_last_data_at + reading freshness"
```

---

### Task 6: Wire freshness into the Growatt poller (vendor time = PKT)

**Files:**
- Modify: `lib/growatt-poller.ts` (`processGrowattDevice`) + device `select`

- [ ] **Step 1:** Add `last_reading_sig: true` to the device `findMany` select used by the string-data loop; extend `processGrowattDevice`'s `device` param type with `last_reading_sig: string | null`.

- [ ] **Step 2:** Parse the Growatt vendor time as PKT (the `calendar` epoch is tz-broken — do NOT use it):
```ts
const gTime = (deviceData as any)?.time
const gTs = typeof gTime === 'string' ? new Date(gTime.replace(' ', 'T') + '+05:00') : null
const vendorTs = gTs && !isNaN(gTs.getTime()) ? gTs : null
```

- [ ] **Step 3:** After the device's measurements are written, call `recordDeviceFreshness(device.id, <strings as {string_number,voltage,current,power}>, vendorTs, device.last_reading_sig)`. Use the same `strings` array the poller already extracted via `extractStrings`; map it to the `{string_number,voltage,current,power}` shape. Add the import.

- [ ] **Step 4:** Run `npx vitest run lib/__tests__/growatt-poller.test.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add lib/growatt-poller.ts
git commit -m "feat(growatt): record vendor_last_data_at (PKT) + reading freshness"
```

---

### Task 7: Wire freshness into the Huawei poller (value-change only)

**Files:**
- Modify: `lib/huawei-poller.ts` (`processHuaweiDeviceData`) + device select

- [ ] **Step 1:** Ensure the device object passed to `processHuaweiDeviceData` carries `last_reading_sig` (add to the relevant `select`/type).

- [ ] **Step 2:** After Huawei strings are parsed + written, call `recordDeviceFreshness(device.id, <strings>, null, device.last_reading_sig)` (vendor ts = null; Huawei exposes none). Add the import.

- [ ] **Step 3:** Run `npx vitest run lib/__tests__/huawei-poller.test.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add lib/huawei-poller.ts
git commit -m "feat(huawei): record reading freshness (value-change)"
```

---

### Task 8: Wire freshness into the Sungrow poller (value-change only)

**Files:**
- Modify: `lib/sungrow-poller.ts` (`processSungrowDevice`) + device select

- [ ] **Step 1:** Ensure `processSungrowDevice`'s device carries `last_reading_sig`.

- [ ] **Step 2:** After Sungrow strings are parsed + written, call `recordDeviceFreshness(device.id, <strings>, null, device.last_reading_sig)`. Add the import.

- [ ] **Step 3:** Run `npx vitest run lib/__tests__/sungrow-poller.test.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add lib/sungrow-poller.ts
git commit -m "feat(sungrow): record reading freshness (value-change)"
```

---

### Task 9: Shared API helper — `deviceConnectivity`

**Files:**
- Modify: `lib/string-health.ts` (or a small `lib/connectivity.ts`; keep classify in string-health, put the assembler here)
- Test: extend `lib/__tests__/connectivity.test.ts`

- [ ] **Step 1: Write failing test** (append):
```ts
import { deviceConnectivity } from '../connectivity'
describe('deviceConnectivity', () => {
  it('uses the newest of vendor ts and reading_changed_at', () => {
    const r = deviceConnectivity(
      { vendor_last_data_at: new Date(minsAgo(200)), reading_changed_at: new Date(minsAgo(5)) },
      minsAgo(3), true, NOW)
    expect(r.status).toBe('live') // reading changed 5m ago even though vendor ts is 200m old
  })
})
```

- [ ] **Step 2: Run → fail** (`Cannot find module '../connectivity'`).

- [ ] **Step 3: Implement `lib/connectivity.ts`**
```ts
import { classifyConnectivity, ConnectivityStatus } from '@/lib/string-health'

export function deviceConnectivity(
  device: { vendor_last_data_at: Date | null; reading_changed_at: Date | null },
  lastWriteAtMs: number | null,
  sunUp: boolean,
  nowMs: number = Date.now(),
): { status: ConnectivityStatus; effectiveFreshAt: Date | null } {
  const v = device.vendor_last_data_at?.getTime() ?? null
  const r = device.reading_changed_at?.getTime() ?? null
  const effMs = v == null && r == null ? null : Math.max(v ?? 0, r ?? 0)
  return {
    status: classifyConnectivity(effMs, lastWriteAtMs, sunUp, nowMs),
    effectiveFreshAt: effMs == null ? null : new Date(effMs),
  }
}
```

- [ ] **Step 4: Run → pass.** Commit:
```bash
git add lib/connectivity.ts lib/__tests__/connectivity.test.ts
git commit -m "feat(connectivity): deviceConnectivity assembler"
```

---

### Task 10: Plant API — return per-device connectivity

**Files:**
- Modify: `app/api/plants/[code]/route.ts`

- [ ] **Step 1:** Extend the per-device select with `vendor_last_data_at`, `reading_changed_at`. Fetch per-device `lastWriteAt = MAX(string_measurements.timestamp)` (one grouped query: `prisma.string_measurements.groupBy({ by:['device_id'], where:{ plant_id }, _max:{ timestamp:true } })`).
- [ ] **Step 2:** Compute `sunUp = isDaylight(Number(plant.latitude), Number(plant.longitude), new Date())` (fallback `true` if lat/long null, so we never hide a real problem). For each device, attach `connectivity = deviceConnectivity({vendor_last_data_at, reading_changed_at}, lastWriteAt[device.id], sunUp).status` and `vendor_last_data_at`, `effectiveFreshAt`.
- [ ] **Step 3:** Manual check: `curl -s .../api/plants/<code>` (authed) returns `devices[].connectivity`. Add/adjust an API test if one exists for this route.
- [ ] **Step 4: Commit**
```bash
git add app/api/plants/[code]/route.ts
git commit -m "feat(api): plant route returns per-device connectivity + freshness"
```

---

### Task 11: Plant UI — freshness header + per-inverter status

**Files:**
- Modify: `components/shared/PlantDetailView.tsx`, `InverterDetailSection` (same dir/file)
- Modify: `lib/design-tokens.ts` (`STATUS_STYLES`: add `frozen`, `idle`)

- [ ] **Step 1:** In `design-tokens.ts` add `STATUS_STYLES.frozen` (amber) and `STATUS_STYLES.idle` (muted grey) following the existing entry shape (fg/bg/border/solid/dot). No hardcoded hex elsewhere.
- [ ] **Step 2:** In `PlantDetailView` header, render "Data last received: {relativeTime(last_data_at)}" (amber if > 15 min during day, red if > 2 h).
- [ ] **Step 3:** In `InverterDetailSection`, render the inverter **name · provider badge · model**, a connectivity status chip from `STATUS_STYLES[connectivity]`, and "vendor last data: {vendor_last_data_at ? relative : '—'}" / for frozen show "feed stalled since {effectiveFreshAt}".
- [ ] **Step 4:** Manual smoke: load `/admin/plants/<code>` in dev (`npm run dev`) → header + per-inverter chips render; no console errors.
- [ ] **Step 5: Commit**
```bash
git add components/shared/PlantDetailView.tsx lib/design-tokens.ts
git commit -m "feat(plant-ui): data-last-received header + per-inverter connectivity chip"
```

---

### Task 12: NOC API — fleet connectivity rollup

**Files:**
- Modify: `app/api/admin/string-health-donut/route.ts` and/or `lib/donut-data-loader.ts`

- [ ] **Step 1:** In the loader, for each device compute `connectivity` (reuse `deviceConnectivity` with per-device `lastWriteAt`, the device's `vendor_last_data_at`/`reading_changed_at`, and `isDaylight` for the plant). The devices join + `lastDataAt` per device already exist in the loader.
- [ ] **Step 2:** Return `connectivity: { counts: {live,frozen,offline,idle}, devices: [{deviceId, plantCode, inverterName, provider, status, effectiveFreshAt}] }` alongside the existing donut payload.
- [ ] **Step 3:** Extend the loader's test (`lib/__tests__/donut-data-loader.test.ts`) with one case asserting the counts. Run it → PASS.
- [ ] **Step 4: Commit**
```bash
git add app/api/admin/string-health-donut/route.ts lib/donut-data-loader.ts lib/__tests__/donut-data-loader.test.ts
git commit -m "feat(noc-api): fleet connectivity rollup (live/frozen/offline/idle)"
```

---

### Task 13: NOC UI — connectivity donut + click-filter

**Files:**
- Modify: `app/admin/noc/page.tsx`

- [ ] **Step 1:** Render a second `DonutCore` beside the health donut bound to `connectivity.counts` (Live/Frozen/Offline; show Idle as a muted count beneath, excluded from slices). Colors from `STATUS_STYLES`.
- [ ] **Step 2:** Clicking a connectivity slice sets a filter (URL state, matching the existing health-donut filter pattern) that limits the table rows to inverters in that bucket. Reuse the existing filter/URL-state mechanism.
- [ ] **Step 3:** Manual smoke: `/admin/noc` shows both donuts; clicking Frozen filters the table.
- [ ] **Step 4: Commit**
```bash
git add app/admin/noc/page.tsx
git commit -m "feat(noc-ui): connectivity donut + click-to-filter"
```

---

### Task 14: Full verification + deploy + live validation

- [ ] **Step 1:** `npx vitest run` → all pass. `npx tsc --noEmit` → clean. `bash scripts/validate-centralized.sh` → 20/20.
- [ ] **Step 2:** Run superpowers:requesting-code-review on the full diff (`git diff <base>..HEAD`). Fix Critical/Important.
- [ ] **Step 3:** Deploy via `Working/deploy-to-ec2.sh` (handles `prisma db push` for the new columns). Pre/post-deploy audits must pass.
- [ ] **Step 4: Live validation (read-only probe on EC2):**
  - all 5 providers populate `reading_changed_at`; CSI/Solis/Growatt populate `vendor_last_data_at`.
  - a producing inverter → `live`; pick the slow-Solis device → still `live`; verify night devices (if any) → `idle`.
  - `/admin/plants/<code>` shows freshness; `/admin/noc` connectivity donut counts reconcile with a direct DB count.
- [ ] **Step 5: Final commit** (any validation fixes) + update CLAUDE.md "File Layout" if needed.

---

## Self-review notes
- **Spec coverage:** §3 status model → Task 2/9; §4 schema → Task 1; §5 pollers → Tasks 3–8; §6 API → Tasks 10,12; §7 UI → Tasks 11,13; §8 testing → embedded per task + Task 14. All covered.
- **Type consistency:** `recordDeviceFreshness(deviceId, strings, vendorLastDataAt, prevSig)`, `classifyConnectivity(effectiveFreshAtMs, lastWriteAtMs, sunUp, nowMs)`, `deviceConnectivity(device, lastWriteAtMs, sunUp, nowMs)` — names consistent across Tasks 2/3/9/10/12.
- **No placeholders:** every code step shows real code; the CSI stale-branch nuance (don't let an empty-strings signature overwrite a real sig) is called out explicitly with the direct-update form.
