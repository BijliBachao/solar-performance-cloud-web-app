# SPC Infrastructure & Feature Change Log

## 2026-04-22 — Security patch

### `[SEC-1]` · Clerk CRITICAL bypass CVE patched (GHSA-vqx2-fgx2-5wq9)

- **What:** `@clerk/nextjs` upgraded `6.35.0 → ^6.39.2` (within major version — no breaking changes). Also bumps `@clerk/shared` transitively past the fix.
- **Why:** `npm audit` flagged `GHSA-vqx2-fgx2-5wq9` — "Middleware-based route protection bypass", affecting `>=6.0.0-snapshot.vb87a27f <6.39.2`. We were on 6.35.0 → vulnerable. Post-upgrade verified **0 critical, 0 moderate, 7 high** (all transitive to Next 14.x, below).
- **When:** 2026-04-22
- **Verification:** `npm audit --omit=dev` shows no Clerk vulnerability. TS + validator 20/20 still clean. Production build compiled without warnings related to Clerk.

### `[SEC-2]` · Known-risk register — Next.js 14.x high-severity CVEs deferred

Remaining 7 `high` severity advisories are all against `next@14.2.35`:

| GHSA | Title | Fixed in |
|---|---|---|
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | DoS via Image Optimizer `remotePatterns` | 15.5.10 |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) | HTTP request deserialization → DoS via insecure RSC | 15.0.8 |
| [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) | HTTP request smuggling in rewrites | 15.5.13 |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) | `next/image` unbounded disk cache | 15.5.14 |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) | DoS with Server Components | 15.5.15 |

**Why deferred:** All fixes require jumping to **Next.js 15.x** — a major-version upgrade. Risky pre-handover.

**Why low operational risk today:**
- All CVEs are DoS / resource-exhaustion (not auth bypass, not data leakage).
- We do NOT use `images.remotePatterns` (we use `domains` only).
- Nginx front-of-house has rate limiting (`limit_req zone=api burst=20 nodelay`) which blunts most DoS vectors.
- Nginx rewrites handle path rewriting (not Next rewrites) — the smuggling CVE's attack surface is reduced.
- `fail2ban` active with `nginx-4xx` jail — auto-ban on abuse patterns.

**Planned action:** Next 15.x upgrade within 30 days post-handover. Requires testing App Router behaviour (server-component boundaries changed), `output: 'standalone'` mode check, and updating `@sentry/nextjs` to a version compatible with 15.x.

**Tracking:** this entry. Re-evaluate if new critical appears or a Next 14.x patch becomes available.

---


> **Purpose:** single append-only record of every infrastructure, security,
> observability, or platform change — what, why, when, who, how verified.
>
> **Discipline:** every deploy that touches infrastructure lands here.
> Source of truth for on-call runbooks and audit trails.
> Newest entries at the top.

---

## 2026-04-22 — Observability baseline

### `[OBS-1]` · Install hourly audit cron on EC2

- **What:** `crontab -e` added:
  `0 * * * * bash /home/ubuntu/solar-web-app/scripts/audit-continuous.sh >> /home/ubuntu/solar-web-app/audits/cron.log 2>&1`
- **Why:** closes the "continuous system audit" gap in `AUDIT.md`. Every hour a
  markdown report is written to `~/solar-web-app/audits/YYYY-MM-DD/HHMM-continuous.md`
  covering disk · RAM · load · SSL expiry · PM2 · DB size · ingestion rate · data
  freshness · sensor-fault rate · poller errors.
- **When:** 2026-04-22 ~11:55 UTC
- **Verification:** ran once manually — `1 warning(s)` (transient Solis 503 from
  earlier). Report saved to `audits/2026-04-22/1155-continuous.md`. Next auto-run at
  top of next hour.
- **Ownership:** operator action — review `audits/` daily for a week, then reduce
  cadence.

### `[OBS-2]` · Install Netdata system-metrics agent on EC2

- **What:** Netdata v-latest installed via official kickstart
  (`--non-interactive --stable-channel --disable-telemetry --native-only`).
- **Bind:** `127.0.0.1:19999` only (edited `/etc/netdata/netdata.conf`, set
  `[web] bind to = 127.0.0.1`).
- **Firewall:** added UFW rule explicitly denying `19999/tcp` — belt + suspenders
  since Netdata is also bound to localhost only.
- **Footprint:** ~75 MB RSS, <2% CPU steady-state.
- **Why:** closes the "system metrics" gap. Real-time CPU/RAM/disk/network
  visibility without building our own telemetry. Runs entirely on-box, no
  external dependency, no cloud vendor account, no data leaves the VM.
- **When:** 2026-04-22 ~11:58 UTC
- **Access (SSH tunnel):**
  ```bash
  ssh -L 19999:localhost:19999 -i /path/to/thingsboard.pem \
    ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com
  # then open http://localhost:19999 in your browser
  ```
  Only the SSH key holder can view — consistent with current ops posture.
