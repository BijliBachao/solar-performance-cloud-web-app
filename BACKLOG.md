# SPC Backlog — Open Engineering Tasks

**Living document.** Mirror of the task list with full file paths, references, and couplings. Read this first when picking up SPC work.

**Last updated:** 2026-04-30
**Baseline commit:** `3793256`
**Direction:** No more design work. Logic + performance + reliability only. The v3 design migration phases (#86–#89) have been **discarded**.

---

## Quick status table

| ID | Task | Couples with | Status | Effort |
|---|---|---|---|---|
| **#76** | Page: `/admin/analysis` | — | Pending — discuss separately with user | TBD |
| **#96** | Performance Ratio (Phase 2) | #105 | Pending — full plan doc, waits on Phase 1 panel configs being filled | 1–2 h |
| **#97** | DB query performance — parallelise transactions | #98 | Pending | 4–6 h |
| **#98** | Connection-budget compliance | #97, #104 | **Pending — user is upgrading RDS, may resolve when done** | 30 min |
| **#99** | Server Action log noise | — | Pending — pre-existing, unknown cause | 1–3 h |
| **#100** | Poller resilience — defensive parsing | #101 | Pending | 2–4 h |
| **#101** | Test suite (Vitest) | #100, #103 | Pending | 1–2 days first wave |
| **#102** | Data retention audit | — | Pending — M4 from `AUDIT.md` | 2–3 h |
| **#103** | CI/CD (GitHub Actions) | #101 | Pending — replaces manual deploy script | 4–8 h |
| **#104** | Rate limiting `/api/admin/*` | #98 | Pending — important pre-RDS-upgrade | 2–4 h |
| **#105** | Tighten sensor-fault filter | #96 | Pending | 2–3 h |

**Total backlog:** 11 open items.

---

## Cross-reference map

```
#96 (Perf Ratio) ──── needs ───→ Phase 1 admin must fill panel configs
#96 ──── enables ───→ #105 (per-nameplate sensor-fault filter)

#97 (parallel transactions) ──── blocked by ───→ #98 (RDS upgrade)
#98 (connection budget) ──── may resolve via ───→ user RDS upgrade
#104 (rate limiting) ──── mitigates ───→ #98 risk before upgrade

#100 (defensive parsing) ──── needs ───→ #101 (test infrastructure)
#101 (tests) ──── feeds ───→ #103 (CI/CD as a deploy gate)
#103 (CI/CD) ──── replaces ───→ Working/deploy-to-ec2.sh
```

---

## Discarded / out of scope

These were on the previous task list but **deleted** on 2026-04-30 per user direction (no more design work):

- ~~#86 — v3 Phase 5: Remaining shared components~~
- ~~#87 — v3 Phase 6: Admin re-migration~~
- ~~#88 — v3 Phase 7: Auth + landing pages~~
- ~~#89 — v3 Phase 8: Validation script + final deploy~~

The 4 auth pages remain on the OLD orange-amber gradient (`app/sign-in/[[...sign-in]]/page.tsx:8`) — **intentional**. Customer-facing dashboard + admin + landing are the only surfaces in v3 today, and that's enough.

---

# Detailed task records

## #76 — Page: `/admin/analysis`

**Status:** Pending — user wants to discuss separately.

What's there today: nothing yet. The other admin pages (`/admin`, `/admin/plants`, `/admin/users`, `/admin/organizations`) all exist; `/admin/analysis` was deferred.

**Pickup path:** ask user what `/admin/analysis` should contain — fleet-wide string analysis? Cross-plant performance comparison? Usage analytics?

---

## #96 — Performance Ratio (Phase 2 of String Panel Config)

**Full plan doc:** [`PLAN-performance-ratio-phase2.md`](./PLAN-performance-ratio-phase2.md)

**TL;DR:** Add absolute-vs-nameplate health metric alongside existing peer-comparison alerts. Catches fleet-wide degradation that current peer-only logic misses.

**Formula:**
```
nameplate_kwp   = panel_count × panel_rating_w / 1000
theoretical_kwh = nameplate_kwp × 5.5 PSH (Pakistan avg)
PR              = (actual_kwh / theoretical_kwh) × 100
loss_pkr        = (theoretical_kwh − actual_kwh) × tariff_per_kwh
```

**Prerequisite:** Phase 1 (string_configs table + admin page) is **deployed** in commit `0575bd7`. Table is **empty** — admin must sign in as SUPER_ADMIN at `/admin/plants/[code]/strings` and fill panel configs for at least one plant before Phase 2 produces visible numbers.

**Recommended size:** Small (1–2 h). Fixed `PEAK_SUN_HOURS = 5.5` constant. Compute PR on API read (no schema change).

**Files to touch:**
- `lib/string-health.ts` — new helpers: `nameplateKwp()`, `theoreticalKwh()`, `performanceRatio()`
- `app/api/plants/[code]/strings/route.ts` — already LEFT JOINs `string_configs`. Add `performance_ratio`, `theoretical_kwh_today`, `kwh_lost_today` to response
- `app/api/dashboard/analysis/string-level/route.ts` — same pattern
- `components/shared/StringComparisonTable.tsx` — add PR pill alongside existing "Panels" + peer-gap columns
- `components/shared/InverterDetailSection.tsx` — surface inverter-avg PR at section header

**DO NOT touch:**
- The `kWh` column anywhere (sacred — trapezoidal-integrated actual generation)
- `string_daily.health_score` formula (existing dashboards depend on it)
- Existing peer-comparison alerts in `lib/poller-utils.ts`

**Open questions to resolve before coding:**
1. Tariff — global PKR 50 constant, or per-plant configurable?
2. PR averaging window — today's, 7-day rolling, or both?
3. Alert threshold — at what PR (70%? 60%?) trigger fleet-wide-degradation alert?
4. kWp vs kW unit consistency in UI

**Reference:** IEC 61724-1 — defines PR as the industry-standard absolute health yardstick.

---

## #97 — DB query performance: parallelise sequential `$transaction` chains

**Why:** Pollers run device upserts inside sequential `prisma.$transaction` calls — for plants with many devices this serialises DB work that could fan out.

**Files & line numbers:**
- `lib/huawei-poller.ts` — `$transaction` at `:46`, `:89`, `:121`
- `lib/solis-poller.ts` — `$transaction` at `:71`, `:108`
- `lib/growatt-poller.ts` — `$transaction` at `:82`, `:190`, `:208`
- `lib/sungrow-poller.ts` — `$transaction` at `:95`, `:134`, `:165`
- `lib/poller-utils.ts` — `updateHourlyAggregates` / `updateDailyAggregates` use `$transaction` at `:280`, `:388`

**Goal:** cut poll-cycle latency by parallelising independent per-device upserts (`Promise.all` batches inside a single transaction, or `createMany` where ordering doesn't matter). Keep per-row error isolation so one bad device doesn't kill the cycle.

**Coupling:**
- **#98** — more parallelism = more concurrent connections. **Wait for the RDS upgrade before fanning out aggressively.**
- **#100** — defensive parsing complements this; less risk of bad rows aborting parallel work.

**Baseline measurement:** Solar-poller logs show `[Provider] Starting poll cycle...` and `[Provider] Poll cycle complete.` timestamps — diff between them is the per-provider duration. Capture before/after.

**DO NOT:** change cron interval (5 min) or schema. Write-path optimisation only.

---

## #98 — Connection-budget compliance: align SPC's `connection_limit` with shared RDS ceiling

**Audit doc:** [`SPC-RDS-CONNECTION-AUDIT.md`](./SPC-RDS-CONNECTION-AUDIT.md)

**Current state:**
- Shared `db.t3.micro` RDS instance: `max_connections=87`
- SPC committed: 40 (`connection_limit=20` × 2 PM2 processes)
- Wattey committed: 40
- Combined: 80/87 → 7 headroom
- Realistic SPC peak: ~25 (well under 40 budget)

**Fix options:**

| Option | What | Trade-off |
|---|---|---|
| **A** — Tighten | Change `connection_limit=20` → `15` in `Working/deploy-to-ec2.sh:157` DATABASE_URL. SPC commits 30, total 70/87. Realistic peak (~25) stays under. | Cheap, no infra change. Risky if SPC peak rises. |
| **B** — Upgrade (preferred) | Bump RDS to `db.t3.medium` → `max_connections` jumps to ~140 automatically. ~$15/month more. No app changes needed. | **User is doing this — task may resolve when done.** |

**Where the value lives:** `Working/deploy-to-ec2.sh:157` (production .env writer). Local repo has only `.env.example`, no `.env` file.

**DO NOT:** bump `connection_limit` upward without confirming the new instance class. Easy to overflow.

---

## #99 — Investigate "Failed to find Server Action 'x'" log noise

**Symptom:** `solar-web` stderr repeatedly logs:
```
Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
Original error: Cannot read properties of undefined (reading 'workers')
```

**Key observations:**
- Action name is literally `"x"` (one character) — looks like a stale reference, not real code
- Existed BEFORE today's vendor-alarms / panel-config / TopBar work — not caused by recent changes
- Repeats in tight loop (multiple lines per minute) — not transient
- Seen during recent deploy audits and the SPC connection audit

**Investigation path:**
1. SSH to EC2, get full stack trace:
   ```
   pm2 logs solar-web --lines 200 --nostream | grep -B 2 -A 8 'Server Action'
   ```
2. Look for stale Server Action calls in `app/` — possibly Clerk-internal, possibly dead code from a removed feature
3. Check if it's a build-cache issue (`rm -rf .next` on EC2 + rebuild) vs a code issue
4. If Clerk-internal: check `@clerk/nextjs` version, look for known issues
5. If app code: trace and either fix the action or remove the dead caller

**Goal:** zero such errors in solar-web stderr over 10-min window (currently >50/min).

**DO NOT:** ignore + suppress. Real noise often hides real bugs.

---

## #100 — Poller resilience: defensive parsing for malformed vendor API data

**Why:** Vendor APIs occasionally return junk that breaks downstream logic. Recent example: Solis returns `id="-1"` for every alarm, caused 99 collisions until we built composite key in fix commit `874d408`.

**Known patterns to harden:**
- Solis `id="-1"` placeholder (already fixed for alarms — extend to other endpoints?)
- Possible: other Solis fields might also have placeholder values we haven't seen
- Huawei `devName` casing changes — string match could break
- Growatt `"Bat Online"` status text — not handled in some health mappers
- Sungrow `today_energy` in `p1` returns Wh not kWh (we hit this in commit `2210877`)
- NaN / null voltages from offline strings
- Decimal overflow on out-of-range current readings

**Files:**
- `lib/{huawei,solis,growatt,sungrow}-client.ts` — input layer
- `lib/{huawei,solis,growatt,sungrow}-poller.ts` — write layer
- `lib/string-health.ts` — already has `MAX_STRING_CURRENT_A` and `MAX_STRING_POWER_W` sensor-fault thresholds

**Approach:**
1. Audit each client method's response — list assumptions about field shape/type/range
2. Add a single `normalise()` pass per provider that returns a canonical shape (or skips bad rows)
3. Log a counter (`"[Solis] Skipped 3 alarms with null SN"`) instead of throwing
4. Tests around the normalise functions would catch future drift (couples with **#101**)

**Recent incident commits for context:**
- `874d408` — Solis `id="-1"` composite-key fix
- `2210877` — Sungrow Wh→kWh divisor fix
- `a4df4c6` — Solis pagination fix (was capping at 100)

**DO NOT:** block the whole poll cycle on one bad row. Today's catch-and-continue pattern is good — keep it.

---

## #101 — Add automated test suite (currently zero tests)

**Why:** SPC has zero automated tests. Every regression has been caught by manual smoke testing or production logs (e.g., bulk-apply error handling miss, Solis `id="-1"`).

**Recommended minimal coverage:**
1. `lib/string-health.ts` — pure functions (`classifyRealtime`, `isStale`, `leaveOneOutAvg`, `bucketHealthScore`). Easy unit tests, high value.
2. `lib/poller-utils.ts` — `generateAlerts`, `updateDailyAggregates` math (mock prisma, assert correct severity boundaries fire)
3. API auth boundaries — verify org-scoped endpoints reject unauthenticated and other-org access
4. The 4 provider clients — mock fetch, feed canned responses, assert `normalise()` output (catches vendor API drift)

**Tooling decisions:**
- Test runner: **Vitest** (works with Next 14, fast, zero config beyond install)
- Mock DB: skip — use prisma-client-js mock at unit level
- Coverage target initial: 30% on `lib/`, focus on the high-value paths above

**Non-goals:** do NOT try to test all UI components. Test logic, leave UI to manual smoke + visual review.

**Integration:**
- Add to `scripts/audit-pre-deploy.sh` as a 6th check (`npm test must pass`)
- CI hookup is **#103** — for now, run locally before deploy

**DO NOT:** spend a week setting up perfect test infrastructure. Ship the first 30 high-value tests, iterate.

---

## #102 — Audit and document data retention

**Origin:** `AUDIT.md` M4 — `string_measurements 30-day retention seems enforced — but by what?`

**The mystery:** The Wattey cron at `/home/ubuntu/reyy/infra/scripts/data-retention.sh` runs at 03:00 UTC but references Wattey paths. SPC retention policy not explicitly documented or enforced.

**Investigation:**
1. Check current row counts in production:
   ```sql
   SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM string_measurements;
   ```
2. Check `scripts/run-poller.ts:63` — there's a daily 02:00 cron we never confirmed what it does (could be retention)
3. Audit SPC's retention strategy: 30 days for raw measurements, 1 year for hourly, forever for daily?
4. Compare actual table size growth vs disk pressure on RDS

**Sizing math:** ~100 bytes/row × 54 devices × 5 strings × 12/hour × 24h × 30 days ≈ 2.3M rows ≈ 230 MB. Manageable but growing.

**Fix:**
- Document SPC's intended retention policy (file: `prisma/RETENTION.md` or in `CLAUDE.md`)
- Verify the existing 02:00 cron in `run-poller.ts` actually deletes — read the code, test on a copy
- If retention isn't running: add a clear cron with `deleteMany()` statements per policy

**Files:**
- `scripts/run-poller.ts` — has the cron schedule
- `prisma/schema.prisma` — `string_measurements`, `string_hourly`, `string_daily`
- `Working/CLAUDE.md` AUDIT M4 — original flag

**DO NOT:** blindly add a `deleteMany()` before checking what's already there. Risk of double-deletion.

---

## #103 — Automate SPC deployment (CI/CD)

**Today:** Every deploy is a manual run of `Working/deploy-to-ec2.sh` from the local machine. Requires SSH key, GitHub token, local checkout matching what should ship. Brittle, single-developer bottleneck.

**Goal:** GitHub Actions workflow that fires on push to main (after pre-deploy audit passes) and runs the EC2 deployment over SSH.

**Approach:**
1. Move `Working/deploy-to-ec2.sh` logic into `.github/workflows/deploy.yml`
2. Store secrets in GitHub Actions: `SSH_KEY` (the `thingsboard.pem` content), production `.env` vars
3. Workflow:
   - Checkout
   - Run `scripts/audit-pre-deploy.sh` on the GitHub runner (TS check, validator, bundle size)
   - SSH to EC2, run deploy steps (`npm ci`, `prisma generate`, `prisma db push`, `build`, `pm2 restart`)
   - Run `scripts/audit-post-deploy.sh` on EC2 — fail the workflow if any check fails
   - Optional: post Slack/Discord notification on success/fail

**Trigger strategy:**
- Auto-deploy: only on push to main with a `[deploy]` tag in commit message — prevents every commit triggering EC2 churn
- Or: manual `workflow_dispatch` button — explicit push, safest first iteration

**Coupling:**
- **#101** — once tests exist, CI runs them as a gate before deploy
- **#98** — confirm new RDS class first; deploy script's `connection_limit` may need changing

**DO NOT:** use `--no-verify` or skip the audits. The audits exist precisely because past unaudited deploys caused incidents (`POST_MORTEM_2026-04-22.md`).

**Files:**
- `Working/deploy-to-ec2.sh` — current manual script (gitignored, contains creds)
- `scripts/audit-pre-deploy.sh`, `scripts/audit-post-deploy.sh`
- `POST_MORTEM_2026-04-22.md` — why audits exist

---

## #104 — Add rate limiting to `/api/admin/*` endpoints

**Why:** Admin API endpoints currently have NO rate limiting. A SUPER_ADMIN credential leak (or a malicious admin) could hammer endpoints like `/api/admin/plants/[code]/strings-config/bulk` in a tight loop, exhausting DB connections (especially given the tight 87 RDS ceiling).

**Goal:** per-IP and per-userId rate limit on every `/api/admin/*` route. Tighter limits on write endpoints (PUT/POST/DELETE) than read (GET).

**Approach:**
1. Add a middleware-level rate limiter using `@upstash/ratelimit` + Redis (Upstash has free tier for low volume), OR an in-memory limiter for simple cases
2. Bucket by user ID first, IP second
3. Limits to start with:
   - GET `/api/admin/*` → 60/min per user
   - PUT/POST/DELETE `/api/admin/*` → 20/min per user
   - Bulk write endpoints (e.g., `strings-config/bulk`) → 5/min per user
4. Return 429 with `Retry-After` header when exceeded
5. Log rate-limit hits to Sentry (already wired) for visibility

**Files:**
- `middleware.ts` — Clerk auth lives here, add rate limiter alongside
- `lib/api-auth.ts` — could embed a check inside `requireRole()` / `requireOrganization()`
- All 20+ files under `app/api/admin/`

**Coupling:**
- **#98** — rate limiting is the cheapest defence against connection exhaustion. Even more important until RDS upgrade lands.

**DO NOT:** rate-limit org-user read APIs aggressively (e.g., `/api/plants/[code]/strings`) — they're hit per dashboard page load. Keep ample headroom there.

---

## #105 — Tighten two-axis sensor-fault filter

**Today's thresholds (`lib/string-health.ts`):**
- `ACTIVE_CURRENT_THRESHOLD = 0.1A` (below this = not producing, NOT a sensor fault)
- `MAX_STRING_CURRENT_A = 50A` (above this = broken CT)
- `MAX_STRING_POWER_W = 25,000W` (above this = broken CT or impossible reading)

**Investigation:**
1. Query `string_measurements` for any rows that just-barely-pass current limits — say current > 30A or power > 20kW. Are they real or sensor faults?
2. Common Pakistani residential string carries 8–15A. Commercial up to 20A. **50A threshold may be too lenient.**
3. Power: 8 panels × 550W = 4,400W per string. **25,000W threshold = > 5× typical. Should it be 8,000W?**

**Fix options:**
- **Option A** — tighten constants, redeploy, watch for false positives (simple, no schema change)
- **Option B** — per-string nameplate-based filter (e.g., reject if current > 1.5× rated, power > 1.3× nameplate). **Requires Phase 2 panel configs** (couples with **#96**)
- **Option C** — rolling-stats outlier detection per string (more sophisticated, more code)

**Coupling:**
- **#96** — once nameplates are known per string, sensor-fault filter can be per-string-nameplate-aware (Option B)

**Files where the filter is used:**
- `lib/poller-utils.ts` `updateHourlyAggregates` / `updateDailyAggregates` — server-side filter
- `components/shared/InverterDetailSection.tsx` `fetch24hPower` — client-side filter (must match server)

**DO NOT:** apply the tightened threshold inconsistently. Server-side and client-side filters MUST stay in sync.

---

## How to use this doc

When you next say "let's work on SPC":
1. Open this file
2. Pick a task ID
3. Read the corresponding section
4. Read any linked plan doc (e.g., `PLAN-performance-ratio-phase2.md` for #96)
5. Check couplings — don't start something blocked by another task
6. Mark task `in_progress` in the task system, work, commit, mark `completed`
7. Update this file's status table

**This file = `BACKLOG.md`. Single source of truth for what's open on SPC.**
