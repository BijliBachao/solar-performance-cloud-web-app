# Client Feedback — 2026-04-23

> **Purpose:** Capture and track the 6 items of client feedback received on 2026-04-23. This is the living tracker for these items — their interpretation, current code state, proposed solution, and execution status. Nothing gets built until this document is read and approved.
>
> **Received:** 2026-04-23 via Ali (forwarded client message).
> **Client:** BijliBachao customer / Engr. Reyyan Niaz Khan's point of contact.
> **Status:** 🟡 **Under review — awaiting 5 clarification answers before we begin work.**
>
> **Paired:** `AUDIT.md`, `NEXT-STEPS.md`, `HANDOVER.md`, `CHANGELOG.md`.

---

## 1. Full verbatim client message

Preserving the client's message exactly as received, including the Urdu-English (Roman-Urdu) mix. Do not edit or paraphrase this block.

```
Sr    Description
1    Kw/string column should be removed
2    Routine faults of inverter to be populated jo api ma atay hain and apps ma b show hty hain
3    The word open circuit should not be used , it should be removed, however, we can keep the string
4    Donut chart. Pie chart for healthy string, abnormal and critical strings must be removed
5    used, unused, undershade must be created at Sup Admin level at the moment, may be in future we can push to lowe level of organization level, I suggest keeping both options alive for 2 weeks till we get some data
6    in few cases all inverters will be merged in 1 login by default where there is a logger installed at site, like in case of Qadir Solar , site where sungrow is installed. for other sites where each inverter has its own wifi device, then they will be communicationg different, but we need to merge them in a single, this is what super admin should be doing while making an organization account
```

---

## 2. Summary table

| # | Item (one-line) | Complexity | Risk | Current state | Status |
|---|---|---|---|---|---|
| 1 | Remove `kW/String` column | 🟢 Trivial (~1 h) | 🟢 Low | **Still present in 3 files** (code still emits + renders) | 🔴 TODO |
| 2 | Pull vendor-native inverter faults from APIs and display | 🟡 Medium (~1–2 days) | 🟡 Medium | Not implemented — we only compute our own 7 fault classes | 🔴 TODO |
| 3 | Remove the UI label "Open Circuit" (keep status internally) | 🟢 Trivial (~2 h) | 🟢 Low | Label appears in 6+ files | 🔴 TODO |
| 4 | Remove donut/pie chart (healthy / abnormal / critical) | 🟢 Trivial | 🟢 Low | **NOT FOUND — we may have never had one.** Needs client confirmation. | 🟡 BLOCKED — ask client |
| 5 | Add `used` / `unused` / `undershade` tags at Super Admin level (keep both levels for 2 weeks) | 🟡 Medium (~1–2 days) | 🟡 Medium | Not implemented — no tagging schema today | 🔴 TODO |
| 6 | Super Admin can merge multiple plants (separate-logins scenario) into one organization-visible site | 🔴 High (~3–5 days) | 🔴 High | Not implemented — data model has no Site layer | 🔴 TODO |

---

## 3. Interpretation framework (how to read this doc)

For each item below, we capture:

- **Verbatim quote** — the exact client text
- **Translation** — if Roman-Urdu or ambiguous English, the English interpretation
- **What it means** — what the client is actually asking for in plain terms
- **Why the client wants this** — the inferred business reason
- **Current code state** — what our codebase actually does today (grep-verified)
- **Proposed solution** — the technical fix we'd make
- **Files affected** — which files we'd change
- **Complexity / effort** — realistic time estimate
- **Risk** — what could go wrong
- **Dependencies / blockers** — what else must be done first
- **Open questions** — what we need clarified before work starts
- **Status** — 🔴 TODO / 🟡 IN PROGRESS / 🟢 DONE / ⛔ BLOCKED / ❓ WAITING ON CLIENT

---

## Item 1 · Remove kW/String column

### Verbatim
> *"Kw/string column should be removed"*

### What it means
The client wants a column labelled "kW/String" (kilowatts per string — a nominal capacity metric computed by dividing plant capacity by string count) removed from every page it appears.

### Why the client wants it
- The metric is an **average**, not a per-string measurement — misleading
- Most operators care about **actual** string current/power, not a theoretical average
- Confuses comparison between plants of different sizes

