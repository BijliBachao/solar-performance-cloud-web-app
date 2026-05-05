# Solar Performance Cloud (SPC)

> Pakistan's first string-level solar performance monitoring platform. A product of [Bijli Bachao](https://bijlibachao.pk). Live at **[spc.bijlibachao.pk](https://spc.bijlibachao.pk)**.

---

## What is SPC?

A Next.js 14 web app that tracks every PV string on commercial solar plants across Pakistan — live every 5 minutes, across Huawei, Solis, Growatt, and Sungrow inverters. Engineer-installed monitoring device at the plant, independent from vendor apps.

**Today's scale:** 48 plants · 2.2 MW · 1.3M+ measurements · 25,000+ faults detected.

Full change log in [`CHANGELOG.md`](./CHANGELOG.md). Internal planning, design, audit, post-mortem, and handover docs are maintained outside this repo (operator-only).

---

## Repo structure

```
solar-performance-cloud-web-app/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Public landing page
│   ├── layout.tsx                    # Root layout + full metadata + OG image
│   ├── opengraph-image.tsx           # Generated 1200x630 social preview card
│   ├── dashboard/                    # Signed-in customer dashboard
│   ├── admin/                        # Super-admin surfaces
│   ├── api/
│   │   ├── health/                   # Public /api/health JSON endpoint
│   │   ├── sentry-test/              # Sentry smoke test route
│   │   └── ...
│   └── providers.tsx                 # Clerk + theme providers
│
├── components/shared/                # Reusable UI (design-token discipline enforced by validator)
│
├── lib/
│   ├── string-health.ts              # Single source of truth for thresholds / classification
│   ├── design-tokens.ts              # Status colour lookups (STATUS_STYLES)
│   ├── poller-utils.ts               # Alert generation, aggregation, sensor-fault filter
│   ├── huawei-client.ts | solis-client.ts | growatt-client.ts | sungrow-client.ts
│   └── api-auth.ts                   # requireRole / requireOrganization helpers
│
├── scripts/
│   ├── run-poller.ts                 # Poller orchestrator (runs every 5 min via pm2)
│   ├── validate-centralized.sh       # 20-check design-system validator (build gate)
│   ├── audit-pre-deploy.sh           # 6-check pre-deploy audit (local)
│   ├── audit-post-deploy.sh          # 5-check post-deploy audit (EC2)
│   └── audit-continuous.sh           # Hourly cron on EC2
│
├── prisma/schema.prisma              # 9 models
├── public/landing/reyyan.jpeg        # Founder headshot used in landing page
├── middleware.ts                     # Clerk auth + public-route matcher
│
└── [README.md, CHANGELOG.md]
```

---

## Architecture at a glance

```
                     ┌─────────────────────────┐
                     │  Customer               │
                     │  -> spc.bijlibachao.pk  │
                     └───────────┬─────────────┘
                                 │ HTTPS
                                 ▼
                     ┌─────────────────────────┐
                     │  EC2 t2.medium          │
                     │  shared with Wattey     │
                     │  ├─ nginx (port 80/443) │
                     │  ├─ PM2                 │
                     │  │   ├─ solar-web:3001  │ <- Next.js app
                     │  │   └─ solar-poller    │ <- 5-min cron, 4 providers
                     │  └─ Netdata:19999       │ <- localhost only
                     └───────────┬─────────────┘
                                 │
         ┌───────────────────────┼──────────────────────────┐
         ▼                       ▼                          ▼
  ┌────────────┐        ┌──────────────────┐        ┌─────────────┐
  │ AWS RDS    │        │ Inverter APIs    │        │ Sentry      │
  │ PostgreSQL │        │ Huawei · Solis   │        │ (errors)    │
  │ 9 tables   │        │ Growatt · Sungrow│        └─────────────┘
  └────────────┘        └──────────────────┘
```

---

## Tech stack

- **Framework:** Next.js 14.2.35 App Router
- **Auth:** Clerk (prod keys in `.env`; webhooks via svix)
- **ORM:** Prisma 6 + PostgreSQL 17 on AWS RDS
- **Observability:** Sentry (server + edge + browser + Session Replay + source maps) · Netdata on EC2 · hourly audit cron
- **Runtime:** Node 20 · PM2 (fork mode today; cluster mode planned in CI/CD Phase 4)
- **Infra:** Single EC2 t2.medium shared with sibling app (Wattey) · nginx reverse proxy · UFW firewall · fail2ban · Let's Encrypt SSL (auto-renew)
- **Fonts:** Inter via `next/font/google`
- **Styling:** Tailwind CSS (tokens in `tailwind.config.ts`)

---

## Local development

```bash
git clone <repo> && cd solar-performance-cloud-web-app
npm install --legacy-peer-deps      # React 19 requires this
npx prisma generate
npm run dev                         # http://localhost:3000
```

Requires a `.env` with `DATABASE_URL`, Clerk keys, and inverter API credentials. Full list in the operator handover doc (kept outside this repo).

---

## Deployment

### Today (manual)

```bash
ssh -i ~/.ssh/thingsboard.pem ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com
cd ~/solar-web-app
git pull origin main
npm ci --legacy-peer-deps
npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19   # 2026-04-22 defensive fix
npx prisma generate
rm -rf .next && npm run build
pm2 restart solar-web solar-poller
bash scripts/audit-post-deploy.sh
```

### Helper script

`/home/mudassir/work/Ali/websites/untitled2/sol/Working/deploy-to-ec2.sh` automates the above with pre-deploy audit + fail-fast on uncommitted. Local-only, `.gitignored` (contains secrets).

