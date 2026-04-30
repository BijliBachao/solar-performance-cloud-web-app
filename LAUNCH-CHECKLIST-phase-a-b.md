# Launch Checklist — Phase A + Phase B

**Date drafted:** 2026-04-30
**Owner:** Ali Ahmed (`ai@right2fix.com`)
**Target:** Production EC2 (`ec2-54-175-170-207`) — `https://spc.bijlibachao.pk`
**Scope:** Two stacked changes deploying together in one push

---

## 0. What is shipping

| | Phase A (Problem 01) | Phase B (Problem 02) |
|---|---|---|
| Production failure being fixed | Empty PV ports trigger false 96 %-below-peers CRITICAL alerts forever (induction-leak noise on disconnected channels) | Wall / east / west / shaded strings trigger false CRITICAL alerts forever (lower output is by design, not a fault) |
| New `string_configs` column | `is_used Boolean @default(true)` + `panel_count` made nullable | `exclude_from_peer_comparison Boolean @default(false)` |
| Local commit status | Already committed: `82c0428`, `1a23456`. NOT yet on EC2. | Uncommitted on local working tree. |
| Plan reference | `PLAN-string-used-unused.md` | `PLAN-string-orientation-flag.md` |
| Problem reference | `problems/01-empty-pv-port-induction-leakage-noise.md` | `problems/02-non-standard-orientation-peer-comparison.md` |

Both phases ship in **one** EC2 deploy. The schema sync (`prisma db push`) covers both columns at once.

---

## 1. Pre-deploy gates — all GREEN

| Gate | Command | Current status |
|---|---|---|
| TypeScript compiles | `npx tsc --noEmit` | exit 0 |
| Centralization validator | `npm run validate` | 20/20 pass — no inline thresholds, no design-token drift, no auth-gate gaps |
| Pre-deploy audit script | `bash scripts/audit-pre-deploy.sh` | Will pass once Phase B is committed (currently warns on uncommitted files) |
| Code-review pass | `superpowers:code-reviewer` agent (twice) | All BLOCKERS / CONCERNS resolved; only NITs and known deferrals remain |
| Centralization audit (manual) | See §11 below | Phase B follows the single-source pattern; pre-existing duplications tracked under task #108 |

---

## 2. Files modified — final blast-radius

```
prisma/schema.prisma                                          ← migration trigger
lib/api-validation.ts                                         ← Zod schemas
lib/poller-utils.ts                                           ← high-blast-radius
lib/design-tokens.ts                                          ← STATUS_STYLES['peer-excluded']
app/api/admin/string-config/[deviceId]/[stringNumber]/route.ts (PUT/DELETE)
app/api/admin/plants/[code]/strings-config/route.ts           (GET + bulk POST)
app/api/plants/[code]/strings/route.ts                        (org live)
app/api/dashboard/analysis/string-level/route.ts              (org analysis)
app/api/admin/analysis/string-level/route.ts                  (admin analysis)
app/admin/plants/[plantCode]/strings/page.tsx                 (admin UI)
components/shared/StringComparisonTable.tsx
components/shared/StringHealthMatrix.tsx
components/shared/InverterDetailSection.tsx
components/shared/CurrentDeviationChart.tsx
components/shared/FaultDiagnosisPanel.tsx
components/shared/PlantDetailView.tsx
components/shared/AlertPanel.tsx                              (Record<StatusKey> filler)
components/shared/AlertHistoryLog.tsx                         (Record<StatusKey> filler)
```

18 files · +664 / −175

---

## 3. Database migration — REQUIRED

### Why it is required

This repo uses `prisma db push` (no `prisma/migrations/` folder). The schema diff against production adds two columns:

```sql
-- What `prisma db push` will run on prod (effective SQL)
ALTER TABLE string_configs ADD COLUMN is_used BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE string_configs ADD COLUMN exclude_from_peer_comparison BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE string_configs ALTER COLUMN panel_count DROP NOT NULL;
```

Both column adds are metadata-only on Postgres 11+ (no table rewrite). Existing rows are auto-backfilled with the defaults — no data loss, no row-lock storm.

### What happens if we skip it