### Current code state (verified 2026-04-23)

Column still exists in 3 places:

| File | Line | What |
|---|---|---|
| `app/api/dashboard/analysis/string-level/route.ts` | 190 | Backend response includes `kw_per_string: kwPerString` |
| `app/api/admin/analysis/string-level/route.ts` | 228 | Admin backend response includes same field |
| `components/shared/StringLevelTable.tsx` | 14 | Table type declares `kw_per_string: number \| null` |

**Note:** On 2026-04-22 we previously documented this column as removed from the analysis page and replaced with a "Nominal DC Capacity (IEC 62446-1)" header card. The code evidence above shows the column is **still there** — the earlier change may have been a partial removal (header card was added but the column wasn't actually dropped, or it was re-added, or our CHANGELOG was wrong about it).

### Proposed solution

1. Remove `kw_per_string` field from both API route responses (dashboard + admin)
2. Remove `kw_per_string` from the TypeScript type + table column in `StringLevelTable.tsx`
3. Remove any CSV export column that refers to it (`components/shared/ExportButton.tsx` — verify)
4. Update `CHANGELOG.md` to accurately record the removal
5. Verify nothing else references the field (grep again after changes)

### Files to touch

- `app/api/dashboard/analysis/string-level/route.ts`
- `app/api/admin/analysis/string-level/route.ts`
- `components/shared/StringLevelTable.tsx`
- `components/shared/ExportButton.tsx` (verify)
- `CHANGELOG.md`

### Complexity

~1 hour. Pure deletion + type cleanup.

### Risk

🟢 **Low.** Nothing else depends on this field in the UI. Safe to remove.

### Dependencies

None.

### Open questions

None — client is unambiguous.

### Status

🔴 **TODO.**

---

## Item 2 · Native inverter faults from vendor APIs

### Verbatim
> *"Routine faults of inverter to be populated jo api ma atay hain and apps ma b show hty hain"*

### Translation (Roman-Urdu → English)
*"Routine faults of inverter to be populated — that come in the API and are also shown in the [vendor] apps."*

### What it means

Each of the 4 inverter vendor APIs we integrate with exposes **native fault/alarm codes** that the inverter hardware itself raises. Examples:

- Grid voltage deviation
- DC overvoltage / undervoltage
- Insulation resistance low
- Over-temperature
- Fan fault
- Communication failure
- Arc fault detection
- Reverse polarity

These appear natively in the vendor's own mobile apps (FusionSolar app, SolisCloud app, Growatt ShinePhone, Sungrow iSolarCloud). Customers already see them there and trust them.

**The client wants:** display these vendor-native faults inside SPC's dashboard alongside (or as a new section complementing) our own 7 diagnostic classes.

### Why the client wants this

- Customer doesn't want to open 4 different vendor apps to see inverter hardware alarms
- SPC should be a "single pane of glass" — all information about a plant's health in one place
- Vendor-native faults are often more specific than our derived faults (e.g., "IGBT temperature exceeded" is more actionable than our generic "degradation detected")
- Reinforces the "Pakistan's first unified multi-brand monitoring" positioning

### Current code state (verified 2026-04-23)

We have 4 vendor client files:
- `lib/huawei-client.ts`
- `lib/solis-client.ts`
- `lib/growatt-client.ts`
- `lib/sungrow-client.ts`

None of them currently fetch fault/alarm data. All 4 fetch only:
- Plant list
- Device (inverter) list
- String-level measurements (voltage / current / power / timestamp)

### Proposed solution

1. **Research each vendor's fault/alarm API endpoint.** Each has one; documented API spec:
   - Huawei FusionSolar: `/rest/getAlarmList` or similar (NorthBound API)
   - SolisCloud: alarm endpoint in Solis API docs
   - Growatt OpenAPI: `alarm/list` endpoint
   - Sungrow iSolarCloud: alarm endpoint
2. **Extend each vendor client** with a `fetchAlarms(deviceId, since)` method
3. **Add a new DB table** `inverter_alarms`:
   ```
   id | device_id | plant_id | vendor_code | vendor_label | severity | raised_at | cleared_at | raw_payload
   ```
4. **Extend the poller** to fetch alarms every 5 min (alongside string measurements), upsert into the new table
5. **Display them in the UI** — 2 options:
   - **Option A:** New section on plant detail "Inverter Alarms (from vendor)" — separate from our "Fault Diagnosis" section
   - **Option B:** Merge into the existing Alerts tab with a source badge (e.g., "Source: Huawei")
6. **Cross-reference:** if SPC also detected a fault class for the same string at the same time, link them — "Our detection: loose cable · Vendor alarm: DC cable continuity failure" — reinforces credibility

### Files to touch

- `lib/huawei-client.ts` — add `fetchAlarms()`
- `lib/solis-client.ts` — add `fetchAlarms()`
- `lib/growatt-client.ts` — add `fetchAlarms()`
- `lib/sungrow-client.ts` — add `fetchAlarms()`
- `lib/poller-utils.ts` — new `syncAlarms()` helper
- `scripts/run-poller.ts` — add alarm polling to the every-5-min cycle
- `prisma/schema.prisma` — new model `inverter_alarms`
- `app/api/plants/[code]/alarms/route.ts` — new API endpoint
- `app/api/alerts/route.ts` — optionally merge vendor alarms into alert feed
- `components/shared/InverterAlarmsPanel.tsx` — new component
- `components/shared/PlantDetailView.tsx` — render the new panel
- `CHANGELOG.md`

### Complexity

**~1–2 days (8–16 hours).** Breakdown:
- Vendor API research + test calls: ~3 h
- Add `fetchAlarms` to 4 clients: ~3 h (45 min each + testing)
- DB schema migration + poller integration: ~2 h
- New API route + component: ~3 h
- Testing against real vendor data: ~3 h

### Risk

🟡 **Medium.** Each vendor API has quirks:
- Huawei requires a separate NorthBound login session
- Solis has aggressive rate limits
- Growatt returns alarms in different formats for different device types (MAX vs SPH-S)
- Sungrow requires signed API requests (same HMAC signature used for measurements)

Also:
- Vendor alarm APIs sometimes return tens of alarms per inverter — we need to dedupe, persist across polls, and not spam the dashboard
- Clearing logic: a cleared alarm should disappear from "active" view

### Dependencies

None — independent workstream.

### Open questions (need client + Ali)

- **A/B for display:** Does client want alarms in a **separate "Vendor Alarms" section** (clear separation) or **merged into existing Alerts** with a source badge?
- **Severity mapping:** Each vendor has its own severity taxonomy (e.g., Huawei uses Fatal / Critical / Minor / Warning). Do we map to our 3-level (Critical/Warning/Info) or keep vendor-native severity?
- **Historical backfill:** Show only alarms raised after SPC installation, or attempt to fetch historical alarms since the plant was first connected?
- **Alarm retention:** How long to keep cleared alarms visible? (Suggest: 30 days in active view, forever in DB)

### Status

🔴 **TODO · Awaiting 2 client clarifications + 2 Ali decisions** (see open questions above).

---

## Item 3 · Remove the word "Open Circuit"

### Verbatim
> *"The word open circuit should not be used, it should be removed, however, we can keep the string"*

### What it means

The phrase "Open Circuit" (and any near-variant) should not appear in **user-facing UI text**. However:
- The **internal enum value** `OPEN_CIRCUIT` stays (it's a valid technical classification — voltage present but 0 A)
- The **detection logic** stays (we still detect this state)
- Only the **display label** changes

### Why the client wants this

- "Open circuit" is electrical-engineering jargon
- For non-EE customers, "open" sounds like "not broken, ready to use" — opposite of the real meaning (a break in the wire)
- In some contexts (switches, relays), "open" means "off" — ambiguous
- The client wants clearer everyday language

### Current code state (verified 2026-04-23)

`StringStatus.OPEN_CIRCUIT` enum: defined in `lib/string-health.ts:174`, should stay.

"Open Circuit" as **display text** appears in:

| File | Line | Context |
|---|---|---|
| `lib/design-tokens.ts` | 87 | `label: 'Open Circuit'` in STATUS_STYLES lookup |
| `components/shared/StringHealthMatrix.tsx` | 92, 146 | Hover tooltip + status label |
| `components/shared/CurrentDeviationChart.tsx` | 47 | Chart legend |
| `components/shared/InverterDetailSection.tsx` | 655 | Explanatory card: *"Open Circuit — Voltage but 0A (wiring)"* |
| `components/shared/FaultDiagnosisPanel.tsx` | 50 | Fault cause: *"Open Circuit — No Current Flow"* |
| `components/shared/StatusBadge.tsx` | 9 | Badge key mapping (internal, but affects label through lookup) |

`lib/string-health.ts:169` has an English comment explaining the status — safe to keep (code comment, not UI).

### Proposed solution

1. **Pick a replacement label** (client or Ali decision — see open questions)
2. **Update the single source of truth:** `lib/design-tokens.ts` `STATUS_STYLES['open-circuit'].label` → replacement label
3. **Update inline display text** in the 5 shared components (InverterDetailSection, FaultDiagnosisPanel, StringHealthMatrix, CurrentDeviationChart, and anywhere else)
4. **Keep enum value `OPEN_CIRCUIT`** in `string-health.ts` — do not change
5. **Update the validator** if it enforces any constraint on status strings
6. **Add a test** in the validator that blocks reintroduction of "Open Circuit" as a UI string

### Replacement label options (to pick from)

| Option | Pros | Cons |
|---|---|---|
| **"No Current"** | Short, accurate, everyday language | Slightly vague |
| **"Broken Circuit"** | Clearer than "open" — sounds like a fault | Could be confused with "circuit breaker" |
| **"No Flow"** | Very plain | Might sound like water |
| **"Disconnected"** | Clear | Conflicts with our existing "OFFLINE" status — ambiguous |
| **"Wiring Fault"** | Precise (the real root cause) | Assumes wiring is the issue, which we can't always verify |

**My vote:** **"No Current"** — shortest, matches the physical reality (voltage present, 0 amps).

### Files to touch

- `lib/design-tokens.ts`
- `components/shared/InverterDetailSection.tsx`
- `components/shared/FaultDiagnosisPanel.tsx`
- `components/shared/StringHealthMatrix.tsx`
- `components/shared/CurrentDeviationChart.tsx`
- `components/shared/StatusBadge.tsx` (internal key — may not need change)
- `scripts/validate-centralized.sh` (add new check)
- `CHANGELOG.md`

### Complexity

~2 hours. Mostly text replacement + test.

### Risk

🟢 **Low.** Display-only change. Enum stays.

### Dependencies

None.

### Open questions (need Ali decision)

- **Replacement label:** "No Current" / "Broken Circuit" / "No Flow" / "Disconnected" / something else?

### Status

🔴 **TODO · Awaiting 1 Ali decision** (replacement label).

---

## Item 4 · Remove donut/pie chart

### Verbatim
> *"Donut chart. Pie chart for healthy string, abnormal and critical strings must be removed"*

### What it means

A donut or pie chart showing the breakdown of strings by health status (healthy / abnormal / critical) should be removed.

### Why the client wants it (inferred)

- Pie/donut charts are poor at comparing similar-sized slices
- Bar charts or numeric tiles convey the same info more clearly
- Possible visual clutter

### Current code state (verified 2026-04-23)

**⛔ NOT FOUND IN CODEBASE.**

- No component uses `PieChart` from recharts
- No component contains `Donut` in its name
- No SVG `<circle>` with `stroke-dashoffset` (the circular-progress / ring pattern)
- The closest visualizations we have:
  - `StringHealthMatrix.tsx` — a grid of coloured cells (NOT a donut)
  - `StringBarChart.tsx` — a bar chart
  - Progress bars in PlantHeader / AlertsInsightPanel (linear, not circular)
  - Orbital arcs on the landing page (decorative, not data)

### Possible explanations

1. **Already removed:** we may have removed it in an earlier session; the client is confirming
2. **Client confusion:** client may be referring to another visualization (e.g., the coloured grid in StringHealthMatrix) and calling it a "donut"
3. **Client memory:** client may have seen a competitor's app or a mockup and confused it with SPC
4. **Hidden component:** there may be a donut chart we haven't spotted — e.g., in an admin page we didn't check

### Proposed solution

1. **First — confirm with client which exact screen / page the donut is on.** Don't guess.
2. Take screenshots of the plant detail page, the main dashboard, and the admin area; share with client; ask: *"Please circle the chart you want removed."*
3. Once identified, remove the component.
4. If it's not in our product (client confusion), document that in a reply and move on.

### Files to touch

Unknown until client clarifies.

### Complexity

- If component exists: ~30 min (deletion + layout cleanup)
- If it doesn't: ~0 min (just reply to client)

### Risk

🟢 **Very low either way.**

### Dependencies

None, but **blocked on client clarification**.

### Open questions (need client)

- **Which screen / page is the donut on?** Share a screenshot or URL path.

### Status

⛔ **BLOCKED — awaiting client clarification.** Send the current plant-detail + dashboard screenshots to the client and ask them to circle the chart.

---

## Item 5 · `used` / `unused` / `undershade` tags at Super Admin level

### Verbatim
> *"used, unused, undershade must be created at Sup Admin level at the moment, may be in future we can push to lowe level of organization level, I suggest keeping both options alive for 2 weeks till we get some data"*

### What it means

Three NEW **tags** (classifications) to apply to strings:

| Tag | Meaning | Alert behaviour |
|---|---|---|
| **used** | String is active, in normal service | Normal monitoring and alerts |
| **unused** | String is intentionally disconnected — not installed, capped, decommissioned | **Suppress ALL alerts** — it's supposed to be silent |
| **undershade** | String has known permanent/chronic shading (tree, building, adjacent structure) | **Suppress critical alerts** — reduced output is normal, not a fault |

**Who can set these tags:**
- **Now:** Super Admin only (centralized control, prevents customers from silencing real faults through misuse)
- **Future:** Push down to Organization-level admins

**Client's suggestion:** *"I suggest keeping both options alive for 2 weeks till we get some data"* — we read this as: **build BOTH levels of tagging from day 1 (Super Admin + Org Admin can set)**, run for 2 weeks, observe usage, then decide which level to keep.

### Why the client wants this

- Today, a genuinely disconnected or permanently shaded string generates endless CRITICAL alerts
- Operators are drowning in false positives
- These tags let someone say "this one is expected — stop alerting" **without** modifying the detection logic

### Current code state (verified 2026-04-23)

No tagging system exists today. Alerts are purely function of real-time measurement:
- `lib/poller-utils.ts` `generateAlerts()` classifies every active string every 5 min
- No allow-list or suppression mechanism
- Operators have no way to mark strings as "expected fault" or "decommissioned"

### Proposed solution

**Data model (new):**

```prisma
model string_tags {
  id             String   @id @default(uuid())
  plant_id       String   @db.VarChar(50)
  device_id      String   @db.VarChar(50)
  string_number  Int
  tag            StringTag
  set_by_user_id String?
  set_by_role    String   @db.VarChar(20)  // 'SUPER_ADMIN' or 'ADMIN'
  set_at         DateTime @default(now())
  note           String?  @db.Text

  @@unique([device_id, string_number])
  @@index([plant_id])
}

enum StringTag {
  USED
  UNUSED
  UNDERSHADE
}
```

**Alert logic update (`lib/poller-utils.ts` `generateAlerts`):**

```typescript
const tags = await prisma.string_tags.findMany({ where: { plant_id } })
const tagMap = new Map(tags.map(t => [`${t.device_id}:${t.string_number}`, t.tag]))

for (const measurement of measurements) {
  const tagKey = `${measurement.device_id}:${measurement.string_number}`
  const tag = tagMap.get(tagKey)

  if (tag === 'UNUSED') continue // skip entirely — no alerts for unused strings
  if (tag === 'UNDERSHADE' && severity === 'CRITICAL') {
    severity = 'INFO' // downgrade critical to info for known-shaded strings
  }

  // ... existing alert logic
}
```

**UI — Super Admin tagging:**

- New page `/admin/plants/[plantCode]/string-tags`
- Table of all strings in the plant with current tag
- Dropdown per string: `Used (default)` / `Unused` / `Undershade`
- Optional note field explaining WHY the tag was set
- Audit log (who set it, when, note)

**UI — Organization Admin tagging (for the 2-week observation period):**

- On `/dashboard/plants/[plantCode]` — if the user has `ADMIN` role for the plant's organization
- Same dropdown, but tags set by ADMIN are distinguished from SUPER_ADMIN tags (for audit)
- After 2 weeks, review which level of users actually set tags, and decide

**Display:**

- Tagged strings show a pill on the plant detail page (e.g., "UNDERSHADE" in amber, "UNUSED" in grey)
- Fleet health calculations exclude UNUSED strings from denominators
- Heatmap shows tagged strings with a special marker

### Files to touch

- `prisma/schema.prisma` — add `string_tags` model + `StringTag` enum
- New migration (under our new Prisma migrations workflow, once we adopt it — for now, `prisma db push`)
- `lib/poller-utils.ts` — update `generateAlerts` to respect tags
- `lib/string-health.ts` — optionally add tag-related constants
- `app/api/admin/plants/[code]/string-tags/route.ts` — new API (Super Admin)
- `app/api/plants/[code]/string-tags/route.ts` — new API (Org Admin)
- `app/admin/plants/[plantCode]/string-tags/page.tsx` — new page
- `components/shared/StringTagManager.tsx` — new component
- `components/shared/StringLevelTable.tsx` — show tag pill
- `components/shared/PlantDetailView.tsx` — embed the tag manager for admins
- `scripts/validate-centralized.sh` — add checks for tag validity
- `CHANGELOG.md`

### Complexity

**~1–2 days (8–16 hours).**

- Data model + migration: ~2 h
- Alert logic update + test: ~2 h
- Super Admin UI + API: ~4 h
- Org Admin UI + API: ~3 h
- Tag display pills + fleet-health exclusion: ~2 h
- Testing with real plant data: ~2 h

### Risk

🟡 **Medium.**

- **Risk:** operator tags a real fault as `undershade` to silence alerts — critical fault goes unnoticed
  - Mitigation: require a note when tagging; surface tags in a "tagged strings" audit view
- **Risk:** fleet-health calculation breaks when we exclude UNUSED strings from denominators (off-by-one bugs)
  - Mitigation: extensive test on the query logic
- **Risk:** tags get stale — an operator marks something `undershade`, later the tree is cut down, alerts should resume but don't
  - Mitigation: add an optional `expires_at` on tags; surface "stale tag" UI

### Dependencies

None — independent workstream.

### Open questions (need client + Ali)

- **Tag expiration:** should tags automatically expire (e.g., after 6 months) to force periodic re-review?
- **Note requirement:** mandatory note when tagging, or optional?
- **Org Admin permission scope:** which roles get to tag? (ADMIN? MEMBER? SUPER_ADMIN?). Currently MEMBER = read-only — do we promote to tag-only-writes?
- **Bulk tagging:** "mark all 150 strings of this inverter as unused" — UX nice-to-have?
- **"Both options alive for 2 weeks" — confirmation:** is our reading correct that both Super Admin AND Org Admin can tag during observation?

### Status

🔴 **TODO · Awaiting 4 client / Ali decisions** (see open questions).

---

## Item 6 · Merge inverters under one login (site-level consolidation)

### Verbatim
> *"in few cases all inverters will be merged in 1 login by default where there is a logger installed at site, like in case of Qadir Solar, site where sungrow is installed. for other sites where each inverter has its own wifi device, then they will be communicationg different, but we need to merge them in a single, this is what super admin should be doing while making an organization account"*

### What it means

The client describes two physical-site scenarios:

#### Scenario A — Site with a central data logger

- One physical site has multiple inverters
- ONE data logger / gateway connects all inverters to the vendor cloud
- ONE vendor cloud login represents the whole site
- Example: Qadir Solar with Sungrow — 4 inverters + 1 Sungrow logger + 1 iSolarCloud login
- **In this case, our DB correctly has 1 plant with N devices under it.** No problem.

#### Scenario B — Site with per-inverter wifi dongles

- One physical site has multiple inverters
- EACH inverter has its OWN wifi dongle connecting it directly to the vendor cloud
- N separate vendor cloud logins (could even be different vendor brands!)
- Our DB today: N separate plants, one per credential set
- **Problem:** the customer sees N "plants" for ONE physical site — confusing, misleading fleet stats

#### What the client wants

A Super Admin should be able to **merge the N plants into a single physical-site record** when creating the organization. All dashboard views should roll up to the site level.

### Why the client wants this

- Operators think in terms of physical sites ("Mall of Multan", "Al-Rehman Textile"), not credentials
- Fleet stats (energy, health) should be site-level, not credential-level
- A "plant" in the vendor sense (= one login) is not what a "plant" means physically

### Current code state (verified 2026-04-23)

Our data model today:

```
Organization → plant_assignments → Plants → Devices → Strings
```

A `Plant` record corresponds to one vendor credential set. If a physical site has 4 wifi-dongle inverters (each with its own login), we have 4 `Plant` records for 1 physical site.

Pollers key off `Plant.credentials` so changing this requires care.

### Proposed solution

**Option A — New `Site` layer (clean, invasive)**

```
Organization → plant_assignments → Sites → Plants → Devices → Strings
```

- New `site` table: `{ id, organization_id, name, address, created_at, notes }`
- Plants get an optional `site_id` field
- If `site_id` is null → legacy single-site plant (today's default — works fine)
- If `site_id` is set → plant is part of a multi-login site, rolled up under the site
- Dashboard queries: group by `site` when available, fall back to `plant` otherwise
- Super Admin creates a site, assigns N plants to it
- Site name overrides plant names in the customer UI

Complexity: ~3-5 days.

**Option B — Simple alias (low-risk, non-invasive)**

- Add a `site_alias` or `group_name` column to `plant` table (nullable)
- Plants with the same `site_alias` are visually grouped in the UI
- No new table, no new model
- Backend queries stay plant-level; frontend does the grouping

Complexity: ~1-2 days.

**Option C — Physical site via assignment only (minimal)**

- Don't add any new schema
- Leverage the existing `plant_assignments` — multiple plants with the same organization ID and same "group label" are treated as one
- Super Admin assigns N plants to the same organization with the same `display_name`
- Frontend groups them by `display_name`

Complexity: ~4-8 hours, but most limited.

**My recommendation:** **Option A** — it's the only one that's truly correct long-term. Options B and C are quick fixes that create tech debt. Since this is a critical customer-facing model, doing it right once is better than doing it wrong three times.

### Files to touch (for Option A)

- `prisma/schema.prisma` — add `site` model, `plant.site_id` field
- Prisma migration (when we adopt migrations workflow)
- `lib/api-auth.ts` — update org/site membership checks
- All dashboard API routes — support site-level aggregation
- `app/dashboard/page.tsx` — group by site when available
- `app/dashboard/plants/[plantCode]/page.tsx` — show site breadcrumb
- `app/admin/organizations/[id]/page.tsx` — site CRUD
- `app/admin/sites/page.tsx` — new admin page for site management
- `components/shared/SiteCard.tsx` — new component
- Multiple existing components need a pass to support site-level grouping
- `CHANGELOG.md`

### Complexity

**~3-5 days (24-40 hours)** for Option A. Significantly less for Options B/C.

Breakdown:
- Data model + migration: ~3 h
- API surface updates (probably 15+ routes): ~8 h
- Dashboard/plant-detail/admin UI updates: ~12 h
- Site CRUD admin UI: ~4 h
- Testing across all scenarios: ~6 h

### Risk

🔴 **High.** This touches:
- Core data model (everything "plant" means is now "plant or site, depending")
- Every dashboard query
- Customer UX (what they call "my plant" may change label)
- Poller (no change — pollers key off plant credentials which are unchanged)
- Alerts (aggregation level changes)

Mitigations:
- Phased rollout: ship schema first, then gradually move UIs
- Feature-flag (once we have flags) the site-level aggregation
- Keep `site_id` nullable — existing single-site plants continue working unchanged
- Thorough testing with Qadir Solar (the named example) as a pilot

### Dependencies

- ⚠️ **Ideally done AFTER CI/CD is in place** — this is the highest-risk change we've shipped, and auto-rollback safety matters
- Requires decision on migration strategy (db push vs prisma migrations — see `CICD-PIPELINE-DESIGN.md` Phase 6)

### Open questions (need client + Ali)

- **Option choice:** A (proper site layer), B (alias), or C (assignment-based)?
- **Breadcrumb UX:** does the customer want to see "Mall of Multan" as the top-level name, with the 4 underlying plants hidden, or expandable?
- **Fleet health at site level:** how do we compute site-level fleet health when it has 4 plants with potentially 4 different vendor APIs?
- **Naming:** what is the user-visible term — "Site", "Location", "Facility", "Campus"?
- **When to ship:** immediately, or defer until CI/CD provides safer rollback?

### Status

🔴 **TODO · Awaiting 5 design decisions.** This is the biggest item on the list and the most impactful. Recommend scheduling a call with Reyyan + the client to align before scoping.

---

## 4. Priority matrix

How to triage the 6 items:

| # | Customer-visible impact | Effort | Risk | Dependencies | Recommended order |
|---|---|---|---|---|---|
| 3 | Medium (clarity) | 🟢 2 h | 🟢 Low | None | **1st — quick win** |
| 1 | Low (cleanup) | 🟢 1 h | 🟢 Low | None | **2nd — quick win** |
| 4 | Medium (UX declutter) | 🟢 30 min | 🟢 Low | Client clarification | **3rd — if exists, otherwise close** |
| 5 | **High (kills false positives)** | 🟡 1–2 days | 🟡 Med | 4 decisions | **4th — highest customer value** |
| 2 | **High (unifies inverter info)** | 🟡 1–2 days | 🟡 Med | 2 decisions | **5th — second-highest value** |
| 6 | **High (correct data model)** | 🔴 3–5 days | 🔴 High | CI/CD ideally in place first | **6th — schedule carefully** |

**Proposed execution order:**
1. **Sprint 1 (1 day):** Items 3, 1, 4 — quick wins, low risk, build trust with client
2. **Sprint 2 (1 week):** Item 5 OR Item 2 — pick whichever the client answers faster
3. **Sprint 3 (1 week):** The other of Item 5 / Item 2
4. **Sprint 4 (1-2 weeks):** Item 6 — requires fully resolved open questions + ideally CI/CD

---

## 5. Open questions that need answers before work starts

### From the client (5 questions)

| # | Question | For item |
|---|---|---|
| CQ1 | Please send a screenshot showing the donut/pie chart you want removed. | 4 |
| CQ2 | For item #2 (vendor faults), do you prefer a separate "Inverter Alarms" section or merged with our existing Alerts feed (with source badge)? | 2 |
| CQ3 | For item #2, do you want historical vendor alarms backfilled, or only new ones from today forward? | 2 |
| CQ4 | For item #5 (tags), should a mandatory note explain WHY a string is tagged unused/undershade? | 5 |
| CQ5 | For item #6 (site merging), what word do you prefer user-facing: "Site", "Location", "Facility", "Campus"? | 6 |

### From Ali (4 decisions)

| # | Decision | For item |
|---|---|---|
| AQ1 | Replacement label for "Open Circuit" — "No Current" / "Broken Circuit" / "No Flow" / "Disconnected" / other? | 3 |
| AQ2 | For item #5, do tags auto-expire after N months? If yes, what's N? | 5 |
| AQ3 | For item #5, what roles can tag? Confirm: SUPER_ADMIN always, ADMIN during 2-week observation, MEMBER never. | 5 |
| AQ4 | For item #6, pick the data-model approach: A (new Site table), B (alias), C (assignment-based). | 6 |

---

## 6. Decision log

As decisions get made, record them here with date and reasoning. Empty for now — fill in as we work through items.

| Date | Decision | Who | For item |
|---|---|---|---|
| — | — | — | — |

---

## 7. Status overview (live)

Update this section as items are completed. Currently:

- 🔴 **6 TODO**
- 🟡 **0 IN PROGRESS**
- 🟢 **0 DONE**
- ⛔ **1 BLOCKED (Item 4 — client)**
- ❓ **5 items awaiting client/Ali answers**

**Next action:** Send client CQ1–CQ5 + get Ali's answers to AQ1–AQ4. Once answered, start Sprint 1 (Items 3, 1, 4).

---

## 8. Change log (this document)

| Date | Change |
|---|---|
| 2026-04-23 | Document created · verbatim client message captured · all 6 items interpreted · current-code state verified in each item · 9 open questions listed · execution order proposed |

---

*Paired files:*
- `AUDIT.md` — risk register (these items will be added as H8a–H8f or similar once prioritised)
- `CHANGELOG.md` — one-line entry per item completion, linking back here
- `NEXT-STEPS.md` — may need to re-prioritise (this work is likely higher-priority than the CI/CD upgrade)
- `README.md` — add a link to this file under "Quick links for developers"
