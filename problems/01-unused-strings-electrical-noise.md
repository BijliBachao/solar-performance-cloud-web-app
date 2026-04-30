# Problem 01 — Unused PV Inputs Show Electrical Noise, SPC Fires False Alerts Forever

**Status:** Documented · solution pending
**Documented:** 2026-04-30
**Severity:** **High — root cause of alert fatigue**
**Reported by:** Ali (during real-data review)

---

## One-line summary

Empty / disconnected PV input channels on an inverter still report non-zero voltage (electrical leakage from neighboring wired strings). SPC reads this noise as real data, compares it to peer averages, and fires permanent CRITICAL alerts on ports that **physically have nothing connected to them**.

---

## What the customer sees today

Open `/dashboard/plants/<any-plant>` on a real production plant. On the String Comparison Table for any inverter:

- **PV1, PV3, PV5** → green, healthy, ~8.5 A current
- **PV2, PV4** → red, CRITICAL, "32% below peers", "0.3 A current"

The customer asks: "Why are PV2 and PV4 always critical?"

Engineer's honest answer: **"Because they're empty. There are no panels on those channels."**

Customer thinks: "Then why is SPC showing alerts on them?"

The customer slowly stops reading alerts. **They stop trusting the dashboard.**

When a real fault later appears on a real string (e.g., PV7 actually develops a tree-shadow problem), the customer doesn't notice — it looks the same as PV2 and PV4 have always looked.

This is **alert fatigue**, and it's the single biggest threat to SPC's value proposition.

---

## What's actually happening (physics, not bug)

A modern string inverter has multiple MPPT inputs (e.g., 6 MPPTs × 2 strings = 12 PV channels). During installation:

- Installer wires PV1, PV3, PV5, PV7, PV9, PV11 (six strings of panels, one per MPPT)
- Leaves PV2, PV4, PV6, PV8, PV10, PV12 **physically empty** (the second leg of each MPPT)

The empty inputs are NOT silent. The inverter's internal circuitry creates:

| Source of noise | What it produces |
|---|---|
| Capacitive coupling from adjacent wired channels | 5–80 V "ghost voltage" on the empty input |
| Common ground / shared bus voltage | Few volts of induced potential |
| Inverter's own internal sense circuitry | Low-current readings (typically < 0.5 A) |
| MPPT crosstalk | Voltage that fluctuates with neighbor power |

These are normal physical phenomena. **Every commercial inverter does this.** The vendor APIs (Huawei FusionSolar, SolisCloud, ShinePhone, iSolarCloud) report these readings unconditionally — they don't know which channels were actually wired.

So when SPC polls the inverter, the response includes voltage and current for **every** PV channel — including empty ones.

---

## How current SPC code misbehaves

The chain of failure:

### Step 1 — Poller writes noise as real data

`lib/huawei-poller.ts`, `lib/solis-poller.ts`, `lib/growatt-poller.ts`, `lib/sungrow-poller.ts`:
- All four pollers loop over every PV channel the API returns
- They write every channel to `string_measurements` (raw) and feed `updateHourlyAggregates` / `updateDailyAggregates` (in `lib/poller-utils.ts`)
- No code anywhere asks "is this string supposed to be used?"

### Step 2 — Peer comparison flags the noise

`lib/string-health.ts` `classifyRealtime(current, voltage, peerAvg, stale)` and `lib/poller-utils.ts` `generateAlerts()`:
- Compute the average current of all "active" strings (current > `ACTIVE_CURRENT_THRESHOLD` = 0.1 A)
- An empty input often shows current of 0.05–0.3 A from leakage — sometimes above the 0.1 A active threshold, sometimes below
- When above: the noise is treated as a real-but-underperforming string. Compared to peers (~8 A), it's 96% below average. CRITICAL alert.
- When below: classified `OPEN_CIRCUIT` or `OFFLINE`. Different cosmetic state, same wrong outcome — surfaces in the dashboard as a problem.

### Step 3 — Alerts fire every 5 minutes, forever