The first read of `string_configs` after deploy throws:
```
PrismaClientKnownRequestError: column "string_configs.exclude_from_peer_comparison" does not exist
```
and the poller, every admin route, the org strings endpoint, and both analysis pages 500.

### Order matters

```
git pull          ← new code that references the columns
prisma generate   ← regenerates client
prisma db push    ← THIS creates the columns
npm run build     ← bakes new client into .next
pm2 restart       ← runs new code against new schema
```

Push the schema **before** building / restarting. Doing it after means a window where the running process crashes on every request.

### Safety

- ✅ Uses `DATABASE_URL` from `.env` (never operate against staging/dev URLs by accident — verify with `echo $DATABASE_URL` before running).
- ✅ Never use `--accept-data-loss`. Our changes don't need it.
- ✅ Reversible — if rollback is needed, the columns can stay in place (defaults are neutral, old code ignores them).

### Verification SQL after push

```bash
psql "$DATABASE_URL" -c "
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'string_configs'
  AND column_name IN ('is_used', 'exclude_from_peer_comparison', 'panel_count');
"
```

Expected:
```
 column_name                  | data_type | column_default | is_nullable
------------------------------+-----------+----------------+-------------
 is_used                      | boolean   | true           | NO
 exclude_from_peer_comparison | boolean   | false          | NO
 panel_count                  | integer   |                | YES
```

---

## 4. Deploy runbook (in order)

### 4.1 Local — finalize

```bash
cd /home/mudassir/work/Ali/websites/untitled2/sol/solar-performance-cloud-web-app

# Confirm working state
git status
npx tsc --noEmit && echo OK
npm run validate

# Commit Phase B
git add -A
git commit -m "$(cat <<'EOF'
feat(strings): Phase B — exclude_from_peer_comparison flag (Problem 02)

Adds string_configs.exclude_from_peer_comparison so admins can flag
non-standard installs (wall, east/west, shaded) that drag down peer
averages. Excluded strings:
- drop out of the peer pool
- skip Part 1 peer-comparison alerts
- still get Part 2 dead-string detection (real 0 A faults are still surfaced)
- still appear in the org response with real V/A/P, gap_percent: null,
  peer_excluded: true

Pairs with Phase A (is_used). Hardware alarms, dead-string detection,
stale-data detection, and sensor-fault filter all stay active on
flagged strings — only Layer 1 (peer comparison) is disabled.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Final pre-deploy gate
bash scripts/audit-pre-deploy.sh   # should now report READY TO DEPLOY

# Push
git push origin main
```

### 4.2 EC2 — deploy

```bash
ssh -i ~/.ssh/thingsboard.pem ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com

cd ~/solar-web-app
git pull origin main

# Sanity-check we got both Phase A and Phase B commits
git log --oneline -5
# Expect to see both 82c0428 (Phase A) and the new Phase B commit at HEAD

npm ci --legacy-peer-deps
npx prisma generate

# ★★★ DATABASE MIGRATION ★★★
echo "DATABASE_URL host:" $(echo $DATABASE_URL | grep -oP '@[^/]+')
npx prisma db push
# Expected: "The database is now in sync with your Prisma schema."

# Verify the columns landed
psql "$DATABASE_URL" -c "\d string_configs" | grep -E "is_used|exclude_from_peer"

# Build and restart
rm -rf .next
npm run build
pm2 restart solar-web solar-poller

# Wait for boot
sleep 15

# Post-deploy audit (exits non-zero → roll back)
bash scripts/audit-post-deploy.sh
```

### 4.3 Production sanity checks (within 5 min of restart)

```bash
# 200 OK on the public URL
curl -s -o /dev/null -w "%{http_code}\n" https://spc.bijlibachao.pk
# expect: 200

# Both PM2 processes online
pm2 list

# No Prisma errors in solar-poller logs
pm2 logs solar-poller --lines 100 --nostream | grep -i "prisma\|error"
# expect: empty (or only pre-existing benign warnings)

# Poller cycle ran successfully
pm2 logs solar-poller --lines 200 --nostream | grep -E "Poll cycle|generated alerts"
# expect: a recent successful cycle
```

---

## 5. Smoke test on production (manual, ~15 min)

