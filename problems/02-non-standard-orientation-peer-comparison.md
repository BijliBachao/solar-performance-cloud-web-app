# Problem 02 — Non-Standard Orientation Strings Get Falsely Flagged by Peer Comparison

**Status:** Documented · solution pending
**Documented:** 2026-04-30
**Severity:** **Medium-High — alert fatigue, missed real faults on heterogeneous installs**
**Reported by:** Ali (during real-data review of factory/industrial sites)

---

## One-line summary

Industrial and commercial installs often have panels at non-standard orientations — east-facing, west-facing, walls (90°), unusual tilts (e.g., 145°), partial shade. These strings produce **less than south-facing peers by design**. SPC's current peer-comparison logic flags them as faulty every day, generating endless WARNING/CRITICAL alerts even though they are operating exactly as installed.

---

## What the customer sees today

Plant: a textile mill with panels installed across multiple roof sections — main south-facing roof + a smaller east-facing roof + a west-facing wall section.

Inverter has 12 strings:
- PV1–PV6 → south-facing roof (optimal)
- PV7–PV9 → east-facing roof (peaks early morning, less afternoon)
- PV10–PV12 → west-facing wall (90° tilt, partial shade in afternoon)

What SPC shows during a typical noon poll:

```
PV1   98%   ✓ Healthy
PV2   96%   ✓ Healthy
PV3   97%   ✓ Healthy
PV4   95%   ✓ Healthy
PV5   96%   ✓ Healthy
PV6   97%   ✓ Healthy
PV7   62%   ⚠ WARNING — "35% below peers"          ← east, peaked at 9 AM
PV8   58%   ⚠ WARNING — "39% below peers"          ← east
PV9   65%   ⚠ WARNING — "32% below peers"          ← east
PV10  31%   ⛔ CRITICAL — "67% below peers, possible shading"  ← west wall
PV11  28%   ⛔ CRITICAL — "70% below peers"        ← west wall
PV12  29%   ⛔ CRITICAL — "69% below peers"        ← west wall
```

**Customer's reaction:** "Yes, those are the wall panels. They're SUPPOSED to produce less. Why is SPC alerting me on them every day?"

Engineer: "Because the system compares them to the south-facing peers and treats any drop as a fault."

Customer: "Then I should ignore the dashboard."

Same alert fatigue as Problem 01 — but here the strings are real and producing usefully. They're just **not comparable** to their inverter siblings.

---

## What's actually happening (physics, not bug)

Solar panels produce based on the **angle of incidence** between the sun and the panel surface. Installation angle radically changes the production profile:

| Orientation | Expected output (relative to south, optimal-tilt) | Peak hour |
|---|---|---|
| South-facing, optimal tilt | 100% (baseline) | Solar noon (~12:30 PKT) |
| East-facing roof, optimal tilt | 75–85% daily total, but ~140% at 9 AM | Mid-morning |
| West-facing roof, optimal tilt | 75–85% daily total, but ~140% at 3 PM | Mid-afternoon |
| Vertical wall (90° tilt), south-facing | 50–60% daily total | Spread, low peak |
| Vertical wall, east or west | 35–50% daily total | Heavily skewed |
| Under partial shade (deliberate) | Variable, 40–70% of unshaded | Time-dependent |
| Carport / canopy at unusual tilt | Variable | Variable |

**These are intentional installation choices** — the customer wanted some generation from a roof section that's not ideal because the alternative was zero generation from that section.

A vertical-wall panel producing 50% of a south-facing peer at noon is **at 100% of its own design output**. There's no fault. The panel is doing its job.

---

## How current SPC code misbehaves

### Step 1 — Peer pool is "all strings on this inverter"

`lib/string-health.ts` `leaveOneOutAvg(measurements, exclude)`:
- Computes the average of all "active" strings on the same inverter, excluding the one being judged
- Treats every string as identical — no orientation, no tilt, no shading awareness

### Step 2 — Peer comparison hammers non-standard strings

`classifyRealtime(current, voltage, peerAvg, stale)`:
- A wall string at noon produces ~50% of south-facing peer current
- Gap of 50% triggers **CRITICAL** classification (threshold `GAP_CRITICAL = 50`)
- `generateAlerts()` in `lib/poller-utils.ts` then logs an alert

### Step 3 — Alerts fire daily, every cloudy day even worse