`lib/poller-utils.ts` `generateAlerts()` runs each poll cycle. The empty input never recovers (it's empty), so alerts never auto-resolve. They accumulate or repeat (depending on dedup logic). Either way: noise.

### Step 4 — The dashboard amplifies the noise

- String Comparison Table shows persistent red rows
- String Health Matrix shows red cells
- Inverter health % drops because empty inputs are counted in the denominator
- Plant-level KPIs ("87% healthy") look worse than reality
- Org user logs in and sees a problem that does not actually exist

---

## Concrete example seen in production

Plant: **Mall of Multan · Inverter 6**

Inverter has 12 PV inputs. Installation reality:
- 8 panels physically wired across PV1, PV3, PV5, PV7
- PV2, PV4, PV6, PV8, PV9, PV10, PV11, PV12 → **empty**

What SPC shows after a typical poll:
```
PV1   8.7 A   98%   ✓ Healthy
PV2   0.3 A    8%   ⛔ CRITICAL — "23% below peers, possible tree shadow"
PV3   8.5 A   96%   ✓ Healthy
PV4   0.4 A   12%   ⛔ CRITICAL — "39% below peers"
PV5   8.6 A   97%   ✓ Healthy
PV6   0.2 A    7%   ⛔ CRITICAL
PV7   8.4 A   95%   ✓ Healthy
PV8   0.3 A    9%   ⛔ CRITICAL
PV9   0.1 A    3%   ⚠ OPEN_CIRCUIT
...
```

8 false CRITICAL alerts per inverter, every 5 minutes, forever. Multiply by N inverters per plant × M plants = thousands of phantom alerts per day across the fleet.

---

## Why this is hard to fix without explicit metadata

SPC cannot reliably guess which PV inputs are wired. The signals are ambiguous:

| Heuristic that doesn't work | Why |
|---|---|
| "If voltage is low, it's empty" | Empty inputs sometimes show 80 V from leakage. Real strings on cloudy days also show low voltage. |
| "If current is below 0.5 A all day, it's empty" | Cloudy days, dawn, dusk, and faulty real strings ALSO produce low current. False negatives. |
| "If health stays critical for 30+ days, it must be empty" | Real long-term faults (broken cable, degraded panel) also show this pattern. We don't want to silently hide real faults. |
| "Vendor API has a 'connected' flag" | None of the 4 vendor APIs (Huawei/Solis/Growatt/Sungrow) expose this reliably. |

The only reliable source of truth is **the human installer**. The admin who installed (or commissioned) the plant **knows** which channels are wired. We need to capture that knowledge.

---

## Customer impact

| Effect | Severity |
|---|---|
| Persistent red/CRITICAL state on dashboard | High — visual trust damage |
| Permanent active-alerts count > 0 | High — undermines the "is anything wrong?" KPI |
| Alert-fatigue → real faults get missed | **Critical — kills the product's value** |
| Manual workarounds (customer asks support to "ignore PV2") | Medium — support cost |
| Inability to confidently quote SLAs ("95% healthy fleet") | Medium — sales/marketing problem |
| Damaged product credibility for new prospects | High — reduces close rate |

This is the highest-ROI fix on the SPC backlog right now.

---

## Constraints — what we MUST NOT break when fixing this

1. **The poller must keep reading every channel.** Don't filter at the poller — that loses data we may want for historical investigation. Filter at the alert/UI/aggregate layer.
2. **`string_measurements` table stays full-fidelity.** Raw data is sacred. We mark strings unused; we don't delete their measurements.
3. **Existing peer-comparison logic must keep working for used strings.** The fix is additive — exclude unused strings from the peer pool, don't redesign the algorithm.
4. **Default behavior must be safe.** A string with no `is_used` flag set should NOT be hidden — defaulting unknowns to "used" matches today's behavior. Admin opts out, not in.
5. **Reversibility.** Marking a string `unused` must be reversible from the same admin page. Auditable.
6. **Org-user UI.** Org users (read-only) must NOT see unused strings anywhere. They are invisible to non-admins. (Admins still see them on the config page so they can flip the flag.)

---

## Open questions to resolve before solutioning

These need to be decided WITH the user before writing any code:

1. **Default state for new strings:** when the poller discovers a new PV channel for the first time, is it `used: true` (current behavior) or `used: false` (safe default, requires admin to enable)?
2. **Naming:** the field — `is_used` vs `is_active` vs `is_connected` vs `enabled`? (My pick: `is_used`, matches user's vocabulary.)
3. **Bulk operations:** the existing admin page has a "Apply to all strings" bulk action for panel config. Should we add a similar "Mark unused: PV2, PV4, PV6, PV8" multi-select?
4. **Historical data:** when an admin marks PV2 unused, do existing historical alerts for PV2 get auto-resolved? Or do they remain in alert history as a record?
5. **Reporting:** in monthly client reports, should unused strings be shown at all? (Probably no — but worth confirming.)
6. **Tier scope:** does this admin-only feature also need to be exposed to ORG_ADMIN role (for self-managed orgs)? Or stays SUPER_ADMIN-only? Current admin page is SUPER_ADMIN-only — assume same.

---

## Where the solution will land (rough pointers — actual code in PLAN doc later)

- `prisma/schema.prisma` — add `is_used Boolean @default(true)` to `string_configs` table (Phase 1 already created this table — we just add a column)
- `lib/string-health.ts` — peer-comparison helpers need to filter the peer pool to "used strings only"
- `lib/poller-utils.ts` `generateAlerts()` — skip alert generation entirely for unused strings
- `app/api/plants/[code]/strings/route.ts` — exclude unused strings from response (or include with a flag for admins only)
- `app/api/admin/plants/[code]/strings-config/route.ts` — extend GET to return `is_used`, extend PUT to allow toggling it
- `app/admin/plants/[plantCode]/strings/page.tsx` — add a "Used / Unused" toggle column on each row, plus a bulk "mark all unused" action
- `components/shared/StringComparisonTable.tsx` — already filters by config — extend to skip unused strings
- All `string_daily.health_score` aggregations — recompute denominators excluding unused strings

---

## What this problem will look like once solved

Same plant. Same inverter. After admin marks PV2, PV4, PV6, PV8, PV9–PV12 as unused:

```
PV1   8.7 A   98%   ✓ Healthy
PV3   8.5 A   96%   ✓ Healthy
PV5   8.6 A   97%   ✓ Healthy
PV7   8.4 A   95%   ✓ Healthy
```

Inverter health: **100%** (4/4 used strings healthy). Active alerts: **0**. Customer trust: restored.

The 8 unused strings still write to `string_measurements` (we keep raw data), but they're invisible to alerts, dashboards, and aggregates.

---

## References

- Plan doc (to be written): `PLAN-string-used-unused.md` (does not exist yet)
- Phase 1 panel-config feature (deployed): commit `0575bd7`
- Existing `string_configs` table: `prisma/schema.prisma`
- Admin config page: `app/admin/plants/[plantCode]/strings/page.tsx`
- Related backlog tasks: `BACKLOG.md` #105 (sensor-fault filter — separate problem with overlapping fix surface)
