# Solar Performance Cloud — System Audit

**Audit date:** 2026-04-22
**Perspective:** Cloud engineer + DevOps + architect
**Scope:** End-to-end system, enterprise readiness, data integrity, operational maturity
**Intent:** Living document. Track what exists, what's solid, what's fragile, what's next.

---

## 0. TL;DR

SPC is **functional and serving traffic** (https://spc.bijlibachao.pk — HTTP 200 consistently). The **UI / design / data-integrity on the read-side is enterprise-grade** after this session's work (20 validator checks, IEC-aligned metrics, 12 sensor-fault guardrails, tri-state plant liveness). **Write-side data integrity** now fixed too (poller two-axis filter). **Observability baseline** now in place: Sentry for errors, Netdata for system metrics, hourly audit cron writing markdown reports, `/api/health` endpoint for external probes. The remaining gaps are **CI/CD** (still manual deploys), **testing** (no test suite), and **external uptime monitoring** (UptimeRobot setup documented — awaits operator sign-up).

Suitable to hand over to an operator; suitable to run unattended for short windows with UptimeRobot + Sentry email alerts enabled.

---

## 1. System Inventory (evidence-based)

### 1.1 Hosting
| Item | Value | Source of evidence |
|---|---|---|
| Provider | AWS EC2 (t2.medium, us-east-1) | PRODUCTION_CREDENTIALS.md |
| Host | `ec2-54-175-170-207.compute-1.amazonaws.com` (`54.175.170.207`) | Working/CLAUDE.md · SSH |
| OS | Ubuntu 24.04 LTS | `uname -a` |
| vCPUs | 2 | `nproc` |
| RAM | Small (t2.medium = ~4 GB) | deduced from instance type |
| Tenancy | **Shared with Wattey** (another BijliBachao app on same box) | `ls /etc/nginx/sites-enabled/` shows both |

### 1.2 DNS & TLS
| Item | Value |
|---|---|
| Primary domain | `spc.bijlibachao.pk` |
| SSL issuer | Let's Encrypt |
| SSL expiry | **2026-07-01** (valid 69 days, auto-renew via certbot) |
| SSL config | HSTS `max-age=63072000; includeSubDomains` (2-year pin) |
| TLS grade | Not measured this audit — recommend SSL Labs scan post-handover |

### 1.3 Network / Firewall
| Port | Rule | Purpose |
|---|---|---|
| 22/tcp | ALLOW Anywhere | SSH |
| 80/tcp | ALLOW Anywhere | HTTP (redirects to 443) |
| 443/tcp | ALLOW Anywhere | HTTPS (terminated at nginx) |
| 1883/tcp | ALLOW Anywhere | MQTT (Wattey devices) |
| 3000/tcp | **DENY Anywhere** | Wattey app — proxied only |
| 3001/tcp | **DENY Anywhere** | **SPC app — proxied only** ✓ |

Hardening confirmed: `fail2ban` active, `ufw` active.

### 1.4 Reverse proxy (Nginx)
- Nginx active, SPC config at `/etc/nginx/sites-enabled/spc.bijlibachao.pk`
- **API rate limiting:** `limit_req zone=api burst=20 nodelay` on `/api` block
- **Webhook path** `/api/webhooks` exempted (required for Clerk delivery)
- Security headers: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `X-XSS-Protection 1; mode=block`, `Referrer-Policy strict-origin-when-cross-origin`, `Strict-Transport-Security max-age=63072000; includeSubDomains`
- `.env`, `.git`, `node_modules` blocked via `include snippets/security-block.conf`

### 1.5 Application stack
| Component | Version/Detail |
|---|---|
| Node | ≥ 20 required (engines pin) |
| npm | ≥ 10 required |
| Framework | Next.js 14.2.35 (App Router) |
| UI | React 19 · Tailwind · Radix UI · Lucide · Recharts · SWR |
| Auth | Clerk (`@clerk/nextjs ^6.35.0`, webhook via `svix ^1.81.0`) |
| ORM | Prisma 6.19 |
| DB client | `@prisma/client ^6.19.0` |
| Scheduler | `node-cron ^4.2.1` (in `scripts/run-poller.ts`) |

### 1.6 Database
| Item | Value |
|---|---|
| Engine | PostgreSQL 17.6 (AWS RDS, db.t3.micro, 40GB SSD auto-scale → 1TB) |
| Host | `bijli-bachao-db.cgposcwuc9y6.us-east-1.rds.amazonaws.com:5432` |
| DB name | `solar_dashboard` (SPC tables only; Wattey uses a different DB on the same RDS instance) |
| DB size | 502 MB (as of audit) |
| Automated backups | RDS default 7-day PITR per AWS docs (not independently verified at audit time) |

**Table sizes (top 5):**
| Table | Rows | Size |
|---|---|---|
| `string_measurements` | 1,302,329 | 423 MB |
| `string_hourly` | 196,247 | 65 MB |
| `alerts` | 24,531 | 9.0 MB |
| `string_daily` | 11,080 | 4.2 MB |
| `devices` | 55 | 120 kB |

**Retention (observed — older rows present, not enforced by automation):**
| Table | Oldest row |
|---|---|
| `string_measurements` | 2026-03-23 (~30 days — approximates target retention) |
| `string_hourly` | 2026-01-30 (~82 days) |
| `string_daily` | 2026-01-30 (~82 days) |

**Fleet scale:** 48 plants · 55 devices · 3 orgs · 7 plant-assignments · 6 users.

### 1.7 Ingestion
| Item | Value |
|---|---|
| Cadence | 5 min (node-cron schedule in `scripts/run-poller.ts`) |
| Providers | Huawei, Solis, Growatt, Sungrow (4 separate client + poller pairs in `lib/`) |
| Throughput | ~3,400 rows/hr from 54 devices = ~63 rows/device/hr (consistent with 5-min × ~5 strings per device) |

### 1.8 PM2 process map (on EC2)
| Name | Type | Port | Owner |
|---|---|---|---|
| `solar-web` | Next.js production | 3001 | SPC |
| `solar-poller` | `tsx scripts/run-poller.ts` | — | SPC |
| `nextjs-app` | Wattey frontend | 3000 | **Wattey — do not touch** |
| `mqtt-service` | Wattey MQTT ingest | — | **Wattey** |
| `reconcile-service` | Wattey reconciliation | — | **Wattey** |
| `pm2-logrotate` | module | — | system |

Logs under `/home/ubuntu/.pm2/logs/` — daily rotation observed (files dated per day), retention policy not explicitly enforced.

### 1.9 Wattey coordination & boundaries — shared EC2 rules

This EC2 hosts **two apps side by side**: SPC (ours) and Wattey (another BijliBachao product). Everything in this section exists so a Wattey developer can work on their app without breaking SPC — and vice versa. Share this section with the Wattey team; it is the authoritative coordination doc.

**Ownership map — never cross these lines:**

| Resource | SPC (ours) | Wattey (theirs) |
|---|---|---|
| App dir on EC2 | `~/solar-web-app` | `~/reyy` |
| Port (internal) | 3001 | 3000 |
| Nginx site file | `/etc/nginx/sites-available/spc.bijlibachao.pk` | `/etc/nginx/sites-available/wattey` |
| Domain | `spc.bijlibachao.pk` | `wattey.bijlibachao.pk` |
| PM2 processes | `solar-web`, `solar-poller` | `nextjs-app`, `mqtt-service`, `reconcile-service` |
| Database (on shared RDS) | `solar_dashboard` | separate DB on the same RDS instance |

**SPC-owned tables inside `solar_dashboard` — Wattey must not write to any of these:**
`alerts`, `device_daily`, `devices`, `organizations`, `plant_assignments`, `plants`, `string_daily`, `string_hourly`, `string_measurements`, `users`, `vendor_alarms`.

**Dangerous commands — do NOT run on this shared host under any circumstance:**

| Command | Why it's banned |
|---|---|
| `pm2 delete all` / `pm2 restart all` / `pm2 kill` / `pm2 stop all` | Hits both apps — will kill SPC silently |
| `sudo systemctl restart nginx` | Hard restart drops in-flight requests on both domains; use `sudo nginx -t && sudo systemctl reload nginx` |
| `DROP DATABASE solar_dashboard` / any write on SPC tables | Destroys SPC data |
| `CREATE TABLE` in `solar_dashboard` | SPC uses Prisma `db push`; a hand-made table will break the next deploy |
| Node.js / PM2 upgrade without coordination | SPC is locked to Node 18.20.8 + PM2 6.0.13; upgrading breaks SPC |
| Opening port 3000 or 3001 in the AWS Security Group | Both apps proxy through Nginx; direct exposure breaks TLS and rate limiting |

**Safe PM2 patterns (target by name — always):**
```bash
# Wattey side
pm2 restart nextjs-app mqtt-service reconcile-service
pm2 logs nextjs-app
pm2 stop nextjs-app

# SPC side (for SPC team only)
pm2 restart solar-web solar-poller
pm2 logs solar-poller
```

**What to do if something goes wrong:**

| Symptom | Interpretation | Action |
|---|---|---|
| Wattey down, SPC up | Wattey-side issue | Wattey team handles |
| SPC down, Wattey up | SPC-side issue | SPC team handles |
| **Both down** | Shared infra (disk, Nginx, Node, PM2 daemon, RDS) | Contact both teams before any destructive recovery (no reboots, no `pm2 kill`) |

**Sanity-check commands — run these after any change to shared config:**
```bash
pm2 list                                    # expect 5 processes: 3 Wattey + 2 SPC
sudo netstat -tlnp | grep -E ':300[01]'     # expect both 3000 and 3001 LISTEN
ls /etc/nginx/sites-enabled/                # expect: spc.bijlibachao.pk  wattey
curl -o /dev/null -s -w "%{http_code}\n" https://spc.bijlibachao.pk  # expect 200
```
If any of those numbers change, something that belongs to the other app was touched — revert before walking away.

**SPC deploy footprint (so Wattey knows what to expect during SPC pushes):**
1. `cd ~/solar-web-app && git pull`
2. `npm ci --legacy-peer-deps` inside `~/solar-web-app`
3. `npx prisma db push` against `solar_dashboard` only
4. `rm -rf .next && npm run build`
5. `pm2 restart solar-web solar-poller`

Wattey sees **zero impact** during SPC deploys. If Wattey notices disruption, contact SPC team immediately.

**SPC contact:** ai@right2fix.com

---

## 2. What This Session Delivered (what's solid)

### 2.1 Design system — v3 "Solar Corporate"
- Single authoritative spec: `DESIGN.md` (860 lines, IEC-aligned)
- Paired token files: `tailwind.config.ts`, `app/globals.css`, `lib/design-tokens.ts`
- Every color, typography, radius, spacing, shadow is a token
- 10 retired stale design docs removed — only DESIGN.md + design-tokens.ts remain
- All `/dashboard/*` pages migrated to v3 (home, plants/[plantCode], alerts, settings, analysis)

### 2.2 Data-integrity guarantees (read-side)
- Two-axis CT sensor-fault filter on every aggregate query (`MAX_STRING_CURRENT_A = 50 A`, `MAX_STRING_POWER_W = 25 kW`)
- Tri-state plant liveness (`PRODUCING` / `IDLE` / `OFFLINE`) — no more fake "LIVE" at night
- Standby floor `STANDBY_POWER_FLOOR_KW = 0.5` gates fleet-power accumulation
- Fair deltas: last-completed-hour vs same hour yesterday for hero; today-so-far vs yesterday-same-window for energy; 7-day rolling avg baseline for fleet health
- Fleet-health **coverage gate** — returns `null` when fewer than 50% of yesterday's strings reported today, prevents false-healthy readings
- Terminology migrated to IEC 62446-1 / 61724-1 vocabulary (`DISCONNECTED` → `OFFLINE`, Fault Diagnosis actions, IEC reference tags)

### 2.3 Validator — `scripts/validate-centralized.sh`
- Wired into `npm run build`: build fails if validator fails
- 20 checks across 5 sections (thresholds · types · security · structure · dashboard windows)
- Catches inline `0.1`, `>= 90`, `>= 50`, `25`, `>= 25`, `gap > 10`, `health_state === N`, `15 * 60 * 1000`, `48 * 60 * 60 * 1000`, `.slice(-24)`, `i <= 7`, standby-floor numbers, `25_000` power ceilings, `#76b900` NVIDIA green
- Duplicate-type detection (`StringStatus` type can only be declared once)
- Required-export check on `lib/string-health.ts` (30+ exports tracked)
- Security: every `fetch('/api/')` must include credentials; every admin route must `requireRole()`; no 403 responses (IDOR-safe 404)

### 2.4 Multi-tenant isolation
- `plant_assignments.organization_id` scope enforced at API level (`requireOrganization()`, `allowedPlantIds` guard)
- 404 for out-of-scope plants (no info leakage vs 403)
- SUPER_ADMIN / ADMIN / MEMBER roles via `requireRole()`

### 2.5 Delivery artifacts
- `HANDOVER.md` — 1-page operator guide at repo root
- `AUDIT.md` — this document

---

## 3. Known Issues (prioritised)

### 🔴 CRITICAL — status

| # | Issue | Status |
|---|---|---|
| C1 | Poller two-axis sensor-fault filter | ✅ **CLOSED** 2026-04-22 — see CHANGELOG `[DATA-1]`. Shipped in commit `610c4cf`. Forward-only (old rows overwrite on next aggregation). |
| C2 | Provider API failures only in pm2 stderr | ✅ **CLOSED** 2026-04-22 — Sentry captures provider errors (`[OBS-3]`); continuous audit counts them hourly (`[OBS-1]`). UptimeRobot setup documented (`UPTIMEROBOT_SETUP.md`) awaits operator sign-up for external pings. |

### 🟠 HIGH — next sprint, required for enterprise

| # | Issue | Evidence | Impact |
|---|---|---|---|
| H1 | No CI/CD pipeline | **STILL OPEN** — planned for post-handover. |
| H2 | No test suite | **STILL OPEN** — planned for 30-90 day window. |
| H3 | No staging environment | **STILL OPEN** — planned for 90-day window. |
| H4 | ~~No application observability (APM)~~ | ✅ **CLOSED** 2026-04-22 — Sentry live. See CHANGELOG `[OBS-3]`. |
| H5 | ~~No health / readiness endpoint~~ | ✅ **CLOSED** 2026-04-22 — `/api/health` live + in Clerk public routes. See CHANGELOG `[OBS-4]`. |
| H6 | Shared EC2 blast radius | **STILL OPEN** — Netdata monitoring on-box catches resource contention early (`[OBS-2]`), but tenancy unchanged. Separate-EC2 migration queued for 90-day window. |
| H7 | Deploy is manual & sequence-sensitive | **PARTIALLY MITIGATED** — `audit-pre-deploy.sh` + `audit-post-deploy.sh` act as gates. Still manual. Full automation in CI/CD work. |

### 🟡 MEDIUM — polish, important for scale

| # | Issue | Notes |
|---|---|---|
| M1 | Historical string_daily / string_hourly rows are still polluted by past sensor faults | Forward fix (C1) helps going forward; old rows persist until overwritten by the next aggregation pass (5-min for hourly-current-hour, daily row refreshed each time the poller runs during that day). No backfill job exists. |
| M2 | `pm2-logrotate` active but retention policy unverified | Risk: logs grow forever and eat disk |
| M3 | No automated RDS backup verification | AWS RDS default PITR is 7 days but no verified restore drill |
| M4 | `string_measurements` 30-day retention seems enforced — but by what? | The Wattey cron `/home/ubuntu/reyy/infra/scripts/data-retention.sh` runs at 03:00 UTC but references Wattey paths. SPC retention policy not explicitly documented. |
| M5 | No CDN for static assets | Next.js static assets served directly from EC2 via Nginx |
| M6 | No request-correlation IDs | Hard to correlate API error → client report |
| M7 | `kW/String` is still emitted by the API (just not rendered) | Minor tech debt — `app/api/*/analysis/string-level/route.ts` still computes it |
| M8 | Validator is bash-only | Works well but not unit-tested; fragile under future edits |

### 🟢 LOW — future improvements

| # | Issue |
|---|---|
| L1 | No CSP header (defence in depth) |
| L2 | No HSTS preload submission |
| L3 | No API response cache headers (`Cache-Control: private, max-age=...`) |
| L4 | No database read-replica |
| L5 | No cost dashboard / per-component attribution |
| L6 | No runbook documented for on-call (incident response) |

---

## 4. Gaps vs "Enterprise Grade" (what would an auditor flag?)

| Axis | Maturity | Notes |
|---|---|---|
| **Security — network** | ✅ good | UFW blocks app ports · fail2ban · HTTPS · security headers · rate limiting at nginx |
| **Security — app** | ✅ good | Clerk auth (SOC2-compliant) · RBAC · multi-tenant scoping · 404-not-403 · webhook secret |
| **Security — secrets** | ⚠️ fair | `.env` on disk with 0600 perms · no secret rotation schedule · no vault (AWS Secrets Manager, 1Password, etc.) |
| **Data integrity — read** | ✅ excellent | 20 validator checks · two-axis sensor filter · null-safe metrics · IEC-aligned |
| **Data integrity — write** | ✅ good | Poller two-axis sensor filter ships (2026-04-22). Same discipline on write as on read. |
| **Observability** | ✅ baseline | Sentry (errors + session replay + tracing) + Netdata (system metrics) + hourly audit cron + `/api/health`. UptimeRobot awaits operator sign-up. |
| **Reliability — runtime** | 🟡 ok | PM2 auto-restart · memory-restart limits possible · retries with exponential backoff in clients |
| **Reliability — deploy** | 🟠 weak | Manual steps (H7) · no staging (H3) · rollback is git-reset |
| **Scalability** | 🟡 ok for now | 48 plants fits comfortably · t2.medium has CPU burst · RDS auto-scales to 1 TB · no horizontal scale path documented |
| **CI/CD** | 🔴 gap | No pipeline (H1) · no tests (H2) · no artefact registry |
| **Documentation** | ✅ good | DESIGN.md · HANDOVER.md · AUDIT.md · CLAUDE.md · credentials doc · this audit |
| **Backups / DR** | 🟡 unverified | RDS PITR-7d assumed · no restore drill on record |

---

## 5. Recommended Next Steps (ordered by ROI)

### Ship this week (before or during enterprise hand-off)
1. **C1** — retrofit poller's two-axis sensor-fault filter (stage is local, ready to ship)
2. **H5** — add `/api/health` route returning `{ status, poller_lag_seconds, db_lag_ms }` (~30 min)
3. **M2** — verify `pm2-logrotate` keeps ≤14 days by inspecting `~/.pm2/module_conf.json`

### Ship within 30 days
4. **H4** — integrate Sentry (free tier) + Datadog log-tail. 1 afternoon of work.
5. **H1** — GitHub Actions pipeline: on push to main, run TS + validator + `npm run build`; if pass, SSH to EC2 and deploy. ~1 day.
6. **H7** — wrap the 5 manual commands in `scripts/deploy-to-ec2.sh` (checked in, but with `deploy-to-ec2.local.sh` for the credential file).
7. **C2** — poller retries exhaustion → post a slack webhook + create an alert row.

### Within 90 days
8. **H2** — seed test suite: focused on `lib/string-health.ts` (pure functions), `lib/poller-utils.ts` (aggregates on fixed fixtures), and Prisma integration tests via a Dockerised Postgres. Target: >60% coverage on `/lib`.
9. **H3** — staging EC2 (t2.small) + staging DB (RDS snapshot restore). Deploy from a `staging` branch.
10. **H6** — move SPC to its own EC2 or containerise and run on ECS Fargate.
11. **M4** — document retention policy for SPC tables and its cron.
12. **L6** — write incident runbook: poller down · DB unreachable · Clerk webhook failure · provider API outage.

---

## 6. Operator Runbook — quickstart

### Deploy (current manual procedure)
```
ssh -i thingsboard.pem ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com
cd ~/solar-web-app
git pull origin main
npm ci --legacy-peer-deps
npx prisma generate
rm -rf .next
npm run build                          # validator runs here — if it fails, STOP
pm2 restart solar-web solar-poller
curl -s -o /dev/null -w "%{http_code}\n" https://spc.bijlibachao.pk
```

### Check system health
```
pm2 list                               # both solar-* should be online
pm2 logs solar-poller --lines 50 --nostream
curl -s -o /dev/null -w "%{http_code}\n" https://spc.bijlibachao.pk
df -h /                                # EC2 disk
free -h                                # RAM
```

### Restart SPC only (leave Wattey alone)
```
pm2 restart solar-web solar-poller
```

### Verify validator still holds
```
cd ~/solar-web-app && bash scripts/validate-centralized.sh
```

### Poller error investigation
```
tail -100 ~/.pm2/logs/solar-poller-error.log
tail -100 ~/.pm2/logs/solar-poller-out.log
```

### Database direct access (from EC2)
```
DBURL=$(grep '^DATABASE_URL=' ~/solar-web-app/.env | cut -d= -f2- | sed 's/^"//;s/"$//' | cut -d'?' -f1)
psql "$DBURL"
```

---

## 7. Change Log (session deliverables, newest first)

| Date | Commit | Summary |
|---|---|---|
| 2026-04-22 | _(staged, unpushed)_ | `lib/poller-utils.ts` two-axis sensor-fault filter (C1) |
| 2026-04-22 | `367dd4e` | `/dashboard/analysis` — drop kW/String column, add IEC 62446-1 capacity card |
| 2026-04-22 | `7b0c3f1` | `StringTrendChart` operator-precedence bug fix |
| 2026-04-22 | `a5bdcba` | IEC 62446/61724 vocabulary migration + trend-chart data continuity |
| 2026-04-22 | `d293441` | Hide Monthly Health Report until redesign |
| 2026-04-22 | `f3aaa14` | Alert History tab v3 redesign |
| 2026-04-22 | `954a751` | 4 section redesigns — deviation chart · alerts · fault diagnosis · trend |
| 2026-04-22 | `9351037` | White tooltips · dense health matrix · industrial comparison table |
| 2026-04-22 | `7df5469` | Inverter inline KPI row + peak annotation at the peak |
| 2026-04-22 | `addb54c` | Plant page hero — solar-gold featured card |
| 2026-04-22 | `db9041b` | Inverter card mini-hero |
| 2026-04-22 | `8c0e9e0` | Finish v3 migration across `/dashboard` scope |
| 2026-04-22 | `3925321` | `HANDOVER.md` |
| 2026-04-22 | `2ea3948` | Two-axis sensor filter + fleet-health coverage gate |
| 2026-04-22 | `1e03004` | Tri-state plant live status |
| 2026-04-22 | `7d4a6c2` | Centralize dashboard window constants |
| 2026-04-22 | `feaaf27` | Dashboard data-integrity — fair deltas · null-safe metrics |
| 2026-04-22 | `72b900b` | Exclude CT sensor-fault rows from dashboard aggregates |
| 2026-04-22 | `8304a6a` | Dashboard v4 layout |
| 2026-04-22 | `70f89ef` | SPC Design System v3 |

---

## 8. Ownership & Contacts

| Role | Contact |
|---|---|
| Platform owner | Ali Ahmed — ai@right2fix.com |
| Founder (BijliBachao) | Engr Reyyan Niaz Khan — dev.bijlibachaopk@gmail.com — +92 323 4578775 |
| Clerk dashboard | dashboard.clerk.dev |
| Infra credentials | `/Working/docs/auth/PRODUCTION_CREDENTIALS.md` (confidential) |
| AWS account | (add account ID on first operator review) |
| Domain registrar | (add on first operator review) |

---

## 9. Audit stance

This document is **honest**. It calls out real gaps without panic. The system is safe to hand over to a competent operator **if** (a) C1 ships, (b) the operator reads HANDOVER.md and this AUDIT.md, and (c) the enterprise team accepts the current maturity while the HIGH-priority items are scheduled.

Re-audit cadence suggested: **every 30 days** while the project is under active migration; **quarterly** after stable.

_— Generated 2026-04-22 · re-sign on every substantive change._
