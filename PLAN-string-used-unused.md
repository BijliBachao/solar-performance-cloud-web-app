# PLAN — String Used / Unused Flag (Problem 01 fix)

**Status:** Not built yet · Documented 2026-04-30 · Baseline commit `afa366c`
**Problem doc:** [`problems/01-unused-strings-electrical-noise.md`](./problems/01-unused-strings-electrical-noise.md)
**Phase:** **A** of the install-context series (Phase B is orientation/peer-grouping in `PLAN-string-orientation-flag.md`)
**Estimated effort:** 3–4 hours including pre-deploy audit + EC2 deploy + verify
**Owner:** Ali · `ai@right2fix.com`

---

## TL;DR

Add an `is_used Boolean @default(true)` column to the existing `string_configs` table. Admin can toggle a string `unused` from `/admin/plants/[code]/strings`. When unused:

- Excluded from alerts (no fault generation)
- Excluded from peer-comparison averaging
- Excluded from org-side API responses (and therefore org dashboards/analysis)
- Excluded from daily/hourly aggregates
- Still written to `string_measurements` (raw data sacred)

This kills permanent false alerts on physically empty PV ports — the single biggest source of customer alert fatigue today.

---

## 1. Problem reference

Read [`problems/01-unused-strings-electrical-noise.md`](./problems/01-unused-strings-electrical-noise.md) before this doc. The problem file explains:

- Why empty PV inputs report 0.05–0.5 A noise
- How peer comparison turns that noise into permanent CRITICAL alerts
- Real production examples (Mall of Multan, etc.)
- Why heuristics can't solve it without explicit metadata

**This plan is the implementation. The problem doc is the why.**

---

## 2. Schema change

Single column added to existing table:

```prisma
model string_configs {
  device_id      String   @db.VarChar(50)
  string_number  Int
  panel_count    Int
  panel_make     String?  @db.VarChar(100)
  panel_rating_w Int?
  notes          String?  @db.Text
  is_used        Boolean  @default(true)        // ← NEW
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt
  updated_by     String?  @db.VarChar(50)

  @@id([device_id, string_number])
  @@index([device_id])
}
```

**`@default(true)` is critical** — preserves current behavior:
- Existing rows with no value → become `true`
- Newly-discovered strings (poller creates configs lazily? — see open question below) → `true`
- Admin opts strings OUT to mark them unused. Never opts in.

Migration: `npx prisma db push` on the EC2 deploy step (existing flow). No data loss.

---

## 3. Validation (Zod)

`lib/api-validation.ts` — extend the two existing schemas:

```typescript
export const StringConfigUpsertSchema = z.object({
  panel_count: z.number().int().min(1).max(100).optional(),     // already optional? check existing
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50).max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_used: z.boolean().optional(),                              // ← NEW
})

export const StringConfigBulkSchema = z.object({
  panel_count: z.number().int().min(1).max(100),
  panel_make: z.string().max(100).nullable().optional(),
  panel_rating_w: z.number().int().min(50).max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  only_unconfigured: z.boolean().default(false),
  is_used: z.boolean().optional(),                              // ← NEW
})
```

Note: `panel_count` may need to become optional when `is_used: false` is being toggled without changing panel info. Decide during build.

---

## 4. Admin write path

### Existing endpoints (extend)

**`PUT /api/admin/string-config/[deviceId]/[stringNumber]`** (`app/api/admin/string-config/[deviceId]/[stringNumber]/route.ts`)
- Already validates against `StringConfigUpsertSchema`
- After Zod parse: include `is_used` in the upsert create + update bodies
- Default for create: `is_used: parsed.data.is_used ?? true`

**`POST /api/admin/plants/[code]/strings-config`** (bulk)
- Already loops over targets
- Each upsert: include `is_used: parsed.data.is_used ?? true`
- Use case for bulk toggling: admin sees an inverter with 4 used + 8 empty PV ports, selects all 8, marks unused in one POST