### Future (automated)

CI/CD pipeline design is drafted (operator-only). Not yet built — scheduled for when the calendar clears.

---

## Critical operational rules

These are non-negotiable. If code contradicts them, **fix the code, not the rules.**

### Design system

- **Product (dashboard/admin):** solar-gold `#F59E0B` brand, white canvas, slate text.
- **Landing page only:** NVIDIA green `#76B900` accent, warm-cream canvas (deliberate exception to the product theme).
- **No pure black anywhere.** Slate-900 (`#0F172A`) where dark is needed.
- **Status colours** flow through `STATUS_STYLES` in `lib/design-tokens.ts` — never inline `text-emerald-*` / `bg-red-*` for status.

### Data integrity

- **String health thresholds** live only in `lib/string-health.ts`. No inline `0.1`, `25`, `50`, `90` anywhere else. The validator (`scripts/validate-centralized.sh`) blocks violations.
- **Sensor-fault filter** applied on BOTH read side (aggregate queries) and write side (`lib/poller-utils.ts` `dropSensorFaults()`).
- **Tri-state plant liveness:** PRODUCING / IDLE / OFFLINE. Never fake "LIVE at night".
- **Fleet health returns null** when < 50% of yesterday's reporting strings show up today.

### Security

- **Clerk auth** on all routes except the public matcher in `middleware.ts`.
- **Admin routes** (`/admin/*`) require `requireRole('SUPER_ADMIN')` check on the server.
- **Never `git add -A`** (the old deploy script did; replaced).
- **`.env*` files .gitignored.**

### Deploy safety

- Run `scripts/audit-pre-deploy.sh` before every push (today voluntary; mandatory after CI/CD lands).
- Run `scripts/audit-post-deploy.sh` after every deploy (automated by the post-deploy SSH step).
- Never skip the `@types/react@^19` defensive install (peer-dep mismatch caused a 502 outage on 2026-04-22).

### Documentation discipline

- **Every major infrastructure change** → document in [`CHANGELOG.md`](./CHANGELOG.md).
- **Every incident** → new dated post-mortem in the operator-only Working folder, linked from `CHANGELOG.md`.
- **Every design decision** → update the relevant design doc (operator-only).
- **Threshold or classification changes** → must be made only in `lib/string-health.ts`. The validator (`scripts/validate-centralized.sh`) blocks inline thresholds anywhere else.

---

## Known risks & open items

Tracked in the operator-only audit doc. Summary of standing items:

| ID | Risk | Mitigation | Scheduled |
|---|---|---|---|
| SEC-2 | 7 Next 14.x DoS CVEs | nginx rate limit · fail2ban · no `images.remotePatterns` | Next.js 15 upgrade (30-day window) |
| H1 | No CI/CD pipeline | Audit scripts as voluntary gate | GitHub Actions (30-day window) |
| H2 | No automated test suite | TS + validator + manual QA | Unit + integration (60-day window) |
| H3 | Shared EC2 with Wattey | Netdata watches contention | Separate infra (90-day window) |
| M1 | Pre-filter sensor-fault rows in old `string_daily` / `string_hourly` | Forward filter shipped; old rows overwrite on next aggregation | Optional backfill script |
| — | UptimeRobot external monitoring | `/api/health` ready | **Awaiting external signup (10 min)** |

---

## Contacts

| Topic | Contact |
|---|---|
| Platform owner / technical | Ali Ahmed · `mudassir@right2fix.com` / `ai@right2fix.com` |
| Founder (Bijli Bachao) | Engr. Reyyan Niaz Khan · WhatsApp +92 323 457 8775 |
| Auth / Clerk dashboard | https://dashboard.clerk.dev |
| EC2 / infra credentials | `Working/docs/auth/PRODUCTION_CREDENTIALS.md` (local, not in repo) |

---

## Recent milestones

See [`CHANGELOG.md`](./CHANGELOG.md) for the append-only change log.

- **2026-04-22** — Observability baseline shipped (Sentry + Netdata + audit toolkit + `/api/health`). Data integrity overhaul (sensor-fault filter on write side). Design system v3 migration. Security: Clerk CVE patched. Incident: 3-min 502 outage from peer-dep mismatch.
- **2026-04-23** — Landing page full structural redesign (warm-cream canvas + NVIDIA green accent + Mastercard asymmetric layouts + real founder photo). Internal design and product docs published.
- **2026-04-30** — Two false-alert sources eliminated. **Phase A** added a per-string `is_used` flag so admins can mark empty PV ports — induction-leak noise on disconnected channels stops triggering 96 %-below-peers CRITICAL alerts. **Phase B** added `exclude_from_peer_comparison` so non-standard installs (wall-mounted, east/west, shaded) drop out of the peer pool — they keep their real V/A/P readings on the dashboard but no longer fire CRITICAL alerts for being "below peers" by design. Hardware alarms, dead-string detection, stale-data detection, and sensor-fault filtering remain active on flagged strings. Co-tenant RDS upgraded the same day from `db.t3.micro` to `db.t4g.small` (Postgres 17.6); SPC's `connection_limit` held at 20 — measured live usage is 19/40, no bump justified. New `STATUS_STYLES['peer-excluded']` design token centralizes the indigo "non-standard" UI across `StringComparisonTable`, `StringHealthMatrix`, `InverterDetailSection`, and the admin per-row pill. A dedicated launch checklist (operator-only) documented the deploy runbook including the `prisma db push` schema-sync step, smoke tests, and rollback plan.

---

*A product of [BijliBachao.pk](https://bijlibachao.pk) · Made with engineering, not hype.*
