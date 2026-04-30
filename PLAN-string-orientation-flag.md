# PLAN — String Orientation / Peer-Comparison Exclusion (Problem 02 fix)

**Status:** Not built yet · Documented 2026-04-30 · Baseline commit `afa366c`
**Problem doc:** [`problems/02-non-standard-orientation-peer-comparison.md`](./problems/02-non-standard-orientation-peer-comparison.md)
**Phase:** **B** of the install-context series — **builds on Phase A** (`PLAN-string-used-unused.md`)
**Estimated effort:** 2–3 hours **after Phase A is done** (reuses Phase A's scaffolding)
**Owner:** Ali · `ai@right2fix.com`

---

## Research-validated approach

This plan was validated against industry practice on 2026-04-30 — see [`RESEARCH-orientation-handling.md`](./RESEARCH-orientation-handling.md). Key findings:

- **IEC 61724-1 explicitly defines "sub-array" as a separate analysis boundary** with its own PR computed against the POA irradiance at that sub-array's plane. SPC's current peer-only logic sits **below the free-tier baseline** of every global incumbent (SolarEdge, SMA, Tigo, Solar-Log, FusionSolar).
- **Phase B Option A (this plan) is defensible as v1** — it matches what SolarEdge does when a customer mis-configures a logical string with mixed orientations: removes the false alert and labels the string "operating as designed".
- **The honest UI label** for excluded strings is "Peer comparison disabled — no fault detection until Phase 2 PR." Customers prefer "we know what we don't know" over "we cry wolf."
- **Phase 2 PR (#96, Small variant)** is the natural pair — provides absolute scoring against nameplate × peak-sun-hours so excluded strings get fault detection back, just from a different angle.
- **Sub-array tagging with named groups + PVGIS TMY** is the industry baseline (SolarEdge / SMA / Tigo / Solar-Log standard). Defer to Phase B v2 when a serious client asks.

## TL;DR

Add an `exclude_from_peer_comparison Boolean @default(false)` column to the existing `string_configs` table. Admin can flag strings on non-standard orientations (east/west roofs, walls, partial shade) so they:

- Drop out of peer-comparison averaging on their inverter
- Get a "Non-standard install" chip on the org dashboard (visible, but not flagged as faulty)
- Don't fire CRITICAL/WARNING alerts based on peer-relative output
- Still show their real measurements (kWh, V, A) — they're producing useful energy
- Will get proper fault scoring once Phase 2 PR (task #96) is built

This is **Option A — simple flag**. We deferred Option B (named groups like `east-roof`, `west-wall` with within-group peer comparison) — it's overkill for the 90% case and can be added later if needed.

---

## 1. Problem reference

Read [`problems/02-non-standard-orientation-peer-comparison.md`](./problems/02-non-standard-orientation-peer-comparison.md) before this doc. The problem file explains:

- Why panels at non-standard orientations naturally produce 30–60% of peer current
- Real production examples (Faisalabad worker housing, Lahore housing society carports, Multan factory walls)
- Why this kills customer trust through alert fatigue (same root cause as Problem 01)
- Why heuristics can't infer orientation from data

**This plan is the implementation. The problem doc is the why.**

---

## 2. Why Phase B builds on Phase A

Phase A (used/unused) and Phase B (peer exclusion) share:

- The same admin page (`app/admin/plants/[plantCode]/strings/page.tsx`)
- The same admin API endpoints (extend, don't replace)
- The same `string_configs` table (one more column)
- The same access pattern (admin writes, org reads filtered)
- The same Zod schema layer

**Order matters:** ship Phase A first. It validates the entire pattern with a simpler payload (one boolean). Phase B then adds a second boolean using the same pattern. Don't try to ship both in one deploy.

---

## 3. Schema change

Add ONE more column:

```prisma
model string_configs {
  device_id                     String   @db.VarChar(50)
  string_number                 Int
  panel_count                   Int
  panel_make                    String?  @db.VarChar(100)
  panel_rating_w                Int?
  notes                         String?  @db.Text
  is_used                       Boolean  @default(true)        // Phase A
  exclude_from_peer_comparison  Boolean  @default(false)       // ← NEW (Phase B)
  created_at                    DateTime @default(now())
  updated_at                    DateTime @updatedAt
  updated_by                    String?  @db.VarChar(50)

  @@id([device_id, string_number])
  @@index([device_id])
}
```

**`@default(false)`** — most strings are standard installs. Admin opts strings INTO exclusion when their physical layout differs (east-facing, wall, etc.). Default behaviour unchanged.

**Naming chosen:** `exclude_from_peer_comparison` — descriptive, unambiguous in code. UI shows it as "Non-standard install" or "Peer-comparison: off" (TBD per open question).

Migration: `npx prisma db push` on EC2 deploy (existing flow).

---

## 4. Validation (Zod)

Extend the same schemas modified in Phase A:

```typescript
export const StringConfigUpsertSchema = z.object({
  // ... fields from Phase 1 + Phase A ...
  is_used: z.boolean().optional(),                              // Phase A
  exclude_from_peer_comparison: z.boolean().optional(),         // ← NEW
})

export const StringConfigBulkSchema = z.object({
  // ... fields from Phase 1 + Phase A ...
  is_used: z.boolean().optional(),                              // Phase A
  exclude_from_peer_comparison: z.boolean().optional(),         // ← NEW
})
```

---

## 5. Admin write path

### Existing endpoints (extend)

**`PUT /api/admin/string-config/[deviceId]/[stringNumber]/route.ts`**
- Add `exclude_from_peer_comparison` to upsert create + update bodies
- Default for create when not specified: `false`

**`POST /api/admin/plants/[code]/strings-config/route.ts` (bulk)**
- Same — accept the field in the bulk payload
- Use case: admin selects all 12 wall-mounted strings of an inverter, marks them all in one POST

**`GET /api/admin/plants/[code]/strings-config/route.ts` (list)**
- Already returns full config per string — add the new field to the response

Auth gate: `requireRole(['SUPER_ADMIN'])` — already in place.

---

## 6. Admin UI

`app/admin/plants/[plantCode]/strings/page.tsx` — add another column to the same table.

### After Phase A and Phase B, the table looks like:

```
Strings Config — Mall of Multan / Inverter 8 (worker-housing wall mount)
─────────────────────────────────────────────────────────────────────────
[✓ Apply panels]  [⛔ Mark unused]  [↗ Mark non-standard]

│ # │ String │ Used │ Peer-comp │ Panels │ Make    │ W   │ Notes      │
├───┼────────┼──────┼───────────┼────────┼─────────┼─────┼────────────┤
│ 1 │ PV1    │ ON   │ OFF       │ 8      │ Longi   │ 550 │ Wall mount │
│ 2 │ PV2    │ ON   │ OFF       │ 8      │ Longi   │ 550 │ Wall mount │
│ 3 │ PV3    │ ON   │ OFF       │ 8      │ Longi   │ 550 │ Wall mount │
│ ... up to PV12 ...                                                   │
```

`Peer-comp ON` = standard install (default). `Peer-comp OFF` = excluded from peer-comparison.

### State management

Same pattern as Phase A — extend the local `edits` state with the new boolean. Same save flow.

### Bulk action

"Mark non-standard" multi-select — same pattern as Phase A's "Mark unused".

### Visual treatment of excluded rows

- Border-left accent in solar-gold (signals "different, but valid")
- Small chip: `↗ Non-standard`
- Don't grey-out or dim — these strings produce real energy, just not comparable to peers

---

## 7. Org-side reads — peer pool change is the critical part

### Behaviour goal

Strings flagged `exclude_from_peer_comparison: true`:
- **Are still returned** in the API response (org users see their real numbers — they're producing useful energy)
- **Are not in the peer pool** (don't drag the average down for normal strings)
- **Have `gap_percent: null`** in the response (we can't meaningfully compare)
- **Have `peer_excluded: true`** in the response (UI can show a chip)
- **Don't trigger CRITICAL/WARNING alerts** based on peer comparison

### Implementation in `app/api/plants/[code]/strings/route.ts`

```typescript
// Build peer pool: exclude (a) stale, (b) unused (Phase A), (c) peer-excluded
const freshReadings: StringReading[] = latestMeasurements
  .filter(m => !isStale(m.timestamp.getTime(), freshestTs))
  .filter(m => {
    const cfg = configByKey.get(`${device.id}:${m.string_number}`)
    if (cfg?.is_used === false) return false                       // Phase A
    if (cfg?.exclude_from_peer_comparison === true) return false   // ← Phase B
    return true
  })
  .map(m => ({ string_number: m.string_number, current: Number(m.current), voltage: Number(m.voltage) }))

// Now build the per-string output
const strings = latestMeasurements.map((m) => {
  const cfg = configByKey.get(`${device.id}:${m.string_number}`)
  const peerExcluded = cfg?.exclude_from_peer_comparison === true

  // For peer-excluded strings: gap_percent is null, status is 'NORMAL' (not faulty)
  if (peerExcluded) {
    return {
      string_number: m.string_number,
      voltage: Number(m.voltage),
      current: Number(m.current),
      power: Number(m.power),
      gap_percent: null,                                            // ← null
      status: 'NORMAL' as const,                                    // not faulty
      peer_excluded: true,                                          // ← chip on UI
      energy_kwh: ...,
      config: cfg ? { panel_count, panel_make, panel_rating_w } : null,
    }
  }

  // Standard string — existing peer-comparison logic
  const peerAvg = stale ? null : leaveOneOutAvg(freshReadings, m.string_number)
  const { status, gapPercent } = classifyRealtime(current, voltage, peerAvg, stale)
  return {
    string_number: m.string_number,
    voltage, current, power: Number(m.power),
    gap_percent: Math.round(gapPercent * 10) / 10,
    status,
    peer_excluded: false,
    ...
  }
})

// Filter out unused strings AFTER computing (Phase A behavior)
.filter(s => {
  const cfg = configByKey.get(`${device.id}:${s.string_number}`)
  return cfg?.is_used !== false
})
```

### Result

A non-standard string appears on the org dashboard with:
- Real V/A/P values (it's producing real energy)
- No gap_percent (`—`)
- Status NORMAL
- A subtle "Non-standard" chip
- No alert triggers it

A standard string appears with:
- Real V/A/P
- Gap % computed from peer pool that excludes peer-excluded siblings → cleaner average
- Normal status flow

### `app/api/dashboard/analysis/string-level/route.ts`

Same logic — peer-pool filtering at the same point. Keeps non-standard strings in the row list (as informational rows) but with no peer-relative score.

---

## 8. Alert path

`lib/poller-utils.ts` `generateAlerts()` — extend the Phase A skip:

```typescript
const configs = await prisma.string_configs.findMany({
  where: { device_id: deviceId },
  select: { string_number: true, is_used: true, exclude_from_peer_comparison: true },
})
const skipSet = new Set(
  configs
    .filter(c => c.is_used === false || c.exclude_from_peer_comparison === true)
    .map(c => c.string_number)
)

// In the alert loop:
for (const m of measurements) {
  if (skipSet.has(m.string_number)) continue   // skip both unused AND peer-excluded
  // ... existing alert logic
}

// In peer averaging:
const peerMeasurements = measurements.filter(m => !skipSet.has(m.string_number))
```

Result:
- Unused strings: no alerts (Phase A)
- Peer-excluded strings: no peer-comparison-based alerts (Phase B)
- They could still get alerts based on **absolute** signals when Phase 2 PR (task #96) lands — that's the natural follow-up

---

## 9. Aggregates path

`updateDailyAggregates()` and `updateHourlyAggregates()` — should they aggregate peer-excluded strings?

**Yes — keep aggregating them.** Their daily kWh is real. Future PR computation needs that data. Just don't let them affect peer-relative scores.

The `string_daily.health_score` formula currently uses peer-relative inputs. For peer-excluded strings:
- `performance` and `availability` based on absolute signals stay
- `health_score` = null until Phase 2 PR provides absolute scoring

For now: aggregations write rows for peer-excluded strings, but `health_score` is null on those rows. UI can render "—" instead of a percentage.

---

## 10. UI on the org dashboard

### `components/shared/StringComparisonTable.tsx`

Add visual treatment when a row has `peer_excluded: true`:

- Status column: show `◯ Non-standard install` instead of the usual NORMAL/WARNING/CRITICAL pill
- Gap column: `—`
- Optional tooltip: "Excluded from peer comparison · {panel_make} · wall/east/etc."
- Don't dim the row (these ARE producing energy)

### `components/shared/StringHealthMatrix.tsx` (heatmap)

For peer-excluded strings: render the cell with a different pattern (light grey diagonal stripe?) — quick visual signal that this cell's color isn't a fault assessment.

### `components/shared/InverterDetailSection.tsx` (header)

If ALL strings on an inverter are peer-excluded (e.g., all wall-mounted), show inverter-level note: "All strings on non-standard install · peer comparison disabled". Don't compute inverter "% healthy" — show "—".

---

## 11. Step-by-step build order

Each step independently shippable. Run TS check + validator after each.

**Prerequisite: Phase A (used/unused) is shipped and verified in production.**

1. **Schema:** add `exclude_from_peer_comparison` column → `npx prisma generate`
2. **Zod:** extend the two schemas
3. **Admin GET/PUT/bulk:** extend to handle new field
4. **Admin UI:** add toggle column "Peer-comp" + bulk action "Mark non-standard"
5. **Org read:** modify peer-pool composition + per-string output in `/api/plants/[code]/strings`
6. **Analysis API:** same in `/api/dashboard/analysis/string-level`
7. **Alert path:** extend `generateAlerts()` to skip peer-excluded strings
8. **Aggregates:** allow aggregations to write peer-excluded strings (with null `health_score`)
9. **UI:** `StringComparisonTable` shows "Non-standard" chip + null gap
10. **UI:** `StringHealthMatrix` distinct cell pattern for peer-excluded
11. **UI:** `InverterDetailSection` header note when all strings excluded
12. **TS check + validator + audit + commit + deploy + verify**

Total effort: 2–3 hours after Phase A.

---

## 12. Acceptance test

After deploying both Phase A and Phase B:

1. **Schema:** confirm both new columns:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'string_configs'
     AND column_name IN ('is_used', 'exclude_from_peer_comparison');
   ```

2. **Mark non-standard flow:** at `/admin/plants/<plant>/strings` for a real plant with non-standard strings (worker-housing wall mount, east-facing roof, etc.):
   - Toggle "Peer-comp" OFF for those strings
   - Save persists
   - Page shows the new chip / accent

3. **Org dashboard reflects exclusion:**
   - Open `/dashboard/plants/<same plant>` as an org user (or SUPER_ADMIN with plant access)
   - Excluded strings still appear in the String Comparison Table (they're producing real energy)
   - Their status shows "Non-standard install" (not CRITICAL/WARNING)
   - Their gap column shows "—"
   - Other strings on same inverter: their gap % may have improved (peer pool no longer dragged down by peer-excluded strings)

4. **Alerts:**
   - In the database, no new alerts fire on peer-excluded strings going forward
   - Existing alerts on peer-excluded strings — auto-resolve them in the same PUT (similar to Phase A)? Open question; recommendation is yes.

5. **Aggregates:**
   - `string_daily` continues to have rows for peer-excluded strings
   - `health_score` on those rows is null (no peer-relative scoring)
   - When Phase 2 PR (task #96) lands, `health_score` becomes computable from absolute PR

---

## 13. Edge cases

| Case | Behavior |
|---|---|
| Admin marks one string peer-excluded, leaves others standard | Standard strings' peer pool excludes the one flagged. Their gap % becomes more accurate. |
| Admin marks ALL strings on an inverter peer-excluded | Peer pool is empty → peer averaging returns null → all strings show NORMAL with null gap. Inverter header shows "all non-standard". |
| String is BOTH unused AND peer-excluded | Treated as unused (Phase A wins — string disappears from response). Peer-exclusion flag is irrelevant when the string is invisible. |
| Admin un-flags a previously peer-excluded string | Standard peer comparison resumes. Existing alerts (auto-resolved when first marked) stay resolved. |
| New string discovered by poller | No config row → `exclude_from_peer_comparison` defaults to false → peer comparison applies as today. |
| Peer-excluded string has a **real** electrical fault | Currently undetected at peer level. Caught by absolute Phase 2 PR (when built) or by sensor-fault filter (#105) when current > MAX threshold. **Document this gap clearly in the UI** — admins should know that peer-excluded means "no peer-relative fault detection until Phase 2." |

---

## 14. DO NOT touch

- ❌ Don't filter peer-excluded strings out of the API response. They produce real energy; org users should see it.
- ❌ Don't mark peer-excluded strings as "faulty" or "warning" by some other heuristic when peer-comparison is off. They have NO fault scoring until Phase 2 PR is built. Honest "—" is better than a fake assessment.
- ❌ Don't change `GAP_CRITICAL` / `GAP_WARNING` thresholds. The fix is in the peer pool composition, not the thresholds.
- ❌ Don't remove the `is_used` flag check (Phase A). Both flags are independent — they coexist.
- ❌ Don't grey out peer-excluded rows. They're producing — show them clearly.

---

## 15. Open questions to resolve before coding

These were noted in the problem doc. **Confirm with user before starting Phase B (after Phase A ships):**

1. **Vocabulary:** `exclude_from_peer_comparison` (recommended, unambiguous in code) vs `non_standard_install` vs `peer_excluded`?
2. **What replaces fault scoring for excluded strings:** nothing for now (recommended, until Phase 2 PR lands) vs historical self-comparison?
3. **Visibility on org dashboard:** show with chip (recommended, transparent) vs hide (treats them like unused)?
4. **Auto-resolve historical alerts when admin flags a string excluded:** yes (recommended, clean) vs no?
5. **Reporting:** monthly client reports — show plant health "with and without" non-standard strings? (Defer until customers ask. Out of scope.)
6. **All-strings-excluded inverter:** show with note (recommended) or omit from dashboard entirely?
7. **Future Phase B v2 — group keys (`east-roof`, `wall-south`):** confirm this is deferred unless there's a real customer request?

---

## 16. References

| Item | Path |
|---|---|
| Problem doc | `problems/02-non-standard-orientation-peer-comparison.md` |
| Phase A plan (prerequisite) | `PLAN-string-used-unused.md` |
| Phase 2 PR plan (natural follow-up) | `PLAN-performance-ratio-phase2.md` |
| Phase 1 deploy commit (created `string_configs` table) | `0575bd7` |
| Existing schema | `prisma/schema.prisma` model `string_configs` |
| Existing admin page | `app/admin/plants/[plantCode]/strings/page.tsx` |
| Existing org read | `app/api/plants/[code]/strings/route.ts` |
| Existing peer-comparison | `lib/string-health.ts` (no change — same helpers, filtered input) |
| Existing alerts | `lib/poller-utils.ts` `generateAlerts()` |
| BACKLOG entry | `BACKLOG.md` Phase B row |
| Related task | `BACKLOG.md` #105 (sensor-fault filter — couples with this) |

---

**End of plan. Ship Phase A first. Read the problem doc. Answer the questions. Then we build.**