- **Verification:** `curl http://127.0.0.1:19999` → HTTP 200.
  External probe on port 19999 → blocked by Netdata (binds only to 127.0.0.1)
  AND by UFW rule. Dual-layer defence verified.

### `[OBS-3]` · Sentry Next.js SDK live

- **What:** Full `@sentry/nextjs` setup per the official
  [sentry-for-ai skill](https://github.com/getsentry/sentry-for-ai/blob/main/skills/sentry-nextjs-sdk/SKILL.md).
  7 files: `sentry.server.config.ts`, `sentry.edge.config.ts`,
  `instrumentation-client.ts`, `instrumentation.ts`, `app/global-error.tsx`,
  `app/api/sentry-test/route.ts`, wrapped `next.config.js`.
- **Dashboard:** [bijli-bachao-pk.sentry.io](https://bijli-bachao-pk.sentry.io)
  project `javascript-nextjs`.
- **Release tracking:** `release` tag = `NEXT_PUBLIC_BUILD_ID` (git short SHA).
- **Source-map upload:** enabled — `SENTRY_AUTH_TOKEN` in EC2 `.env`
  (`.env.sentry-build-plugin` gitignored).
- **Session Replay:** 10% of normal sessions, 100% of sessions with errors,
  `maskAllText: true`, `blockAllMedia: true` — enterprise-safe.
- **Tracing:** `tracesSampleRate: 0.1` on server + client.
- **Why:** closes the "app error tracker" gap. Every unhandled exception —
  server, client, middleware — lands in Sentry with release + environment tags.
  Session Replay gives a "what did the user see" video on any bug report.
- **When:** 2026-04-22 ~11:50 UTC
- **Verification:** `curl /api/sentry-test` → HTTP 500; event confirmed in
  Sentry dashboard within 30 s. Source-mapped stack trace resolves to
  `app/api/sentry-test/route.ts` line 22.

### `[OBS-4]` · Public `/api/health` endpoint

- **What:** `app/api/health/route.ts` — returns JSON with DB connectivity,
  poller freshness (`latest_measurement_age_sec`), uptime, response-time.
  HTTP 200 for `status=ok|degraded`, HTTP 503 for `status=down`.
- **Public:** added to Clerk `isPublicRoute` matcher — no auth, no caching.
- **Why:** machine-readable infrastructure probe. Consumed by UptimeRobot
  (external uptime), deploy smoke tests, and future load balancers.
- **When:** 2026-04-22 ~10:30 UTC
- **Verification:** `curl https://spc.bijlibachao.pk/api/health` returns
  `{ "status": "ok", "db": { "ok": true }, "poller": { "stale": false } }`.

### `[OBS-5]` · Audit toolkit — 3 bash scripts

- **What:** `scripts/audit-pre-deploy.sh` (laptop, pre-push),
  `scripts/audit-post-deploy.sh` (EC2, post-restart),
  `scripts/audit-continuous.sh` (EC2, cron hourly).
- **All produce:** identical markdown shape for human + future UI parsing.
- **Reports live in:** gitignored `/audits/YYYY-MM-DD/` — runtime artefacts.
- **Why:** give every deploy a verification gate and every hour a heartbeat.
  Full rationale in `AUDITS.md`.
- **When:** 2026-04-22
- **Verification:** pre-deploy self-test on laptop ✓; post-deploy self-test on
  EC2 ✓ after the PM2-JSON-parse fix.

---

## 2026-04-22 — Data integrity (write-side)

### `[DATA-1]` · Poller two-axis sensor-fault filter

- **What:** `lib/poller-utils.ts` adds `dropSensorFaults()` helper, applied in
  `generateAlerts()`, `updateHourlyAggregates()`, `updateDailyAggregates()`.
  Rejects rows where `current ≥ 50 A` OR `power ≥ 25 kW`.
- **Why:** closes `AUDIT.md` Issue C1 (CRITICAL). Without this, CT faults
  (108 A, 998 A seen in prod) were being averaged into stored
  `string_daily.performance` — which `computePerformance` capped at 100%,
  making a broken string appear "perfectly healthy" in the analysis page.
  Also protects peer-relative averages in `generateAlerts()` — a runaway CT
  would otherwise make every healthy peer look under-average and fire false
  CRITICAL alerts.
- **When:** 2026-04-22, deployed in commit `610c4cf`.
- **Verification:** next poll cycle (≤5 min) wrote a clean hourly; daily will
  clean up on next upsert. Old polluted rows persist until overwritten.

### `[DATA-2]` · Two-axis filter on read-side (prior session, 2026-04-22 earlier)

- **What:** Same filter threshold constants (`MAX_STRING_CURRENT_A = 50`,
  `MAX_STRING_POWER_W = 25000`) applied in every aggregate query on the
  dashboard read path — main dashboard fleet stats, plant hero 24h sparkline,
  plant page trend chart, analysis daily query.
- **Why:** defence in depth. Even before `[DATA-1]` shipped, UIs excluded
  sensor-fault rows from display.
- **When:** earlier in 2026-04-22 session, commits `72b900b` and `2ea3948`.

### `[DATA-3]` · Tri-state plant liveness

- **What:** `STANDBY_POWER_FLOOR_KW = 0.5` + `classifyPlantLive()` helper.
  PRODUCING / IDLE / OFFLINE replaces boolean `isLive`. Night-time standby noise
  (inverter pings at ~200 W per plant) no longer counts as "LIVE".
- **Why:** "plant is LIVE producing 0.2 kW at 3 AM" was the first data-integrity
  bug flagged by the enterprise team pre-handover. Ingest ≠ production.
- **When:** 2026-04-22, commit `1e03004`.
- **Verification:** operator confirmed — at 3 AM plants now show STANDBY
  correctly; fleet power excludes standby noise.

### `[DATA-4]` · Fleet-health coverage gate

- **What:** `HEALTH_COVERAGE_MIN_RATIO = 0.5`. Fleet health KPI returns `null`
  (renders "—") when today's reporting string count < 50% of yesterday's.
  Prevents "1 of 20 strings averaging 85% = fleet is 85% healthy" false positives.
- **Why:** averaging a tiny subset during dawn/dusk/night gave false-healthy
  readings.
- **When:** 2026-04-22, commit `2ea3948`.

### `[DATA-5]` · IEC 62446/61724 vocabulary alignment

- **What:**
  - `StringStatus 'DISCONNECTED'` → `'OFFLINE'` across 11 files (type + 8 UIs +
    validator check + classifier function).
  - `FaultDiagnosisPanel`: "Total Signal Loss" → "Communication Loss — Offline";
    "Faulty Panel or Major Obstruction" → "Module Fault or Severe Shading";
    "Partial Shading or Dirty Panels" → "Partial Shading or Soiling".
  - Each diagnosis card carries an IEC reference tag
    (e.g. `IEC 62446-1 · continuity & polarity test`).
  - `StringHealthMatrix` tooltip: `V (operating)` / `I (operating)` / `P` —
    distinguishes running readings from commissioning Voc / Isc.
  - Plant hero KPI `Strings OK` → `Availability` (IEC 61724-1 term).
- **Why:** enterprise readers expect IEC-aligned terminology. Research in
  `/Working/docs/IEC-STRING-MONITORING-RESEARCH.md` (2026-04-15) specified this;
  the UI was out of sync until now.
- **When:** 2026-04-22, commit `a5bdcba`.

---

## 2026-04-22 — Design system v3 "Solar Corporate"

All 20+ design commits landed today:

- `70f89ef` SPC Design System v3 — solar-gold primary, white canvas, slate text
- `8304a6a` Dashboard v4 layout — hero card, sparklines, plant cards, alerts insight
- `8c0e9e0` Finish v3 migration across `/dashboard` (alerts · settings · analysis)
- `addb54c` Plant page hero — solar-gold featured card
- `db9041b` Inverter card mini-hero
- `9351037` White tooltips · dense health matrix · industrial comparison table
- `954a751` 4 section redesigns — deviation chart · alerts · fault diagnosis · trend
- `f3aaa14` Alert History tab v3 redesign
- `367dd4e` `/dashboard/analysis` kW/String column dropped, capacity card added
- Plus 10+ more

**Source of truth:** `DESIGN.md` in this repo. Superseded `Working/NVIDIA.md` and
`Working/docs/design-system/DESIGN-nvidia.md` (deleted).

**Enforcement:** `scripts/validate-centralized.sh` blocks build on inline
thresholds, inline window constants, magic slicing, retired NVIDIA-green hex, etc.
20/20 checks passing.

---

## 2026-04-22 — Documentation

- `HANDOVER.md` — 1-page operator guide
- `AUDIT.md` — enterprise audit, gap analysis, 30/60/90-day roadmap
- `AUDITS.md` — operator guide for the 3 bash audit scripts
- `CHANGELOG.md` (this file)
- `UPTIMEROBOT_SETUP.md` — external uptime-monitor setup instructions for the operator

---

## Pre-2026-04-22 history

Prior to this session the app had:
- Provider pollers (Huawei / Solis / Growatt / Sungrow)
- Clerk auth + RBAC (SUPER_ADMIN / ADMIN / MEMBER)
- Prisma schema + AWS RDS
- PM2 running `solar-web` + `solar-poller` on EC2
- Nginx reverse proxy with security headers + rate limiting
- UFW firewall + fail2ban
- Let's Encrypt SSL with cert-bot auto-renewal
- Git repo at BijliBachao/solar-performance-cloud-web-app

All kept and audited in `AUDIT.md`.
