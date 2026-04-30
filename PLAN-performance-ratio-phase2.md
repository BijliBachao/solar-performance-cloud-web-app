# PLAN — Performance Ratio (Phase 2 of String Panel Config)

**Status:** Not built yet · Documented 2026-04-30 · Baseline commit `9167d0f`
**Prerequisite:** Phase 1 (string_configs table + admin page) — **deployed**, but admins have not filled in panel configs yet
**Owner:** Ali · `ai@right2fix.com`

---

## Research-validated approach

This plan was validated against industry practice on 2026-04-30 — see [`RESEARCH-orientation-handling.md`](./RESEARCH-orientation-handling.md). Key findings:

- **IEC 61724-1 (PV system performance monitoring) standardizes the PR formula**: `PR = Y_f / Y_r` where Y_f = actual kWh / nameplate kWp, Y_r = POA irradiance / 1 kW/m² STC. The reference yield depends on POA (Plane-of-Array), not GHI — which is the right way to score wall/east/west strings fairly.
- **SPC's `nameplate_kwp = panel_count × panel_rating_w / 1000`** matches the standard. The formula in this plan is correct.
- **Fixed PSH = 5.5 (Phase 2 Small)** is acceptable as a Class C / free-tier-baseline approximation. Combined with Phase B's `exclude_from_peer_comparison` flag, this puts SPC at parity with FusionSolar Lite and Sunny Portal free.
- **Upgrade path to industry baseline** (Phase 2 Medium / Large): integrate **PVGIS TMY** (free, EU JRC, lat/lon-aware) for monthly expected yield, or **Open-Meteo** (free at SPC's volume) for live daily irradiance, or **Solcast** (paid, ~$50–200/mo) for warranty-grade. PVGIS TMY first when a client demands more than fixed PSH.
- **Self-comparison** (string vs own 30-day history) is the industry-standard secondary metric (SolarEdge "Energy Profile Anomaly", SMA "Specific Yield Trend"). Optional Phase 2 v1.5 enhancement; lower priority once PR is live.

## TL;DR

SPC's current fault detection has a **blind spot**: it compares each string only to its neighbors on the same inverter. If every string on an inverter is equally bad, SPC says they're all healthy. They look normal vs each other but they're all underperforming vs what the panel manufacturer promised.

Phase 2 fixes this by adding a second yardstick: **nameplate**. Once an admin enters panel info for a string (count × watts = nameplate kWp), we can compute Performance Ratio (PR) = actual kWh / theoretical kWh × 100%. That gives **absolute health, not relative**.

The gap is then expressed in **rupees per day** so the client can act on it.

---

## 1. The problem — explained in plain words

### The student analogy

Imagine 5 students in a class. The test was out of 100 marks.

- Student A scored 50
- Student B scored 50
- Student C scored 50
- Student D scored 50
- Student E scored 50

If they only compare with each other, they all think "I'm normal — I scored the same as my friends." None of them thinks they failed.

But the test was out of 100. They all failed.

> **The teacher needs the absolute reference (100), not just the peer comparison (50 vs 50).**

### The same problem in solar

Imagine an inverter with 12 strings on a Pakistani rooftop. All 12 strings have not been cleaned in 6 months — they're equally dirty.

- PV1 produces 18 kWh/day
- PV2 produces 18 kWh/day
- ...
- PV12 produces 18 kWh/day

SPC's current logic says: "Each string is at 100% of its peers. Inverter is healthy."

But the panels are 8 × 550W per string = 4.4 kWp nameplate each. With Pakistan's 5.5 peak-sun-hours per day, each string SHOULD make ~24 kWh/day.

> **Every string is silently losing 6 kWh/day. Across 12 strings = 72 kWh/day = ~PKR 14,400/day. The customer doesn't know.**

This is the blind spot.

---

## 2. What's currently wrong (the implementation gap)

### Current implementation — peer comparison only

| File | Logic |
|---|---|
| `lib/string-health.ts` | Defines `classifyRealtime(current, voltage, peerAvg, stale)` — classifies a string as NORMAL / WARNING / CRITICAL based on **peer average** |
| `lib/poller-utils.ts` | `generateAlerts()` fires alerts when string current is more than 25%/50% below the **inverter peer average** |
| `app/api/plants/[code]/strings/route.ts` | Returns `gap_percent` = how much each string is below the peer average |
| `string_daily.health_score` | Computed against **peers**, not nameplate |
| `string_daily.performance` and `availability` | Computed from peer-relative data |

### What's missing

There is **no comparison against nameplate** anywhere in the codebase. The codebase has never had nameplate data — until Phase 1 added the `string_configs` table.

Phase 1 (already deployed in commit `0575bd7`):

```
model string_configs {
  device_id      String   @db.VarChar(50)
  string_number  Int
  panel_count    Int
  panel_make     String?  @db.VarChar(100)
  panel_rating_w Int?
  ...
  @@id([device_id, string_number])
}
```

So we now collect: panels per string, watts per panel.
But we don't yet **use** that data anywhere. The "Panels" column on `/dashboard/plants/[code]` displays it as static text only.

### Why this is "wrong"

Not technically wrong — just **incomplete**. The peer-comparison alerts work fine for catching one bad string out of many. They cannot catch:

- Fleet-wide soiling (all strings equally dirty)
- Inverter-wide degradation (panels aging together)
- Persistent under-spec installs (e.g., wrong tilt angle since day 1)
- Underperformance vs warranty claims to manufacturer

For these, you need an **absolute** yardstick, not a relative one.

---

## 3. The Phase 2 fix — what we add

Add a **second yardstick** alongside peer comparison. Don't replace peer comparison — keep it. **Show both metrics.**

### Two yardsticks, one dashboard

| Yardstick | Question it answers | Catches |
|---|---|---|
| **Peer gap %** (current) | "Is this string worse than its siblings?" | One bad string in a healthy inverter |
| **Performance Ratio %** (new) | "Is this string close to its nameplate?" | Whole-fleet soiling, aging, install errors |

### The new metric: Performance Ratio

```
Nameplate kWp     = panel_count × panel_rating_w / 1000
Theoretical kWh   = Nameplate kWp × Peak Sun Hours
Performance Ratio = (actual kWh / theoretical kWh) × 100
```

Industry standard. Defined in **IEC 61724-1** "Photovoltaic system performance — Part 1: Monitoring".

### What "Peak Sun Hours" means

A measurement that includes sun angle, daylight length, and cloud cover. Pakistan averages 5.5–6.5 hours/day annually:

| Region | Annual avg PSH |
|---|---|
| Punjab (Lahore, Faisalabad, Multan) | 5.5–5.8 |
| Sindh (Karachi, Hyderabad) | 5.8–6.2 |
| KPK (Peshawar, Mardan) | 5.0–5.4 |
| Balochistan (Quetta, Gwadar) | 6.0–6.5 |

We start with a **fixed 5.5 PSH** for everyone (Phase 2 v1). Refine later if needed.

---

## 4. The math (worked example)

### Example string: "PV3 on Inverter 6 at Mall of Multan"

| Field | Value |
|---|---|
| Panel count | 8 |
| Panel rating | 550 W |
| Nameplate kWp | 8 × 550 / 1000 = **4.4 kWp** |
| Peak Sun Hours | 5.5 (Punjab) |
| Theoretical kWh today | 4.4 × 5.5 = **24.2 kWh** |
| Actual kWh today (from sensors) | **18 kWh** |
| **Performance Ratio** | 18 / 24.2 × 100 = **74%** |
| Gap | 24.2 − 18 = **6.2 kWh/day** |
| Gap in rupees (at PKR 50/kWh net-metered tariff) | 6.2 × 50 = **PKR 310/day** |
| Monthly loss | **PKR 9,300/month** |

### What the dashboard shows

```
PV3   8 × 550W · 4.4 kWp
      Peer gap: 12% below siblings
      PR: 74% of nameplate · losing PKR 9,300/month
```

The customer reads this and immediately knows whether to act.

---

## 5. Implementation plan

### Files to change (no schema changes — we have everything we need)

#### Backend (poller side)

**`lib/string-health.ts`** — add new constants and helpers:
```typescript
export const PEAK_SUN_HOURS_PAKISTAN = 5.5

export function nameplateKwp(panelCount: number, panelRatingW: number | null): number | null {
  if (!panelRatingW) return null
  return (panelCount * panelRatingW) / 1000
}

export function theoreticalKwh(nameplateKwp: number, peakSunHours = PEAK_SUN_HOURS_PAKISTAN): number {
  return nameplateKwp * peakSunHours
}

export function performanceRatio(actualKwh: number, theoreticalKwh: number): number | null {
  if (!theoreticalKwh || theoreticalKwh <= 0) return null
  return Math.round((actualKwh / theoreticalKwh) * 100)
}
```

**`lib/poller-utils.ts`** — `updateDailyAggregates()` already writes to `string_daily`. Optional: also write a `performance_ratio` column there — **but this requires a Prisma schema migration** and is not strictly needed if we compute PR on read.

**Recommendation:** compute PR on read (in API), not on write (in poller). Simpler. No schema change. Keeps `string_daily` as raw data.

#### Backend (read API)

**`app/api/plants/[code]/strings/route.ts`** — already LEFT JOINs `string_configs` (Phase 1). Add PR fields per string:
```typescript
// For each string, given config + actual energy_kwh:
const npKwp = nameplateKwp(cfg.panel_count, cfg.panel_rating_w)
const theoretical = npKwp ? theoreticalKwh(npKwp) : null
const pr = (theoretical && string.energy_kwh)
  ? performanceRatio(string.energy_kwh, theoretical)
  : null

// Add to response:
{
  ...stringRow,
  config: { panel_count, panel_make, panel_rating_w, nameplate_w, nameplate_kwp: npKwp },
  performance_ratio: pr,                        // 0–100, nullable
  theoretical_kwh_today: theoretical,           // nullable
  kwh_lost_today: theoretical && string.energy_kwh
    ? Math.max(0, theoretical - string.energy_kwh)
    : null,
}
```

**`app/api/dashboard/analysis/string-level/route.ts`** — same pattern, add PR column to per-string analysis rows. **Do not touch the kWh column** (user requirement — kWh stays as trapezoidal-integrated real generation).

#### Frontend

**`components/shared/StringComparisonTable.tsx`** — already shows the "Panels" column. Add a **PR pill** next to (or replacing) the existing peer-gap pill:
```
PV3  |  8 × 550W · 4.4 kWp  |  PR 74%  ·  PKR 9,300/mo loss  |  [peer gap: 12%]
```

**`components/shared/InverterDetailSection.tsx`** — surface inverter-level PR (avg of strings on that inverter) at the top of the section, next to the existing health %.

**`/dashboard/analysis` table** — when re-doing this section (carefully, after the previous reverts), the **Pattern**: PV cell shows panel summary inline; **add** a separate small PR number below or beside it.

### What NOT to change

- ❌ **Do NOT touch the `kWh` column** anywhere. It's trapezoidal-integrated actual generation. Sacred. (User said this multiple times.)
- ❌ **Do NOT remove peer comparison alerts.** They still catch one-bad-string scenarios. Keep both metrics side by side.
- ❌ **Do NOT auto-modify `string_daily.health_score`.** That field is already used everywhere; changing its formula will reorder existing dashboards. PR is a **new field**, displayed alongside.

---

## 6. Three implementation sizes (tradeoffs)

| Size | What | Effort | Accuracy | When to use |
|---|---|---|---|---|
| **Small (recommended start)** | Fixed `PEAK_SUN_HOURS = 5.5` constant for all plants. Compute PR on API read. No schema change. | 1–2 hours | ±10% — good for trend direction, fleet-level monitoring | Now. Ship the metric, refine later |
| **Medium** | Per-region PSH lookup based on `plants.address` or lat/long. Day-of-year correction (Pakistan winter PSH ~4, summer ~7). Compute on read. | 3–4 hours | ±5% — defensible client report numbers | When clients ask "your number doesn't match my own calc" |
| **Large** | Subscribe to a real irradiance API (Solcast, Open-Meteo, NREL). Fetch actual sky/cloud data per plant per day. Cache in a new `irradiance_daily` table. | 6–8 hours code + ~$50/month for API + ongoing maintenance | ±2% — research-grade, IEC 61724 Class A | Only if a major client demands warranty-grade reports |

**My recommendation: start with Small.** Ship the metric with a clear "regional approximation, ±10%" label in the UI. Upgrade later if needed. Storage schema and UI patterns stay identical across all three sizes — only the `theoreticalKwh()` calculator changes.

---

## 7. Prerequisites — what must happen first

### MUST: Admin fills in panel configs

Phase 1 deployed the admin page at `/admin/plants/[code]/strings`. **No one has used it yet.**

Without panel configs:
- `nameplate_kwp` = null → `performance_ratio` = null
- The PR column will say "Not configured" for every row
- Phase 2 will be invisible

**The admin needs to:**
1. Sign in as SUPER_ADMIN
2. Go to `/admin/plants/[any-plant-code]/strings`
3. For each string: enter panel count (e.g. 8), make (e.g. Longi), rating in watts (e.g. 550)
4. Use the **"Apply to all strings"** bulk action when the plant has a uniform install (most do)

5 minutes per uniform-install plant. Maybe 30 minutes for a fleet of 48 plants.

### Should: Validate the data

We already have validation in the API endpoint (`StringConfigUpsertSchema`):
- panel_count: integer 1–100
- panel_rating_w: integer 50–1000

Edge cases the admin must understand:
- Mixed-vintage installs (one string has 8 × 550W + 2 × 450W) — current schema only supports uniform strings. Document this in the UI and tell admins to enter the most common panel and add a note.
- Strings that have been retired or replaced — admin should clear config when a string is no longer physically present.

---

## 8. Edge cases (don't break these)

| Edge case | Current behavior | After Phase 2 |
|---|---|---|
| String with no panel config | Health score still computes from peers | PR field = null. UI shows "—" or "Not configured". Peer-gap continues to work. |
| Cloudy day (low irradiance) | Peer gap unaffected (peers are also low) | PR drops to ~50% on a cloudy day. **This is correct** — but the customer needs to understand it's daily, not lifetime. UI should clarify "today" vs "30-day average". |
| Night / dawn | Currently filtered out via `ACTIVE_CURRENT_THRESHOLD` (0.1A) | Same — PR only computed for daylight hours (when actual_kwh > 0). |
| String temporarily offline | OFFLINE status in classify | PR = 0%. Trigger separate offline alert, not low-PR alert. |
| Fleet-wide drop (e.g., regional outage) | Currently invisible | All strings drop to similar PR — **this is what we want to detect**. Surface as a fleet-level alert: "12 plants below 70% PR today — possible regional cloud cover or grid issue." |
| Sun-tracking inconsistencies | Not modeled | Acceptable in Small size. Medium size adds day-of-year correction. |

---

## 9. How to verify it works

### Acceptance test

1. Admin signs into `/admin/plants/<plant>/strings` and sets one string to: 8 panels × 550W
2. Wait for next poller cycle (~5 min)
3. Open `/dashboard/plants/<plant>` — that string row should show:
   - "8 × 550W · 4.4 kWp" (already works in Phase 1)
   - **"PR 74%" or whatever the actual computed value is** (Phase 2 new)
   - "Losing X kWh/day" or "Losing PKR Y/day" (Phase 2 new)
4. Sanity check the math by hand: nameplate × 5.5 PSH = expected. Compare to actual kWh from sensors.
5. Check that strings WITHOUT configs show "—" or "Not configured" for PR — they don't break.

### Smoke test on prod after deploy

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://spc.bijlibachao.pk/api/plants/<plant_id>/strings"
# Expect 401 (auth required, but endpoint exists)
```

Then sign in as a real org user and confirm the new fields appear in the JSON.

---

## 10. Why this matters (the business case)

### Today

Customer asks: "Is my solar working OK?"
SPC says: "Your strings are healthy relative to each other."
Customer: ¯\\_(ツ)_/¯

### After Phase 2

Customer asks: "Is my solar working OK?"
SPC says: **"Your fleet is at 78% of nameplate. You're losing roughly PKR 9,300/month vs. what the panel manufacturer promised. Top fix: clean PV3 — it's at 56% PR."**
Customer: writes a PO for a cleaning crew.

This converts SPC from a **monitoring tool** into a **money-saving tool**. The product positioning improves. Easier to justify the subscription cost. Easier to upsell from monitoring to maintenance contracts.

### Reference: IEC 61724-1

The PR formula is industry standard. Quoting from IEC 61724-1:
> *"The Performance Ratio (PR) describes the relationship between the actual yield and the target yield. It is independent of irradiance and hence allows comparison of PV system performance across locations and seasons."*

Putting "IEC 61724 aligned" on the dashboard is justifiable once PR is computed.

---

## 11. Open questions to resolve before building

1. **Tariff per kWh** — different customers pay different net-metering rates. PKR 30, 40, 50, 65? Should we use a per-plant configurable tariff (`plants.tariff_per_kwh` column)? Or a global `PKR 50` constant for now?
2. **PR averaging window** — single-day PR is noisy (clouds). Should we display 7-day rolling average instead of today's PR? Or both?
3. **Alert thresholds** — what PR value should trigger a "fleet-wide degradation" alert? 70%? 60%?
4. **kWp display unit** — kWp vs kW. Industry standard is kWp (peak); current UI uses kW for capacity. Pick one and be consistent.

These are answerable in 5 minutes once you decide. None blocks Phase 2 v1 (Small).

---

## 12. Where this work picks up

When you (or another agent) come back to this:

1. Read this doc top to bottom
2. Read `lib/string-health.ts` — understand current peer-comparison logic
3. Read `app/api/plants/[code]/strings/route.ts` — see the existing LEFT JOIN to `string_configs`
4. Read `components/shared/StringComparisonTable.tsx` — see where "Panels" column lives today
5. Pick a size (Small / Medium / Large) — recommendation is Small
6. Confirm with user that admin has at least one plant fully configured (panel_count + panel_rating_w on every string of one device)
7. Build the new helpers in `lib/string-health.ts`
8. Wire them into the API responses
9. Surface PR in the UI as a NEW column or pill (do not replace existing health/gap)
10. Test against the worked example in §4 — math should match
11. Deploy via `Working/deploy-to-ec2.sh` (same flow as previous SPC deploys)

---

## 13. What is NOT in scope for Phase 2

These are tempting but should be separate phases:

- **Phase 3: Real irradiance API integration** — only when budget + need justify
- **Phase 4: Per-plant tariff configurability + cost-loss alerts** — UI-heavy
- **Phase 5: Monthly client PDF reports with PR trend lines** — output product
- **Phase 6: PR-based fault classifier** — separate ML/rules work, not just a metric

Stay focused. Ship Small Phase 2. Validate it. Iterate.

---

## 14. Quick reference table

| Concept | Where |
|---|---|
| Existing peer-comparison code | `lib/string-health.ts`, `lib/poller-utils.ts` |
| Existing panel config schema | `prisma/schema.prisma` model `string_configs` |
| Existing config API | `app/api/admin/plants/[code]/strings-config/route.ts` |
| Existing config admin UI | `app/admin/plants/[plantCode]/strings/page.tsx` |
| Existing org-side string read | `app/api/plants/[code]/strings/route.ts` (already LEFT JOINs configs) |
| Existing org-side string display | `components/shared/StringComparisonTable.tsx` |
| Phase 2 backend additions go here | `lib/string-health.ts` (new helpers) + the two API routes above |
| Phase 2 frontend additions go here | Same `StringComparisonTable.tsx` + `InverterDetailSection.tsx` |
| Things to never touch | `kWh` column anywhere · `string_daily.health_score` formula · existing alerts logic |

---

**End of plan.** When you next come back to SPC and say "let's do that PR thing we documented" — read this file. Everything is here.
