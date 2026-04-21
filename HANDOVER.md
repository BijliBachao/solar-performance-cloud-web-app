# Solar Performance Cloud — Handover Note

**Live URL:** https://spc.bijlibachao.pk
**Handover date:** 2026-04-22

This document is the first thing a new operator should read. It explains what
the platform shows, how to read the dashboard, what the edge cases mean, and
who to contact for what.

---

## 1. What this platform is

A multi-provider solar monitoring system. It polls four inverter APIs
(Huawei, Solis, Growatt, Sungrow) every 5 minutes, stores string-level
performance data, computes IEC 61724 health scores, generates alerts, and
serves a Next.js dashboard.

Users are scoped to an **organization**. Each organization sees only the
plants assigned to it. Plant assignments are managed in `/admin`.

---

## 2. How to log in

- Authentication is handled by Clerk.
- Sign in at `https://spc.bijlibachao.pk/sign-in`.
- New signups land at `/pending-assignment` until a SUPER_ADMIN assigns
  them to an organization and grants a role.
- Roles: `SUPER_ADMIN` (full access, all orgs), `ADMIN` (org-level admin),
  `MEMBER` (read-only within their org).

---

## 3. Refresh cadence

- The backend poller runs every **5 minutes** (`solar-poller` service).
- The dashboard auto-refreshes every **5 minutes** to match.
- Manual refresh: reload the page.
- A measurement is considered **stale** 15 minutes after the last report.

---

## 4. Dashboard — how to read each number

### Live Fleet Power (hero card)
- **Green LIVE pill with pulsing dot** means at least one assigned plant is
  actively producing (≥ 0.5 kW).
- **Value (kW)** is the sum across plants that are PRODUCING. Plants in
  STANDBY are excluded so overnight sensor noise can't masquerade as
  generation.
- **Delta %** compares the last-completed hour against the same completed
  hour yesterday. Shown as "vs same hour yesterday". Hidden (nothing shown)
  if either reference is zero.
- **Sparkline** is fleet power over the last 24 hours.

### Per-plant status
Three possible states on each plant card:

| Badge | Condition | Meaning |
|---|---|---|
| **LIVE** (green, pulsing) | Reporting within 15 min AND ≥ 0.5 kW | Plant is producing |
| **STANDBY** (gray) | Reporting within 15 min AND < 0.5 kW | Inverter is pinging but output is standby/trickle (night, dawn, dusk, curtailed) |
| **OFFLINE / plant state label** | No report in last 15 min | Plant hasn't pinged — check connectivity or provider API |

### KPI tiles

| Tile | What it means |
|---|---|
| **Energy Today** | Sum of today's (PKT) per-string `energy_kwh` from `string_daily`, with sensor-fault rows excluded. Delta compares today-so-far against yesterday at the same PKT time (fair comparison, not today-partial vs yesterday-full). |
| **Active Alerts** | Count of unresolved alerts across assigned plants, split by CRITICAL / WARNING / INFO. |
| **Fleet Health** | IEC 61724 score (Performance × Availability / 100) averaged over today's reporting strings. Returns **"—"** when fewer than 50% of yesterday's reporting strings have shown up today, with the subtitle reading "N of M strings reporting — insufficient coverage". This prevents a false-healthy score on a mostly-silent fleet. Delta compares today against the 7-day rolling average (stable baseline). |
| **Inverters Online** | Count of distinct devices reporting in the last 30 minutes / total devices across assigned plants. |

### Production bars (per plant)
24 bars representing the plant's power output for each PKT hour of today.

### Health progress bar (per plant)
Today's average IEC health score for this plant, colour-coded:
90+ emerald, 75–89 pale green, 50–74 amber, 25–49 red, <25 deep red. If no
data for today, the bar is hidden.

### Last Sync
The most recent time any assigned plant's provider API was polled
successfully. Visible on admin views; absence of recent syncs means the
poller has a problem, not the plant.

---

## 5. Data-integrity guarantees (what we filter out)

The dashboard aggregates apply physical-reality filters so broken sensors
can't inflate fleet numbers:

- **Current ceiling:** `avg_current < 50 A` per string (typical PV string
  max is 10–15 A; 50 A is a conservative fault bar).