Pre-deploy state: pick two real plants in advance:
- **Plant X** — has at least one inverter with empty PV ports producing induction-leak noise (the canonical Phase A target)
- **Plant Y** — has at least one wall-mounted or east/west inverter generating false CRITICALs (the canonical Phase B target)

### 5.1 Phase A — used / unused flag

1. Open `/admin/plants/<Plant X>/strings`
2. Find an empty PV port (a string consistently producing < 0.5 A while siblings produce > 5 A)
3. Toggle its **Used** switch to OFF → click **Save**
4. **Expected on admin page:**
   - Status pill turns to amber `unused · admin`
   - Row tints faintly grey
   - Panel-info inputs disable
5. Open the same plant on `/dashboard/plants/<Plant X>`
6. **Expected on org dashboard:**
   - The flagged string disappears from the active strings list
   - Other strings on the same inverter: their `gap %` may have improved (cleaner peer pool)
7. Open `/dashboard/analysis?plant_id=<Plant X>`
8. **Expected:** flagged string appears in the **Unused** section, not in active or inactive
9. Watch `pm2 logs solar-poller` for one full cycle (5 min) — verify no new CRITICAL alerts emitted on the flagged string

### 5.2 Phase B — non-standard / peer-excluded flag

1. Open `/admin/plants/<Plant Y>/strings`
2. Find a wall-mounted or east/west string consistently 30–60 % below peers
3. Toggle its **Peer-comp** switch to OFF → click **Save**
4. **Expected on admin page:**
   - Status pill turns to indigo `non-standard`
   - Used toggle stays ON
   - Open peer-comparison alerts on this string auto-resolve
5. Open the same plant on `/dashboard/plants/<Plant Y>`
6. **Expected on org dashboard (live view):**
   - String STILL appears in the table with real V/A/P
   - Indigo row tint
   - `Gap` column shows `—`
   - Status pill says `non-standard`
   - Health Matrix cell tints indigo
   - Current Deviation Chart renders the bar in indigo
7. Hover the string in the matrix → **Expected:** tooltip header reads `Non-standard`, Gap row reads `— (peer-excluded)`
8. Open `/dashboard/analysis?plant_id=<Plant Y>`
9. **Expected:** flagged string appears in the active section with `peer_excluded: true` flagged in the row payload (visible if the UI surfaces it; backend confirmed exposing it)
10. Watch `pm2 logs solar-poller` for two full poll cycles (10 min):
    - **Expected:** no new peer-comparison alerts emitted on the flagged string
    - If the string genuinely goes dead (current ≤ 0.1 A): Part 2 still fires CRITICAL OPEN_CIRCUIT (this is the "we still catch real faults" promise)

### 5.3 Bulk dialog (admin only)

1. Open `/admin/plants/<some plant>/strings` → click **Apply to all strings**
2. Test each section in isolation:
   - **Panel info only** — set count/make/rating, leave other sections unchecked → verify panel info applied without changing flags
   - **Used flag only** — check "Apply used / unused flag", select "Mark unused" → verify all strings flip to unused
   - **Peer-comp only** — check "Apply peer-comparison flag", select "Non-standard" → verify all strings flip to non-standard
3. Test combinations (panel + used, peer-comp + panel, all three at once)
4. Test "Only fill strings that are not yet configured" guard

### 5.4 All-strings-excluded inverter

1. On a small inverter, mark every string as `Peer-comp OFF`
2. Open the org dashboard for that plant
3. **Expected:** the inverter card shows the indigo banner: `All strings on non-standard install · peer comparison disabled` with sub-text listing what's still active

---

## 6. Post-deploy monitoring (first 24 h)

| Signal | Where | What to watch |
|---|---|---|
| Public site availability | `curl https://spc.bijlibachao.pk` | 200 OK |
| PM2 process health | `pm2 list` on EC2 | Both `solar-web` and `solar-poller` online, no restart loop |
| Poller errors | `pm2 logs solar-poller --lines 500` | No Prisma column-not-found errors, no unhandled rejections |
| `alerts` table count | `SELECT count(*) FROM alerts WHERE resolved_at IS NULL` | Should DROP (false alerts on empty/wall strings now resolved or skipped). NOT a spike. |
| Customer support tickets | Slack / email | Reduction in "why is everything red?" tickets |
| Memory / CPU | `htop` on EC2, PM2 metrics | Stable — Phase A/B add no significant cost (one extra index lookup per poll cycle) |

