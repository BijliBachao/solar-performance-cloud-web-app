# SPC RDS Connection Audit

**For:** Wattey developer team
**From:** SPC (Solar Performance Cloud) team
**Purpose:** Coordination audit on the shared RDS instance `bijli-bachao-db.cgposcwuc9y6.us-east-1.rds.amazonaws.com` (`db.t3.micro`, `max_connections = 87`).
**Last updated:** 2026-04-27
**SPC contact:** ai@right2fix.com

> **Context:** Both apps connect to the same RDS instance. SPC uses database `solar_dashboard`; Wattey uses `energy_monitoring`. `max_connections = 87` is per-instance, not per-database — both apps share the same ceiling. This document reports SPC's committed connection budget so a combined budget can be planned.

---

## Question 1 — DATABASE_URL parameters

| Parameter | Value |
|---|---|
| `connection_limit` | **20** |
| `pool_timeout` | **60** |
| `connect_timeout` | **30** |
| `statement_timeout` | **30000** (ms) |
| `sslmode` | **require** |
| host | `bijli-bachao-db.cgposcwuc9y6.us-east-1.rds.amazonaws.com:5432` |
| database | `solar_dashboard` |

**Source:** `Working/deploy-to-ec2.sh:157` — this script writes the production `.env` on the EC2 host. The repo itself contains only `.env.example` (no `.env`, no `.env.production`, no `.env.local`).

---

## Question 2 — PM2 processes and Prisma pools

SPC runs **2 PM2 processes** (no `ecosystem.config.js` exists; processes are started inline by the deploy script).

| Process | Entry point | Effective `connection_limit` | Per-process override |
|---|---|---|---|
| `solar-poller` | `scripts/run-poller.ts` (run via `npx tsx`) | **20** | none |
| `solar-web` | `npm start` → Next.js production server | **20** | none |

**PM2 process definitions:** `Working/deploy-to-ec2.sh:249-253` (poller), `Working/deploy-to-ec2.sh:261-265` (web).

**PrismaClient instantiation — single source of truth:**
- File: `lib/prisma.ts:9-15`
- Uses bare `process.env.DATABASE_URL` — no per-client URL rewrite, no `connection_limit` override anywhere in the codebase.
- Both processes import this same client; each Node runtime gets its own instance with its own pool of 20.

**TOTAL committed: 40 connections** (20 × 2 processes)

---

## Question 3 — Concurrent DB usage patterns

### `solar-poller` cycle
- Polls 4 inverter providers in parallel via `Promise.allSettled` — `scripts/run-poller.ts:14-19`
- Cron-scheduled every 5 min — `scripts/run-poller.ts:45`
- Each provider performs `prisma.$transaction` batches (a single transaction holds one connection until all queries inside it commit):
  - `lib/huawei-poller.ts:46`, `:89`, `:121`
  - `lib/solis-poller.ts:71`, `:108`
  - `lib/growatt-poller.ts:82`, `:190`, `:208`
  - `lib/sungrow-poller.ts:95`, `:134`, `:165`
  - `lib/poller-utils.ts:280`, `:388` (hourly + daily aggregate updaters)
- Realistic peak per cycle: 4 simultaneous transactions (one per provider) plus per-device sequential upserts. Worst-case peak inside the poller process: ~10–15 concurrent connections.

### Cron jobs hitting DB
- 5-min poll cycle: `scripts/run-poller.ts:45`
- Daily 02:00 UTC cron (data retention cleanup): `scripts/run-poller.ts:63`
- Both crons run inside the **same** `solar-poller` process — no additional pool, no additional connection commitment.

### `Promise.all` DB query fan-out
- The only `Promise.allSettled` over DB-heavy operations is in `scripts/run-poller.ts:14-19` (the 4-provider parallel poll).
- No `Promise.all` over an array of DB queries was found in the pollers or routes that would meaningfully spike concurrent connections beyond the patterns above.

---

## Question 4 — Existing pooling infrastructure

| Item | Status |
|---|---|
| PgBouncer | **No** |
| RDS Proxy | **No** |
| Other external pooler | **No** |

**Evidence:** Full codebase grep for `pgbouncer | rds.proxy | rdsproxy | pgPool | connection.pool` returned **zero hits** outside `node_modules/`. Only Prisma's built-in connection pool is in use.

---

## Question 5 — Live `pg_stat_activity`

**Skipped.** A direct SSH + `psql` query against the production database to fetch live `pg_stat_activity` was blocked by the local Bash permission policy — production reads require explicit operator approval naming the prod target, and that authorization was not in scope for this audit.

If live numbers are needed, the SPC operator can run the query manually:
```sql
SELECT datname, application_name, state, count(*) AS conn_count
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname, application_name, state
ORDER BY datname, conn_count DESC;
```
and share the output separately.

---

## Summary line for the coordination spreadsheet

| App | Committed | Realistic peak (estimated, no live data) |
|---|---|---|
| SPC | **40** | ~20–30 |
| Wattey | 40 (per their report) | — |
| **Combined committed** | **80 of 87** | — |
| **Headroom** | **7** | — |