- **Power ceiling:** `avg_power < 25 kW` per string (physics: 500 V × 50 A).
- **Standby floor:** a plant must be producing ≥ 0.5 kW to count as LIVE.
- **Coverage floor:** fleet health is suppressed if fewer than half of
  yesterday's reporting strings show up today.

All of these thresholds live in a single file, `lib/string-health.ts`, which
is the single source of truth. A pre-build validator (`scripts/validate-centralized.sh`)
runs 19 checks; the build fails if any file re-introduces an inline
threshold.

---

## 6. Known plant-hardware issues (not code bugs)

The dashboard filters these out of fleet aggregates but they remain visible
on per-string admin views:

| Plant | String(s) | Symptom | Action needed |
|---|---|---|---|
| Mall Of Mdk 150KW PV 85KW (Solis) | 7, 8, 13 | CT sensors report impossibly high current (up to 998 A) and power (up to ~1.2 MW) | Physical CT sensor replacement |
| Mall Of Mdk 150KW PV 85KW (Solis) | 12, 15, 16 | `avg_current = 0 A` but `avg_power > 0 W` (violates Ohm's law) | Sensor calibration |

These faults are why per-plant "Today's production" for Mall Mdk 85 can
look low: the broken strings are excluded from totals by design.

---

## 7. Admin & Operations

### PM2 services on EC2
| Name | Purpose |
|---|---|
| `solar-web` | Next.js app on port 3001 |
| `solar-poller` | 4-provider poller, runs every 5 min |

**Do NOT restart** `nextjs-app`, `mqtt-service`, or `reconcile-service` —
those belong to a sibling app (Wattey) sharing the same box.

### Deployment
See `Working/CLAUDE.md` for the canonical deploy sequence:
```
ssh ... && cd ~/solar-web-app
git pull origin main
npm ci --legacy-peer-deps && npx prisma generate
rm -rf .next && npm run build
pm2 restart solar-web solar-poller
```
The build runs `validate-centralized.sh` first; if any of the 19 checks
fails, the build fails and no deploy happens.

### Database
- AWS RDS PostgreSQL, shared box with Wattey but SPC uses its own tables.
- Timezone convention: `string_daily.date` stores the **PKT calendar day**;
  `string_hourly.hour` stores **UTC** instants; `string_measurements.timestamp`
  stores **UTC** instants.

### Adding a new plant
1. Poller auto-discovers new plants from the provider API on each run.
2. A SUPER_ADMIN assigns the new plant to an organization via `/admin/organizations/[id]`.
3. Members of that organization see it on their dashboard on next refresh.

### Adding a new user
1. User signs up via Clerk (`/sign-up`).
2. User lands on `/pending-assignment`.
3. A SUPER_ADMIN assigns them to an organization and role in `/admin/users`.

---

## 8. Contacts

| Topic | Contact |
|---|---|
| Platform owner | Ali Ahmed — `ai@right2fix.com` |
| Founder (BijliBachao) | Engr Reyyan Niaz Khan |
| Auth / Clerk dashboard | `https://dashboard.clerk.dev` |
| EC2 / infrastructure | See `Working/docs/auth/PRODUCTION_CREDENTIALS.md` (confidential) |
| Physical plant repairs (CT sensors, inverters) | Plant owner (per-plant — in the plant's metadata) |

---

## 9. What "looks wrong" that is actually correct

When onboarding, users often flag these as bugs. They aren't:

- **"LIVE" is gray, not green, at 3 AM** → correct, the plant is in STANDBY
  overnight. Solar doesn't produce at night.
- **"Energy Today" is 0.6 kWh on a 85 kW plant** at 3 AM → correct, only
  pre-dawn standby residue has been logged so far. Full day's generation
  accumulates as the sun rises.
- **Fleet Health shows "—"** → correct, not enough strings reported today
  to compute a meaningful average (coverage gate). Wait until mid-day.
- **Energy delta shows `-80%` at 9 AM** → correct fair comparison: only
  9 AM worth of generation has accumulated today vs. a full day yesterday's
  same-window figure. Converges to the meaningful delta by evening.

---

*Generated 2026-04-22. Update this document whenever dashboard semantics
change — future operators depend on it being accurate.*