- On clear days: predictable critical/warning state for the off-orientation strings
- On cloudy days: the gap narrows but stays large enough to keep firing
- Auto-resolution never happens because the "fault" never goes away — it's the design

### Step 4 — Aggregates penalize the plant unfairly

- Daily health scores in `string_daily` show low values for these strings
- Plant-level "% healthy" metric drops because of strings that are physically OK
- Monthly reports look worse than reality
- Customer comparison ("plant A vs plant B") is invalid because it doesn't account for installation profile

---

## Concrete examples seen in production

### Example 1 — Faisalabad textile mill

8 inverters across 3 roof sections:
- Main mill roof: 6 inverters, all strings south-facing
- Office building roof: 1 inverter, mixed east/south
- Worker housing wall: 1 inverter, all strings on a 90° south-facing wall

The worker-housing inverter shows **all 12 strings in CRITICAL state** all day, every day. Customer told the project engineer "ignore that inverter." After 3 months, customer ignored ALL alerts from ALL inverters. **A real cable fault on the office roof inverter went undetected for 6 weeks.**

### Example 2 — Lahore housing society

Society installed panels everywhere they could fit:
- Common-area roof: 60% of capacity, south-facing
- East-facing apartment-block roofs: 30% of capacity
- Carport canopies (slight north tilt): 10% of capacity, suboptimal

The carport strings show 35–45% of peer average. SPC says "shading or fault." Reality: they're producing exactly what their installer expected.

### Example 3 — Multan factory wall installation

10 vertical-wall panels installed because the rooftop was at structural capacity. They produce ~30% of rooftop peer current at noon. SPC fires CRITICAL daily. Customer's chief electrician: "I told the SPC team six times those are wall panels."

---

## Why this is hard to fix without explicit metadata

SPC cannot infer orientation from the data alone:

| Heuristic that doesn't work | Why |
|---|---|
| "If a string consistently produces less, it's a different orientation" | Real degradation also produces this signature. False negatives (we'd hide real faults). |
| "Peak hour analysis: east strings peak early, west late" | Requires multiple days of clean data + statistical inference. Slow, brittle, doesn't help on day 1. |
| "Compare current to historical curve for that string" | Helps with degradation but not with peer-comparison framing. The string still gets compared to better peers. |
| "Use plant location + Google Sun Position API to model expected output" | Heavy infrastructure, requires accurate roof orientation data we don't have anyway. |

The reliable source is, again, **the human installer**. Whoever physically installed the system knows: "PV1–PV6 are south, PV7–PV9 are east, PV10–PV12 are wall-mounted." We need to capture that knowledge.

---

## Customer impact

| Effect | Severity |
|---|---|
| Persistent CRITICAL/WARNING state on real, healthy strings | High |
| Plant-level health % unfairly low | Medium-High — affects sales pitches and SLA reporting |
| Alert fatigue → real faults missed (Example 1) | **Critical** |
| Customer says "ignore that inverter" → loses confidence in the product | High |
| Manual workarounds (engineer maintains a "ignore list" in their head) | Medium — process risk, knowledge loss when staff leaves |
| Comparison reports between plants are invalid (different orientation mixes) | Medium |
| Cannot offer string-level guarantees on industrial installs | Medium — limits commercial pricing |

---

## Constraints — what we MUST NOT break when fixing this

1. **Default behavior must not change.** A string with no orientation metadata should be treated like today (assume south-facing, peer-compared). Admin opts in to flagging non-standard.
2. **Don't silently hide alerts.** A flagged-as-different-orientation string must still surface in SOME way — maybe a different category ("Operating as designed · low expected output"), not invisibly suppressed.
3. **Keep raw measurements untouched.** `string_measurements` records all data. Filtering happens in alerts/aggregates.
4. **Don't break the existing health score formula.** The fix is additive — different scoring path for flagged strings, original scoring for unflagged.
5. **Reversibility / auditability.** Marking a string non-standard must be reversible from admin UI, and every change tracked (`updated_by`, `updated_at`).
6. **Org users see context, not confusion.** When showing a non-standard string on the org dashboard, label it clearly ("east-facing — expected to be lower than south peers") rather than hiding it.

---

## Open questions to resolve before solutioning

These need to be decided WITH the user before writing code:

1. **Model choice — flag or group?**
   - **Option A** — single boolean `exclude_from_peer_comparison: true`. Simple. Such strings drop out of peer pool entirely. Their fault detection falls back to absolute (Phase 2 PR) or none.
   - **Option B** — `group_key: string`. Strings group by tag (e.g., `"east-roof"`, `"west-wall"`). Peer comparison runs within each group only. More flexible but more code + UI complexity.
   - User leaned toward starting with A — confirm.
2. **Vocabulary** — `orientation`? `installation_profile`? `peer_group`? `excluded_from_peer_comparison`? Pick one and stay consistent.
3. **What replaces peer comparison for excluded strings?**
   - Leave them with **no fault scoring** until Phase 2 PR is built (couples with task #96).
   - OR fall back to historical self-comparison ("today's output vs. this string's last 30 days") — more code, possibly more useful.
4. **Visibility on org dashboard** — when a string is excluded from peers, do org users:
   - See it with a "operating as designed" label?
   - See it but in a separate section ("non-standard strings")?
   - Not see it at all (treated like unused — but it IS producing real energy)?
5. **Reporting impact** — should monthly reports show plant health with and without non-standard strings? The "real" health % is more meaningful when you exclude wall-mounted panels.
6. **Who can flag?** SUPER_ADMIN only (matches Phase 1)? Or extend to ORG_ADMIN for self-managed plants?
7. **Retroactive alerts** — when admin flags PV10–PV12 as non-standard, do existing CRITICAL alerts for those strings get auto-resolved? Or stay in history?

---

## Where the solution will land (rough pointers — actual code in PLAN doc later)

The fix builds on Phase 1's `string_configs` table. Same admin page. Just new fields.

- `prisma/schema.prisma` — add column(s) to `string_configs`:
  - For Option A: `exclude_from_peer_comparison Boolean @default(false)`
  - For Option B: `peer_group String? @db.VarChar(50)` (nullable; null = default group)
- `lib/string-health.ts` — `leaveOneOutAvg()` and peer-pool helpers must filter by used + same-group
- `lib/poller-utils.ts` `generateAlerts()` — skip / re-route alerting for excluded strings
- `app/api/plants/[code]/strings/route.ts` — return the orientation flag/group on each string
- `app/api/admin/plants/[code]/strings-config/route.ts` — extend GET + PUT to handle the new fields
- `app/admin/plants/[plantCode]/strings/page.tsx` — add column(s) for orientation flag, plus a bulk action "mark these strings as east-facing peer group"
- `components/shared/StringComparisonTable.tsx` — render a small label (chip) on flagged strings, e.g., "east-roof" or "non-standard"
- `string_daily` aggregations — when computing `health_score`, scope to peer group

---

## What this problem will look like once solved (Option A simple flag)

Same Faisalabad textile mill, same worker-housing inverter. After admin marks PV1–PV12 as "non-standard / wall installation":

```
PV1   53%   ◯ Non-standard (wall) — operating as designed
PV2   52%   ◯ Non-standard (wall) — operating as designed
...
PV12  51%   ◯ Non-standard (wall) — operating as designed
```

Inverter health: **N/A** for peer comparison; instead shown as "12 strings, non-standard install, no peer comparison applied". Active alerts: **0** (because no peer-comparison faults are computed). Customer trust: restored.

When Phase 2 (Performance Ratio) lands (task #96 + `PLAN-performance-ratio-phase2.md`), these strings get a PR % computed against their **own** nameplate × derated PSH for their orientation. Then they get real, fair fault detection — but it's never peer-relative.

---

## How this couples with other open work

- **Problem 01 (unused strings)** — same admin page, same `string_configs` table, same general pattern. Build them together OR sequence Problem 01 first (simpler). Fix one, then add the orientation field.
- **Phase 2 PR (task #96)** — the right home for non-peer fault scoring. Excluded-from-peer strings need the PR scoring as their replacement.
- **Sensor-fault filter (task #105)** — orientation-aware filtering becomes possible with this metadata.

---

## References

- Plan doc (to be written): `PLAN-string-orientation-grouping.md` (does not exist yet)
- Phase 1 panel-config feature (deployed): commit `0575bd7`
- Existing `string_configs` table: `prisma/schema.prisma`
- Admin config page: `app/admin/plants/[plantCode]/strings/page.tsx`
- Related backlog tasks: `BACKLOG.md` #96 (Phase 2 PR — provides absolute scoring fallback), #105 (sensor-fault filter)
- Related problem: `01-unused-strings-electrical-noise.md` (different problem, overlapping fix surface)
