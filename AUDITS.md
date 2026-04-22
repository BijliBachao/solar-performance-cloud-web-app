# Audit Toolkit

> **Purpose:** give every deploy and every hour a paper trail.
> No more blind deploys. No more discovering an outage from a user.

---

## The three scripts

| Script | Where it runs | When | Writes to |
|---|---|---|---|
| `scripts/audit-pre-deploy.sh` | laptop | before `git push` | `audits/YYYY-MM-DD/HHMM-pre.md` |
| `scripts/audit-post-deploy.sh` | EC2 | after `pm2 restart` | `~/solar-web-app/audits/YYYY-MM-DD/HHMM-post.md` |
| `scripts/audit-continuous.sh` | EC2 | every hour via cron | `~/solar-web-app/audits/YYYY-MM-DD/HHMM-continuous.md` |

Exit codes: `0` = green or warnings, `1` or `2` = errors. Use in a pipeline with `|| rollback`.

---

## 1. `audit-pre-deploy.sh` — block unsafe deploys at the laptop

Runs locally before push. Five checks:

1. **TypeScript** — `npx tsc --noEmit` must be clean
2. **Validator** — `scripts/validate-centralized.sh` must pass 20/20
3. **Risk-file diff** — warns if `poller-utils.ts`, `prisma/schema.prisma`, `middleware.ts`, `api-auth.ts`, or other high-blast-radius files were touched
4. **Bundle-size delta** — reports `+` or `-` vs last build (if a `.next` exists)
5. **Working-tree cleanliness** — warns on uncommitted files

### Usage

```bash
bash scripts/audit-pre-deploy.sh
# exits 0 if clean or warnings only
# exits 1 on any error → STOP, investigate
```

### Output example

```
# Pre-deploy audit · 2026-04-22 10:11:22 UTC
── Check 1: TypeScript compile ───── PASS: tsc --noEmit clean
── Check 2: Validator ─────────────── PASS: 20/20 checks
── Check 3: Risk-file diff ────────── WARN: touched poller-utils.ts
── Check 4: Bundle size delta ─────── INFO: .next = 231 MB (+1.2 MB)
── Check 5: Uncommitted changes ───── PASS: working tree clean
DEPLOY WITH CAUTION: 1 warning(s)
```

---

## 2. `audit-post-deploy.sh` — verify the deploy is actually serving traffic

Runs on EC2 immediately after `pm2 restart`. Five checks:

1. **PM2 processes** — `solar-web` + `solar-poller` both `online`
2. **`/api/health`** — local probe, HTTP 200, reports `status`, DB ok, poller freshness
3. **Public root URL** — `https://spc.bijlibachao.pk` reachable, tracks response time
4. **solar-web stderr** — counts fresh error lines in the last 2 min (threshold: >5 = fail)
5. **solar-poller stderr** — counts provider-sync failures in the last 10 min

### Integration into deploy

Append to your deploy script on EC2:

```bash
cd ~/solar-web-app
git pull origin main
npm ci --legacy-peer-deps
npx prisma generate
rm -rf .next
npm run build
pm2 restart solar-web solar-poller

# NEW: verify the deploy
sleep 15
bash scripts/audit-post-deploy.sh || {
  echo "🔥 Post-deploy audit failed — consider rollback"
  exit 1
}
```

### Rollback (manual, for now)

```bash
cd ~/solar-web-app
git reset --hard HEAD~1   # or git reset --hard <commit>
rm -rf .next
npm run build
pm2 restart solar-web solar-poller
bash scripts/audit-post-deploy.sh   # verify rollback
```

---

## 3. `audit-continuous.sh` — hourly heartbeat

Runs every hour via cron. Reports on:

- **System:** disk %, RAM %, load average (flags >70% / >85%)
- **SSL:** days until certificate expiry (flags <30 / <14 days)
- **PM2:** both SPC apps online, lifetime restart count
- **Database:**
  - DB size
  - Row counts per table
  - Ingestion rate: last-hour rows vs 24h average (flags <50% of average)
  - Data freshness: `latest_measurement_age_sec` (flags >15 min)
  - Sensor-fault rows today: count + % of total (should trend to zero after poller filter)
- **Poller stderr:** provider-sync failure count in the last hour

### Cron installation

```bash
crontab -e
# Append:
0 * * * * bash /home/ubuntu/solar-web-app/scripts/audit-continuous.sh >> /home/ubuntu/solar-web-app/audits/cron.log 2>&1
```

### Report cleanup (recommended monthly)

```bash
# Keep 30 days of reports
find ~/solar-web-app/audits -type f -name '*.md' -mtime +30 -delete
find ~/solar-web-app/audits -type d -empty -delete
```

---

## How to read a report

Every script outputs the same markdown shape:

```
# <audit kind> · <timestamp>

## Section
- PASS/WARN/FAIL: one-line check result
- ...

## Summary
- Errors: N · Warnings: M
- VERDICT: READY / WITH CAUTION / BLOCKED
```

Green dot ➜ the system is fine. Yellow dot ➜ operator should look. Red dot ➜ stop, investigate.

---

## What this toolkit catches

| Issue | Caught by |
|---|---|
| TypeScript regression | pre-deploy (Check 1) |
| Inline threshold / magic number | pre-deploy (Check 2) |
| Risky file touched | pre-deploy (Check 3) |
| Huge bundle bloat | pre-deploy (Check 4) |
| Forgetting to commit | pre-deploy (Check 5) |
| PM2 crash-loop | post-deploy (Check 1) |
| `/api/health` returns 503 | post-deploy (Check 2) |
| Public URL 5xx | post-deploy (Check 3) |
| App errors at boot | post-deploy (Check 4) |
| Poller can't reach provider | post-deploy (Check 5) + continuous |
| Disk filling | continuous |
| SSL about to expire | continuous |
| Ingestion stopped | continuous |
| DB unreachable | continuous + `/api/health` |
| Sensor-fault spike | continuous |

## What this toolkit does NOT catch

(and requires Sentry / UptimeRobot)

- Browser-side JS crashes for specific users (→ Sentry)
- EC2 being unreachable from the public internet when our scripts can't even run (→ UptimeRobot, external)
- DB-side performance regressions (slow queries → Sentry performance)
- Production usage patterns and error grouping (→ Sentry)

The three scripts are the **floor**, not the ceiling.

---

## Future improvements (not in this version)

- Slack webhook on red verdict (post-deploy or continuous)
- `audits/DEPLOYS.md` append-only deploy event log
- `/admin/audit` page that lists recent reports
- Automated rollback on post-deploy failure
- S3 archive of audit reports (current: only on EC2 disk)