If any of these go sideways within the first hour, follow §7 (rollback).

---

## 7. Rollback plan

### Quick rollback (code only — most common)

```bash
ssh -i ~/.ssh/thingsboard.pem ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com
cd ~/solar-web-app

# Revert the last 2-3 commits (Phase A pieces + Phase B)
git revert --no-edit HEAD~3..HEAD     # adjust count to match what you pushed
git push origin main

# Re-deploy the reverted state
git pull origin main
npm ci --legacy-peer-deps
npx prisma generate
# DO NOT run prisma db push on rollback — leave the columns in place
rm -rf .next && npm run build
pm2 restart solar-web solar-poller
```

The schema columns stay. Old code reads them but doesn't reference them, so they're inert. Any flags admin set during the brief deploy window become silent (default behavior is "string is used and in peer pool").

### Why we don't drop the columns

- Postgres `DROP COLUMN` re-rewrites the table for older PG versions and is destructive
- Re-deploying Phase A/B after fixing the issue means we'd need to add them back anyway
- The columns occupy ~2 bytes per row × ~200 rows = trivial space cost

### Hard rollback (data restore — only if data is genuinely corrupted)

Coordinate with RDS. Take a snapshot before deploy if you want a clean restore point. We have not yet enabled automatic snapshot-on-deploy.

---

## 8. Known limitations — accepted, not blocking