**`GET /api/admin/plants/[code]/strings-config`** (list)
- Already returns full config per string
- Add `is_used` to the response shape (it's just another field)

### Auth gate (already in place)

All three endpoints already call `requireRole(userContext, ['SUPER_ADMIN'])` — no change needed. Org users get 403.

---

## 5. Admin UI

`app/admin/plants/[plantCode]/strings/page.tsx` — extend existing table.

### Changes

1. **New column "Used"** with a toggle switch:
   - ON (green) = `is_used: true` (default)
   - OFF (grey) = `is_used: false`
   - Click toggle → optimistic UI update + PUT request
   - On unused rows: dim the panel-info inputs (`opacity-50`), show a "Hidden from org" badge

2. **New bulk action** above the table:
   - "Mark selected as unused" button
   - Multi-select via checkboxes (or shift-click range select)
   - Or: simpler first version — a "Mark all empty PV (current < 0.5 A) as unused" smart button that uses live current to suggest
   - Calls bulk endpoint with `is_used: false` for the selected strings

3. **Visual treatment of unused rows:**
   - Soft grey background (`bg-slate-50`)
   - Italic "Unused" label in the panel-info area
   - Row stays clickable so admin can toggle back

4. **Section header** — small count: "12 strings · 4 used · 8 unused"

### State management

The existing page uses local React state for edits (`edits` map keyed by `deviceId:stringNumber`). Add `is_used` to that state. Same save pattern.

---

## 6. Org-side filter — the critical path

### Reads — exclude unused from JSON response

**`app/api/plants/[code]/strings/route.ts`** — already LEFT JOINs `string_configs`. The current code includes ALL strings. After this change:

```typescript
// Build the per-device string list
const strings = latestMeasurements.map((m) => {
  const cfg = configByKey.get(`${device.id}:${m.string_number}`)
  // ... compute status, gap, etc.
  return { string_number: m.string_number, ..., config: cfg ? { ... } : null }
})
.filter(s => {
  // NEW: hide strings explicitly marked unused
  const cfg = configByKey.get(`${device.id}:${s.string_number}`)
  return cfg?.is_used !== false  // null/undefined/true → keep; false → drop
})
```

`is_used` is **not exposed** in the org-side JSON. Admins see the field; org users never know it exists.

**`app/api/dashboard/analysis/string-level/route.ts`** — same filter applied to `lifetimeRecords` and `recentRecords`. Skip strings whose configs say `is_used: false`.

**`app/api/plants/[code]/monthly-health/route.ts`** — similar filter (need to read its current shape during build).

### Peer pool — exclude unused from peer averaging

In `app/api/plants/[code]/strings/route.ts`, the `freshReadings` array drives `leaveOneOutAvg()` and `activeAvg()`:

```typescript
const freshReadings: StringReading[] = latestMeasurements
  .filter(m => !isStale(m.timestamp.getTime(), freshestTs))
  // NEW filter:
  .filter(m => configByKey.get(`${device.id}:${m.string_number}`)?.is_used !== false)
  .map(m => ({ string_number: m.string_number, current: Number(m.current), voltage: Number(m.voltage) }))
```

Result: peer averages reflect only real wired strings. Used strings' gap percentages improve immediately.

---

## 7. Alert path

**`lib/poller-utils.ts`** `generateAlerts(deviceId, plantId, measurements)`:

Currently loops over each measurement and may create an alert. Add a config preload + skip:

```typescript
async function generateAlerts(deviceId, plantId, measurements) {
  // NEW — load configs once for this device
  const configs = await prisma.string_configs.findMany({
    where: { device_id: deviceId },
    select: { string_number: true, is_used: true },
  })
  const usedSet = new Set(
    configs.filter(c => c.is_used === false).map(c => c.string_number)
  )
  // (negation intentional — we track UNUSED, since used is the default)

  // Filter measurements to only used strings BEFORE peer averaging
  const usedMeasurements = measurements.filter(m => !usedSet.has(m.string_number))

  // Compute peer average from used measurements only
  // ... existing logic, but with usedMeasurements ...

  // When generating alerts, skip if string is unused
  for (const m of measurements) {
    if (usedSet.has(m.string_number)) continue   // skip alert generation for unused
    // ... existing alert logic
  }
}
```

Result: no new alerts ever fire on unused strings. Existing alerts on now-unused strings need to be auto-resolved (see Step 9).

---

## 8. Aggregates path

**`lib/poller-utils.ts`** `updateDailyAggregates(deviceId, plantId, maxStrings)` and `updateHourlyAggregates(...)`:

Both currently loop `1..maxStrings`. Add the same config preload + skip:

```typescript
const unusedSet = await getUnusedStringNumbers(deviceId)  // helper

for (let s = 1; s <= maxStrings; s++) {
  if (unusedSet.has(s)) continue  // skip — don't aggregate noise
  // ... existing upsert into string_daily / string_hourly
}
```

Result: `string_daily` and `string_hourly` no longer have rows for unused strings going forward. Existing rows from BEFORE the flag was set remain — they don't affect anything because the read APIs filter them out via the LEFT JOIN. Optional cleanup query (one-time) covered in Step 11.

---

## 9. Auto-resolve historical alerts when marking unused

When admin flips a string `is_used: false`, any open alerts on that string become irrelevant. Auto-resolve them in the same PUT request:

```typescript
// In PUT /api/admin/string-config/[deviceId]/[stringNumber]/route.ts
// Inside the handler, after upsert succeeds:
if (parsed.data.is_used === false) {
  await prisma.alerts.updateMany({
    where: {
      device_id: deviceId,
      string_number: sn,
      resolved_at: null,
    },
    data: {
      resolved_at: new Date(),
      resolved_by: userContext.userId,
    },
  })
}
```

Same logic for the bulk endpoint when it marks a batch unused.

This is the cleanest closure of the alert-fatigue loop: the moment admin says "this PV is empty," all the false alerts disappear.

---

## 10. Step-by-step build order

Each step independently shippable + testable. Run TS check (`./node_modules/.bin/tsc --noEmit`) and validator (`bash scripts/validate-centralized.sh`) after every step.

1. **Schema:** add `is_used` column → `npx prisma generate` → confirm Prisma client picks it up
2. **Zod:** extend the two schemas in `lib/api-validation.ts`
3. **Admin GET:** extend `app/api/admin/plants/[code]/strings-config/route.ts` GET handler to return `is_used` per row
4. **Admin PUT:** extend `app/api/admin/string-config/[deviceId]/[stringNumber]/route.ts` to accept `is_used` + auto-resolve alerts on `false`
5. **Admin bulk:** extend POST endpoint same way
6. **Admin UI:** add toggle column + dimmed-row visual + "Mark unused" bulk action
7. **Org read:** add filter to `/api/plants/[code]/strings` (drops unused from response + peer pool)
8. **Org analysis:** add filter to `/api/dashboard/analysis/string-level`
9. **Alerts:** modify `generateAlerts()` to skip unused
10. **Aggregates:** modify `updateDailyAggregates()` and `updateHourlyAggregates()` to skip unused
11. **(Optional) historical cleanup:** one-time SQL/API call to delete rows in `string_daily`/`string_hourly` where the corresponding string is now `is_used: false`. Defer unless admin says "the historical reports look weird"
12. **TS check + validator + pre-deploy audit + commit + deploy + post-deploy verify** (existing flow)

Total effort: 3–4 hours.

---

## 11. Acceptance test

After deploying, sign in as SUPER_ADMIN and verify:

1. **Schema:** the new column exists in production:
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'string_configs';
   -- Expect to see is_used in the list
   ```

2. **Mark unused flow:** open `/admin/plants/<plant>/strings` for a real plant. Toggle PV2 to "unused". Refresh the page. Confirm:
   - Toggle stays off
   - PV2 row appears dimmed/greyed
   - "Hidden from org" badge present

3. **Org dashboard hides unused:**
   - Open `/dashboard/plants/<same plant>` (sign in as org user, or use SUPER_ADMIN if you have plant access)
   - PV2 should be **completely absent** from the String Comparison Table
   - PV1, PV3 etc. still show
   - The inverter "% healthy" recomputed without PV2 in the denominator → should be higher

4. **Alerts auto-resolved:**
   - In the database: `SELECT * FROM alerts WHERE device_id = '<id>' AND string_number = 2 AND resolved_at IS NOT NULL` — should show alerts that were just resolved
   - In `/dashboard/alerts`: PV2's old alerts now marked Resolved

5. **Peer averaging improved:**
   - Look at PV1's `gap_percent` before vs after — should be smaller (because PV2's noise no longer drags down the peer average)

6. **Aggregates clean going forward:**
   - Wait for next aggregate run (daily 02:00 UTC, or trigger manually)
   - Confirm `string_daily` has no row for the now-unused string

---

## 12. Edge cases

| Case | Behavior |
|---|---|
| Admin toggles unused → realises mistake → toggles back | Works seamlessly — `is_used: true` written, alerts can fire again on next anomaly. Past auto-resolved alerts stay resolved (no zombie reopening). |
| New string discovered by poller (e.g., new PV channel reported by inverter for first time) | No `string_configs` row exists yet → `is_used` defaults to true → string is included by default (current behavior) |
| Race: two admins toggle same string at the same moment | Last-write-wins per Prisma upsert semantics. Acceptable; admins coordinate. |
| Deleting a config row entirely (already supported via DELETE endpoint) | After delete, no config exists → string treated as `is_used: true` (default). Use this if admin wants to revert ALL config including panel info. |
| Admin marks all 12 strings of an inverter unused | Inverter shows zero strings on org dashboard. Possibly the inverter row itself should be hidden too — open question. |
| String has `is_used: false` but real data starts flowing (e.g., installer wires PV2 later, forgets to flip flag) | String stays hidden. Real performance data goes uncaptured for org user. **Mitigation:** add a periodic admin reminder ("PV2 is marked unused but its current is consistently > 5A — was a panel added?"). Out of scope for Phase A — note for backlog. |

---

## 13. DO NOT touch

- ❌ Don't filter at the poller. Poller keeps writing every channel to `string_measurements`. Filtering at the alert/aggregate/UI layer only.
- ❌ Don't delete `string_measurements` rows for unused strings. Raw data sacred.
- ❌ Don't change the default for `is_used`. Default `true` preserves current behavior.
- ❌ Don't expose `is_used` in org-side API responses. Admins see it; org users don't even know it exists.
- ❌ Don't change the peer-comparison thresholds (`GAP_CRITICAL`, `GAP_WARNING`, `GAP_INFO`). The fix is in the peer pool composition, not the thresholds.

---

## 14. Open questions to resolve before coding

These were noted in the problem doc. **Confirm with user before starting:**

1. **Default for new strings discovered by poller:** `true` (recommended) or `false` (admin must enable)?
2. **Bulk-mark UX:** multi-select per row + "mark unused" button (recommended), or simpler one-toggle-per-row only?
3. **Auto-resolve historical alerts when marking unused:** yes (recommended) or leave them in alert history?
4. **Hide entire inverter when all its strings are unused:** rare edge case — yes (cleaner) or no (weirder but more transparent)?
5. **Who can flag:** SUPER_ADMIN only (recommended, matches Phase 1) or extend to ORG_ADMIN?
6. **Naming the field:** `is_used` (recommended, matches user vocabulary) vs `is_active` vs `is_connected` vs `enabled`?
7. **Reporting impact:** monthly client reports — show plant health excluding unused strings (recommended) vs include them?
8. **Migration of existing data:** all existing `string_configs` rows default to `is_used: true` automatically (no action needed). New strings without configs also default true. Confirm no historical work needed.

---

## 15. References

| Item | Path |
|---|---|
| Problem doc | `problems/01-unused-strings-electrical-noise.md` |
| Phase 1 deploy commit (created `string_configs` table) | `0575bd7` |
| Existing schema | `prisma/schema.prisma` model `string_configs` |
| Existing admin page | `app/admin/plants/[plantCode]/strings/page.tsx` |
| Existing admin endpoints | `app/api/admin/plants/[code]/strings-config/route.ts`, `app/api/admin/string-config/[deviceId]/[stringNumber]/route.ts` |
| Existing org read | `app/api/plants/[code]/strings/route.ts` |
| Existing peer-comparison helpers | `lib/string-health.ts` (no change — same helpers, filtered input) |
| Existing alert generation | `lib/poller-utils.ts` `generateAlerts()` |
| Existing aggregations | `lib/poller-utils.ts` `updateDailyAggregates()`, `updateHourlyAggregates()` |
| BACKLOG entry | `BACKLOG.md` Phase A row |

---

**End of plan. Read the problem doc, answer the 8 questions, then we build.**