| Issue | Impact | Tracked as |
|---|---|---|
| `updateDailyAggregates` still computes peer-derived `health_score` for peer-excluded strings (Plan §9 wants null) | Org analysis page shows provisional buckets for excluded strings | Phase 2 PR / task #96 |
| When ALL strings on an inverter are peer-excluded, dead-string alerts don't write to `alerts` table (live UI still flags via `classifyRealtime`) | Pre-existing `canDoComparison` gate; bounded; mitigated by vendor-alarm layer | Future poller refactor |
| Admin toggles flag mid-poll → poll uses stale snapshot, may emit one final alert (resolved on next cycle within 5 min) | Bounded, idempotent | Acceptable race; documented in `lib/poller-utils.ts` |
| `string_configs.findMany` duplicated across 4 server files | Code drift risk if the filter logic ever changes | Task #108 (pre-existing pattern) |
| `StringInfo` / `StringData` interfaces duplicated across 6 components | Type drift risk | Pre-existing pattern; defer to a typed-models pass |
| Zero automated tests | Smoke testing is manual | Task #101 (project-wide) |
| 5 NITs from code review (dead defensive code, `statusLabel` duplication, schema comment) | Cosmetic | Task #108 sweep |

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Forgot to run `prisma db push` | Medium | High (5xx storm) | §3 + §4.2 explicitly call it out; post-deploy audit script will fail-fast on the first DB read |
| `prisma db push` against wrong DATABASE_URL (dev vs prod) | Low | High (schema mismatch) | §4.2 prints `DATABASE_URL` host before the push for human verification |
| Old in-flight requests hit new schema during pm2 restart | Very low | Low | Restart is sub-second; affected requests retry from the client |
| Frontend cache (CDN, browser) serves old JS that doesn't know `peer_excluded` field | Low | Low | Field is additive; old JS ignores it. New `gap_percent: null` would crash old `.toFixed()`, but we have no external mobile client and Next.js bundle is replaced atomically. |
| Customer is mid-edit on `/admin/plants/.../strings` during deploy | Low | Low | They'd get a 5xx on save and retry. No data loss because save is a single upsert. |
| Phase 2 PR (#96) lands later and changes `health_score` semantics → existing peer-excluded rows have stale scores | Medium | Low | Phase 2 PR will rewrite `string_daily.health_score` over its date range; old rows aren't load-bearing |

---

## 10. Sign-off — everything must be ✅ before pushing

- [x] All BLOCKERS from code review addressed (none remaining)
- [x] All 4 CONCERNS from final code review fixed (C1, C2, C3, C4)
- [x] `npx tsc --noEmit` exit 0
- [x] `npm run validate` 20/20 pass
- [x] CLAUDE.md updated with new flag rules + `prisma db push` step
- [ ] **Wattey team's RDS upgrade (t3.micro → t4g.small) confirmed back up and verified.**
      The shared `bijli-bachao-db` instance is being resized 2026-04-30 with ~5 min downtime.
      Snapshot was taken pre-upgrade. After: `max_connections` 87 → 145, RAM 1 GB → 2 GB.
      Do NOT run `prisma db push` while the RDS reboot is in progress — it will fail mid-statement.
      Wait for the all-clear message before §4.2.
- [ ] Phase B committed locally with the commit message in §4.1
- [ ] `bash scripts/audit-pre-deploy.sh` reports `READY TO DEPLOY`
- [ ] Pushed to `origin/main`
- [ ] Phase A + Phase B target plants identified for §5 smoke tests
- [ ] EC2 SSH access verified (`ssh ... echo OK`)
- [ ] `DATABASE_URL` confirmed pointing at the prod RDS instance, not a staging URL
- [ ] Optional but recommended: RDS snapshot before deploy (manual, via AWS console)
      → already covered by Wattey team's pre-upgrade snapshot for THIS deploy window only.
      Take a fresh one for any deploy outside this window.

---

## 11. Centralization audit — did we follow the single-source-of-truth pattern?

### What's centralized correctly

| What | Where | Verified |
|---|---|---|
| All thresholds and classification | `lib/string-health.ts` | ✅ Validator 20/20; no inline 0.1/25/50/90 magic numbers |
| Zod validation schemas | `lib/api-validation.ts` (`StringConfigUpsertSchema`, `StringConfigBulkSchema`) | ✅ Both PUT and bulk POST import the same schemas |
| DB schema | `prisma/schema.prisma` | ✅ Single source; one `prisma db push` covers both phases |
| Status colors / labels | `lib/design-tokens.ts` `STATUS_STYLES['peer-excluded']` (new in this ship) | ✅ All 4 sites that previously had inline indigo classes (StringComparisonTable, StringHealthMatrix, InverterDetailSection banner, admin per-row pill) now read from this entry |
| Alert-row discriminator | `gap_percent IS NOT NULL` (Part 1) vs `gap_percent IS NULL` (Part 2) | ✅ Producer (`lib/poller-utils.ts:189-200`) and consumer (auto-resolve in both admin endpoints) agree |
| Auto-resolve scoping logic | Mirrored in PUT and bulk POST | ✅ Same shape in both routes |
| Two analysis endpoints (org + admin) | Same bucketing, same per-row tags, same summary keys | ✅ Diff confirms: only deliberate divergences are auth gate and admin-only `unused_source` chip |

### What's still duplicated (pre-existing, not introduced here)

| What | Where | Tracked as |
|---|---|---|
| `string_configs.findMany` filter for both flags | `lib/poller-utils.ts` (3 funcs), org strings, both analysis routes, admin GET — 7 sites | Task #108 |
| `StringInfo` / `StringData` shape | 6 components, each with slightly different field subsets | Pre-existing pattern; not a Phase B regression |

These were not introduced by Phase A/B — Phase A/B just extended them in lockstep. Hoisting to a shared helper is the natural follow-up after deploy.

---

## 12. After deploy — open follow-ups (not part of this ship)

In priority order:

1. **24 h soak** — watch `alerts` table count and customer tickets. Mark task #106 and #107 completed once stable.
2. **Task #108** — extract `string_configs` filter helper into `lib/string-config-filter.ts` and refactor 7 call sites to use it. Reduces drift risk; small PR.
3. **Plan §9 alignment** — either update plan to acknowledge Phase 2 PR fixes the `health_score` story, or modify `updateDailyAggregates` to write `null` for peer-excluded strings. User to decide.
4. **NIT cleanup** — 5 cosmetic items from the code review (one PR).
5. **Task #96 (Phase 2 PR)** — Performance Ratio scoring closes the "what about real faults on excluded strings" gap that Phase B alone leaves open.

---

**End of checklist.** When every box in §10 is ticked, deploy is GO.
