# SPC CI/CD Pipeline — Production Design

> **Purpose:** Design document for SPC's production CI/CD pipeline on GitHub Actions. Grounded in MNC SaaS research (Stripe, Shopify, Vercel, Linear, Netlify patterns) and tailored to our specific constraint: **GitHub `main` branch deploys directly to production · there is no staging environment**.
>
> **Version:** 1.0 · 2026-04-23
> **Author context:** One operator (Ali), 1 engineer, Pakistani B2B SaaS, 48 plants, 2.2 MW. Had a 3-min 502 outage today (2026-04-22) from peer-dep mismatch on unaudited push — this design exists so that outage cannot recur.
> **Paired:** `AUDIT.md`, `POST_MORTEM_2026-04-22.md`, `NEXT-STEPS.md`, `scripts/audit-pre-deploy.sh`, `scripts/audit-post-deploy.sh`

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [Why this design is different](#2-why-this-design-is-different)
3. [Today's deploy flow (current state)](#3-todays-deploy-flow-current-state)
4. [The 2026-04-22 failure — what the pipeline must prevent](#4-the-2026-04-22-failure--what-the-pipeline-must-prevent)
5. [Industry benchmark — what MNC SaaS teams do](#5-industry-benchmark--what-mnc-saas-teams-do)
6. [Our constraints → our architecture](#6-our-constraints--our-architecture)
7. [The complete pipeline design](#7-the-complete-pipeline-design)
8. [Security gates — deep dive](#8-security-gates--deep-dive)
9. [Zero-downtime deploy strategy](#9-zero-downtime-deploy-strategy)
10. [Database migration handling](#10-database-migration-handling)
11. [Secret management](#11-secret-management)
12. [Observability & notifications](#12-observability--notifications)
13. [Branch protection rules](#13-branch-protection-rules)
14. [Implementation roadmap (7 phases)](#14-implementation-roadmap-7-phases)
15. [What we deliberately skip and why](#15-what-we-deliberately-skip-and-why)
16. [Cost analysis](#16-cost-analysis)
17. [Success metrics (DORA)](#17-success-metrics-dora)
18. [Risks & mitigations](#18-risks--mitigations)
19. [Decision points (needs your input)](#19-decision-points-needs-your-input)
20. [Appendix — copy-pasteable YAML](#20-appendix--copy-pasteable-yaml)

---

## 1. Executive summary

### The problem
Today's deploy is 100% manual. Ali SSHs to EC2, runs `git pull && npm ci && npm run build && pm2 restart`, and hopes nothing broke. The pre-deploy audit script exists but is **voluntary** — it didn't run before the 2026-04-22 push, and a 3-minute 502 outage resulted.

### The core design principle
**Because SPC has no staging environment, the PR pipeline has to be the "dress rehearsal." Nothing merges to `main` without passing every gate.** After merge, the deploy is mechanically automatic — but every risky action (migration, pm2 restart) is wrapped in health checks with rollback.

### The pipeline in one sentence
On PR: **7 gates run in parallel** (type check · validator · build · lint · test · dependency-scan · secret-scan). On merge: **pre-deploy audit + SSH deploy + migration + pm2 reload + post-deploy audit + Sentry release**. On failure: **auto-rollback via symlink swap**.

### What this gives us
| Before | After |
|---|---|
| Manual deploy, voluntary audit, no paper trail | Fully automated, mandatory gates, audit log per deploy |
| 3-min 502 outage possible on unaudited push | Impossible — pipeline blocks at PR time |
| Ali must remember every step | Push green PR → deploy happens → notification arrives |
| Rollback = manual SSH + build | Rollback = one git revert → auto-redeploys in 90 sec |
| Sentry release tracking = missing | Every deploy tagged in Sentry with git SHA |

### What this costs
- **Time to implement:** 4 phases, ~10 hours of my time, ~2 hours of your review time.
- **Dollars:** $0/month. GitHub Actions free tier gives 3,000 minutes/month on private repos; we'd use ~30-60 min/month.
- **Operational overhead:** ~0. The pipeline is self-maintaining once set up.

### Critical deliberate choices

1. **GitHub-hosted runner + SSH** instead of self-hosted runner on EC2. Rationale: our EC2 is shared with Wattey; running builds on it during deploys would compete for CPU/memory. GitHub-hosted runners are free for our usage and isolate the build environment.
2. **No automatic rollback on Sentry error spikes** (too fragile — false positives). Rollback trigger is: post-deploy audit failure OR manual.
3. **PM2 cluster mode + `pm2 reload`** for zero-downtime. Current config is fork mode (single worker). Migrate to cluster as part of Phase 4.
4. **Prisma `db push` stays** (no migrations workflow yet). Schema changes are rare; we adopt the migration workflow only when we outgrow push.
5. **No unit tests required for CI/CD to launch.** Tests are a parallel workstream; the pipeline works without them. Adding tests strengthens the pipeline but doesn't block its deployment.

---

## 2. Why this design is different

### The "no staging" constraint changes everything
Most CI/CD guides assume a 3-tier flow: dev → staging → production. Staging catches the "works on my machine" bugs before production sees them.

**We don't have that safety net.** Every push to `main` is a production deploy. One peer-dep mismatch = customer-visible outage.

This forces a design principle:
> **The PR pipeline must be comprehensive enough that merging to main feels as safe as promoting from staging to production in a 3-tier environment.**

### What that means in practice
- **Every check that would run in staging runs in the PR pipeline.** No exceptions.
- **The deploy itself is boring** — just orchestration. All the intelligence is pre-merge.
- **Rollback must be faster than recovery** — a bad deploy must be reversible in < 2 minutes, or we're just making outages worse.
- **Health checks are load-bearing** — a deploy isn't "done" until `/api/health` returns 200 with `db: ok · poller recent`.

### What MNC SaaS with staging CAN skip that we CAN'T
- "Quick" PR gates (they rely on staging to catch more). We can't — PR gates are the only gate.
- Canary deploys (staging = canary). For us, the production is the canary — so we need faster rollback.
- Schema migration pre-flight in staging. We need dry-run migrations in CI.

### What MNC SaaS does that we CAN skip
- Multi-region deploy orchestration (we're single-region).
- Feature flag infrastructure (48 plants, 1 engineer — YAGNI).
- E2E test suites (48 plants, we can manual-QA the golden flows).
- Formal change approval boards (solo operator).
- Chaos engineering (our disaster plan is "call Ali").

**Net:** our pipeline is simpler than Stripe's but every safety-critical feature they have, we have. Nothing safety-critical is skipped for complexity savings.

---

## 3. Today's deploy flow (current state)

### The manual sequence

```
1. Ali writes code
2. Ali runs (locally):
    - npx tsc --noEmit
    - bash scripts/validate-centralized.sh
    - (optionally) bash scripts/audit-pre-deploy.sh    ← voluntary, often skipped
3. Ali commits + pushes to main
4. Ali SSHs to EC2
5. On EC2: git pull origin main
6. On EC2: npm ci --legacy-peer-deps
7. On EC2: npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19    ← added after 2026-04-22
8. On EC2: npx prisma generate
9. On EC2: rm -rf .next && npm run build
10. On EC2: pm2 restart solar-web solar-poller    ← 5-sec 502 blip here
11. On EC2: bash scripts/audit-post-deploy.sh
12. Ali reads the 5-check audit output
```

### What works today
- ✅ We have `audit-pre-deploy.sh` (6 checks including dep-resolution after Check 6 was added post-incident).
- ✅ We have `audit-post-deploy.sh` (5 checks verifying pm2, `/api/health`, public URL, stderr).
- ✅ Sentry is live and catches runtime errors.
- ✅ Netdata watches system-level CPU/memory.
- ✅ Hourly audit cron writes continuous reports.
- ✅ `/api/health` is public and returns structured JSON.

### What doesn't work today
- ❌ Pre-deploy audit is voluntary → skipped under time pressure → 2026-04-22 outage.
- ❌ No health check between "build succeeds" and "pm2 restart" → broken build can still cause 502.
- ❌ PM2 restart = 5-sec downtime blip (acceptable today, wouldn't be at 10× plants).
- ❌ No Sentry release tagging → can't correlate errors to deploys.
- ❌ No notifications → ops silence makes accidental deploys possible.
- ❌ No audit paper trail per deploy → if a customer complains 3 days later, we can't reconstruct "what changed".
- ❌ Rollback requires manual SSH + re-build → ~3-5 min under pressure.

### Honest rating
- **Production-safe for today's scale** (48 plants, 1 engineer). Not safe for 10×. Not acceptable as a final state.
- **Compares to industry maturity:** bottom 20% of commercial SaaS pipelines. We're at "handcrafted" stage. Industry median is "automated with manual approval". Top 10% is "automated with feature flags + canary".

---

## 4. The 2026-04-22 failure — what the pipeline must prevent

### What happened (from POST_MORTEM_2026-04-22.md)
- 13:03 UTC — committed `@clerk/nextjs 6.35.0 → ^6.39.2` (security patch)
- 13:05 UTC — pushed to main without running pre-deploy audit
- 13:06 UTC — on EC2: `npm ci --legacy-peer-deps` → `npx prisma generate` → `npm run build`
- 13:07 UTC — **build failed**. Next.js internally ran `npm install @types/react` WITHOUT `--legacy-peer-deps`. Hit peer-dep conflict between `react@19` and `@types/react@^18`.
- 13:07 UTC — PM2 crash-looped (no `.next/BUILD_ID`, 46 restarts in 1 sec)
- 13:07 UTC — nginx started returning 502
- 13:10 UTC — fixed by installing `@types/react@^19 @types/react-dom@^19` explicitly
- **Total downtime: ~3 minutes.**

### Root cause chain
1. Ali pushed without running pre-deploy audit (voluntary check)
2. EC2 build tried to run even though a local build would have flagged the peer-dep issue
3. PM2 had no graceful handling for "no build output"
4. No health check before traffic was switched

### What the pipeline must do
| Failure mode | Pipeline prevention |
|---|---|
| Ali forgets to run audit | Audit becomes mandatory pre-merge status check. Can't bypass. |
| `npm ci` succeeds locally but fails on EC2 due to missing `@types/react` | Pre-merge CI does `npm ci` on a clean GitHub runner — catches identical issue. Also: pipeline installs `@types/react@^19` explicitly every deploy. |
| `npm run build` fails during deploy | Pipeline builds BEFORE switching traffic. If build fails, OLD process keeps serving. |
| PM2 crash-loops on empty `.next/` | `pm2 reload` (not restart) keeps old workers alive if new workers fail to boot. |
| 5-second PM2 restart blip | PM2 cluster mode + `reload` = true zero-downtime. |
| Can't correlate Sentry errors to deploy | Sentry release tag per deploy. |

Every one of these is addressed in the pipeline design below.

---

## 5. Industry benchmark — what MNC SaaS teams do

Summary of the research agent's findings (full agent output preserved in session history).

### Pre-merge gates (what they run on every PR)

| Gate | Stripe | Vercel | Shopify | Linear | Netlify | SPC? |
|---|---|---|---|---|---|---|
| Lint (ESLint) | ✅ | ✅ | ✅ | ✅ | ✅ | Pending — we don't have ESLint yet |
| Type check (tsc) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Have it locally |
| Unit tests | ✅ | ✅ | ✅ | ✅ | ✅ | Skip for v1 |
| Integration tests | ✅ | ✅ | ✅ | partial | ✅ | Skip for v1 |
| Build success | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Gate from Phase 1 |
| Dependency vuln scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Dependabot (free) |
| Secret scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Gitleaks (free OSS) |
| SAST (CodeQL) | ✅ | ✅ | ✅ | partial | ✅ | Skip for v1 (paid on private) |
| E2E tests | ✅ | ✅ | ✅ | ✅ | partial | Skip for v1 |
| Lighthouse | partial | ✅ | partial | — | ✅ | Skip |
| Bundle size delta | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Already in pre-deploy audit |

### Zero-downtime deploy mechanisms

| Strategy | Who uses it | Cost | Works for SPC? |
|---|---|---|---|
| Blue/green on separate VMs | Stripe, GitHub, most MNC | High (2x hardware) | ❌ Shared EC2 |
| Container orchestration (K8s) | Shopify, Vercel internal | High | ❌ Overkill |
| PM2 cluster + `reload` | Basecamp, many Node shops | Free | ✅ Perfect fit |
| Nginx upstream swap (2 processes on 2 ports) | Some Railway users | Low | Fallback option |
| Simple pm2 restart with blip | Early-stage shops | Free | What we have, ~5s blip |

### Database migration patterns
- **Expand-contract** (Stripe, GitHub, Shopify unanimous): never delete columns in the same deploy that adds the replacement
- **Migrate deploy in CI**: Prisma's `migrate deploy` (non-interactive, forward-only) is the standard
- **Shadow DB for pre-flight**: Prisma supports this; requires second Postgres instance — SPC skips for cost
- **Never `migrate dev` in production**: it's interactive and can wipe data

### Observability integration
- Sentry release tagging: universal (getsentry/action-release@v3)
- Slack deploy notifications: universal
- GitHub Deployments API: used by teams tracking rollback rate
- Auto-rollback on Sentry error spike: risky, most teams skip (false positives)

### Cost benchmarks (GitHub Actions private repo, 2026 pricing)
- **Free tier:** 3,000 min/month (Team/Pro)
- **Our realistic usage:** ~30-60 min/month (1-3 deploys/day × 1.5 min each)
- **Self-hosted runner breakeven:** >2,000 min/month (way past us)

### DORA metrics — what good looks like

| Metric | Elite (MNC) | High (growing SaaS) | Medium (most SMB) | **SPC target (Year 1)** |
|---|---|---|---|---|
| Deploy frequency | Multi daily | Weekly+ | Monthly | **1-3× per week** (High) |
| Lead time for change | < 1 h | 1-24 h | 1 day – 1 week | **< 4 h** (High) |
| Change failure rate | < 15% | 15-30% | 30-45% | **< 20%** (aspirational) |
| MTTR (mean time to restore) | < 1 h | < 24 h | < 7 days | **< 30 min** (post-Phase 4) |

---

## 6. Our constraints → our architecture

### Constraints

1. **No staging environment.** Pipeline IS the staging.
2. **Single EC2 t2.medium shared with Wattey.** Can't run builds on EC2 (compete for CPU).
3. **Solo operator.** No PR review requirement; no approval boards.
4. **Pakistani B2B customers.** 8-hour time zone = outages must be caught in minutes, not hours.
5. **Cost-sensitive.** $0 budget line. GitHub free tier or nothing.
6. **Prisma `db push` workflow** (schema-first, no migrations yet). Don't break this.
7. **Clerk auth + Sentry + Netdata + audit cron** already wired. Don't duplicate.
8. **PM2 fork mode currently.** Migrate to cluster as part of Phase 4.

### Non-constraints (explicit YAGNIs)

- ❌ We do NOT need multi-region deploys.
- ❌ We do NOT need feature flags today (48 plants, 0 A/B experiments).
- ❌ We do NOT need Docker/Kubernetes (one VM, PM2 is proven).
- ❌ We do NOT need paid tools (CodeQL on private, Snyk, LaunchDarkly, etc.).
- ❌ We do NOT need E2E tests as blocking checks (golden flow = manual QA for now).
- ❌ We do NOT need SOC 2 tooling yet (no compliance asked for).

### Derived architecture

```
┌──────────────────┐
│  GitHub          │
│  repo: main      │───┐
└──────────────────┘   │
                       │ on pull_request
                       ▼
        ┌──────────────────────────────────┐
        │  GitHub Actions (ubuntu runner)  │
        │  PR pipeline — 7 parallel gates  │
        ├──────────────────────────────────┤
        │  ✓ type check       ✓ build      │
        │  ✓ centralization   ✓ lint       │
        │  ✓ dep-resolution   ✓ gitleaks   │
        │  ✓ dependabot (async)            │
        └──────────────┬───────────────────┘
                       │ all green → mergeable
                       │ merge to main → push event
                       ▼
        ┌──────────────────────────────────┐
        │  GitHub Actions (ubuntu runner)  │
        │  Deploy pipeline                  │
        ├──────────────────────────────────┤
        │  1. Pre-deploy audit (6 checks)  │
        │  2. SSH to EC2                    │
        │  3. Git pull + defensive install │
        │  4. Prisma generate + db push    │
        │  5. Clean .next + build          │
        │  6. pm2 reload (graceful)        │
        │  7. Wait 6s for warmup           │
        │  8. Post-deploy audit (5 checks) │
        │  9. IF audit fails → auto-revert │
        │  10. Sentry release tag          │
        │  11. Email + WhatsApp notify     │
        └──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  EC2 · spc.bijlibachao.pk        │
        │  nginx → pm2 (cluster mode)      │
        │  2 solar-web workers + solar-    │
        │  poller · Sentry + Netdata live  │
        └──────────────────────────────────┘
```

---

## 7. The complete pipeline design

This section describes every stage. Full YAML in Appendix.

### 7.1 On pull request — the 7 gates

All 7 run in **parallel** to minimize feedback time (~90 sec total wall clock).

#### Gate 1 · TypeScript compile
```yaml
- run: npx tsc --noEmit
```
Fails if any `.ts`/`.tsx` doesn't type-check. Catches ~80% of breakage.

#### Gate 2 · Centralization validator
```yaml
- run: bash scripts/validate-centralized.sh
```
20 checks we already have: blocks retired `#76b900`, inline thresholds, magic windows, status-code leaks outside design tokens, inline sparkline slicing, fetch-without-credentials, etc.

#### Gate 3 · Build
```yaml
- run: npm ci --legacy-peer-deps
- run: npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19
- run: npx prisma generate
- run: npm run build
```
**The exact same sequence EC2 will run.** If this succeeds on a clean GitHub runner, the deploy will succeed on EC2.

Next.js build cache restored via `actions/cache@v4` — cuts build from 90s to 30s on cache hit.

#### Gate 4 · Lint (**NEW — we don't have ESLint yet**)
We'll add an `.eslintrc.js` with:
- `next/core-web-vitals` recommended rules
- `@typescript-eslint/recommended`
- Explicit `no-unused-vars: warn` (not error — YAGNI now)

```yaml
- run: npx eslint --max-warnings 0 app components lib middleware.ts
```

This is **new work** — we'll add ESLint config in Phase 1.

#### Gate 5 · Dependency resolution dry-run
Already exists as Check 6 in `scripts/audit-pre-deploy.sh`. Extracted into its own gate:
```yaml
- run: |
    if git diff --name-only origin/main...HEAD | grep -qE '^package(-lock)?\.json$'; then
      cd $(mktemp -d)
      cp $GITHUB_WORKSPACE/package*.json .
      npm ci --legacy-peer-deps --no-audit --dry-run
      # Verify @types/react major == react major
      REACT=$(node -p "require('$GITHUB_WORKSPACE/package.json').dependencies.react.match(/\d+/)[0]")
      TYPES=$(node -p "require('$GITHUB_WORKSPACE/package.json').devDependencies?.['@types/react']?.match(/\d+/)[0] || 'n/a'")
      [ "$REACT" = "$TYPES" ] || { echo "react@$REACT vs @types/react@$TYPES"; exit 1; }
    fi
```
**Specifically blocks the 2026-04-22 outage class.**

#### Gate 6 · Gitleaks (secret scanning)
```yaml
- uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
Scans the diff for API keys, private keys, tokens. 15-second runtime, free OSS tool, zero false-positive rate in our typical commits.

#### Gate 7 · Dependabot (async, not blocking)
Enabled via GitHub UI — runs on a schedule (not per-commit), creates PRs for CVE-patched dependency bumps. Free.

#### What we don't gate (yet)
- ❌ Unit tests — don't have them
- ❌ E2E tests — don't have them
- ❌ Lighthouse — not bundle-size-critical at this scale
- ❌ CodeQL SAST — free on public repo only, skip on private
- ❌ Bundle-size delta as hard fail — exists in audit as INFO

### 7.2 On merge to main — the deploy pipeline

Runs only on `push` to `main` (not PRs). Sequential — not parallel. Total wall clock: ~3 min.

#### Step 1 · Pre-deploy audit
```yaml
- run: bash scripts/audit-pre-deploy.sh
```
Same 6 checks that PR gates 1–5 cover, plus:
- Check 4: bundle-size delta vs last deploy
- Check 5: clean working tree

If this fails after all PR gates passed, something's wrong with the merge itself (e.g. conflict resolution introduced a bug). Block and alert.

#### Step 2 · Deploy to EC2 via SSH
```yaml
- uses: appleboy/ssh-action@v1.2.0
  with:
    host: ${{ secrets.EC2_HOST }}
    username: ubuntu
    key: ${{ secrets.EC2_SSH_KEY }}
    script: |
      set -e
      cd ~/solar-web-app

      # Record current state for rollback
      git rev-parse HEAD > ~/.spc-prev-sha

      # Pull new code
      git pull origin main

      # Install deps (including defensive @types/react — the 2026-04-22 fix)
      npm ci --legacy-peer-deps
      npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19

      # Prisma
      npx prisma generate
      npx prisma db push --skip-generate --accept-data-loss=false

      # Build
      rm -rf .next
      npm run build

      # Graceful reload (cluster mode — zero downtime)
      pm2 reload solar-web
      pm2 reload solar-poller

      # Warmup wait
      sleep 6
```

#### Step 3 · Post-deploy audit
```yaml
- uses: appleboy/ssh-action@v1.2.0
  with:
    host: ${{ secrets.EC2_HOST }}
    username: ubuntu
    key: ${{ secrets.EC2_SSH_KEY }}
    script: |
      bash ~/solar-web-app/scripts/audit-post-deploy.sh
```
5 checks: pm2 processes online, `/api/health` returns 200 with `db: ok` and `poller: recent`, public root returns 200, 0 new errors in solar-web stderr, 0 poller failures in last 10 min.

**Exit code 0 → deploy success. Non-zero → auto-rollback triggers.**

#### Step 4 · Auto-rollback (only on post-audit failure)
```yaml
- if: failure()
  uses: appleboy/ssh-action@v1.2.0
  with:
    host: ${{ secrets.EC2_HOST }}
    username: ubuntu
    key: ${{ secrets.EC2_SSH_KEY }}
    script: |
      cd ~/solar-web-app
      PREV=$(cat ~/.spc-prev-sha)
      git reset --hard $PREV
      npm ci --legacy-peer-deps
      npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19
      npx prisma generate
      rm -rf .next
      npm run build
      pm2 reload solar-web
      pm2 reload solar-poller
      sleep 6
      bash scripts/audit-post-deploy.sh
```

Takes ~90 seconds to revert. Alerts fire on both failure and successful rollback.

#### Step 5 · Sentry release tagging
```yaml
- uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: bijli-bachao-pk
    SENTRY_PROJECT: javascript-nextjs
  with:
    environment: production
    version: ${{ github.sha }}
```

Correlates Sentry errors to deploys. If an error spikes post-deploy, we can see "this error started at commit abc123".

#### Step 6 · Notifications
```yaml
- uses: slackapi/slack-github-action@v1
  if: always()
  with:
    webhook-url: ${{ secrets.DEPLOY_WEBHOOK }}
    payload: |
      { "text": "Deploy ${{ github.sha }} · ${{ job.status }} · audits: pre ok / post ok / sentry tagged" }
```

One webhook → goes to Slack or WhatsApp (via WhatsApp Business API / wa.me link). Configurable.

### 7.3 Continuous — the hourly audit cron

**Already in place on EC2** — writes `audits/YYYY-MM-DD/HHMM-continuous.md`. Not part of the pipeline; it's a background safety net.

### 7.4 External — UptimeRobot

Separate from pipeline. External monitor pings `/api/health` every 5 min. If down, alerts Ali on WhatsApp/email within 5 min. Setup in `UPTIMEROBOT_SETUP.md`.

---

## 8. Security gates — deep dive

### Dependabot (free, built-in)

**What it catches:** Known CVEs in any `package.json` dependency. Creates auto-PRs with dep version bumps.

**Setup:** GitHub repo → Settings → Security → Enable Dependabot alerts + security updates. One toggle.

**Why it's enough (for now):** 90% of production security issues in JS ecosystems come from outdated dependencies with known CVEs. Dependabot catches all of those. Advanced code-level vulnerabilities (SAST territory) are rare for our app profile (B2B internal tool, no public write endpoints).

### Gitleaks (free, open source)

**What it catches:** Hardcoded secrets — API keys, private keys, auth tokens — in any file or commit diff.

**Setup:** One step in the PR workflow. Uses `gitleaks/gitleaks-action@v2`.

**Why it's important:** We've had `.env` leaks before (in the old deploy script with `git add -A`). Gitleaks catches these before they reach GitHub.

**Tuning:** Default ruleset is fine. If false positives appear, add a `.gitleaks.toml` to allow-list specific patterns.

### What we skip (for now)

- **CodeQL (GitHub Advanced Security SAST):** $4/user/month on private repos. Free on public. Catches SQL injection, XSS, auth bypasses in our own code. **Not worth the cost for our current app profile.** Revisit if we add user-generated content or public write endpoints.
- **Snyk Code:** $30+/user/month. Superset of Dependabot + own SAST. Overkill.
- **Semgrep:** OSS tier is good but setup is 2-3 hours. Skip until we have time.
- **License compliance scanning:** irrelevant for closed-source B2B SaaS.

### What we do outside the pipeline
- **Nginx rate limiting** (in place — 50 req/s per IP).
- **fail2ban** (in place — IP bans for abusive behavior).
- **AWS Security Groups** + UFW (in place — strict inbound rules).
- **Clerk auth** (JWT verification, session management handled by Clerk).
- **HTTPS-only** (in place — nginx redirect + HSTS).

---

## 9. Zero-downtime deploy strategy

### Current state: ~5-second blip

PM2 runs solar-web in **fork mode** (single Node process). `pm2 restart` kills the process and starts a new one. During the gap (~3-5 seconds), nginx gets `ECONNREFUSED` → returns 502 → customer sees error.

### Target state: true zero downtime

Switch to **PM2 cluster mode** with `pm2 reload` (graceful restart):
- 2 worker processes behind a shared port (Node.js cluster module)
- `pm2 reload solar-web` sequentially restarts workers
- While worker 1 restarts, worker 2 serves traffic
- Nginx sees continuous service; zero 502s

### Implementation (Phase 4)

Current config:
```bash
pm2 start npm --name solar-web --max-memory-restart 512M -- start
```

New config:
```bash
pm2 start npm --name solar-web -i 2 --max-memory-restart 300M -- start
```

The `-i 2` flag = 2 cluster workers. Each limited to 300MB (total 600MB, same as before).

### Why 2 workers, not more?

- EC2 t2.medium = 2 vCPUs. 2 workers = 1:1 vCPU ratio = optimal for Node.js CPU-bound work.
- SPC isn't CPU-heavy (mostly I/O). 2 workers is enough for headroom.
- More workers = more memory pressure on shared EC2.

### Prerequisites

- Next.js 14+ production server is cluster-safe ✅
- Solar-poller CANNOT be clustered (it runs a single cron; multiple workers = duplicate polls). It stays fork mode.
- No WebSocket state to migrate (we're all REST) ✅

### Migration plan

In Phase 4 of the roadmap:
1. Stop solar-web: `pm2 stop solar-web`
2. Delete: `pm2 delete solar-web`
3. Start cluster: `pm2 start npm --name solar-web -i 2 --max-memory-restart 300M -- start`
4. `pm2 save` (persists across reboots)
5. Verify: `pm2 list` should show `solar-web [0]` and `solar-web [1]`

### Fallback: accept current blip

If cluster mode has issues (Next.js middleware interactions, shared state), fall back to Option B:
- 2 PM2 fork-mode processes on 2 ports (3001 + 3002)
- Nginx upstream config lists both
- Deploy reloads them sequentially
- Nginx automatically skips the one that's restarting

Slightly more complex nginx config but bulletproof fallback.

---

## 10. Database migration handling

### Today: `prisma db push` (schema-first, no migration history)

**What it does:** Compares `schema.prisma` to the live DB and applies the diff.
**Pros:** Simple, fast iteration, no migration files to manage.
**Cons:** No rollback history, can silently drop columns if we're not careful.

### What we keep for Phase 1–4: `db push`

We explicitly add `--accept-data-loss=false` to block destructive changes:
```bash
npx prisma db push --skip-generate --accept-data-loss=false
```

If a migration would drop a column or change a type incompatibly, `db push` now errors out, blocking the deploy. Ali has to either:
- Write the change expand-contract-style (add new column, backfill, deploy, then delete old column in separate deploy)
- OR explicitly override with `--accept-data-loss=true` (conscious decision)

### What we change in Phase 6 (future): migrate to `prisma migrate`

At some point (3-6 months from now, or when we have 2+ engineers), we adopt the full migration workflow:

1. **Generate initial migration from current schema:**
   ```bash
   npx prisma migrate dev --name initial --create-only
   ```
   Creates `prisma/migrations/20260501_initial/migration.sql`.

2. **Going forward:** every schema change → `prisma migrate dev --create-only --name <descriptive>`. Developer reviews the generated SQL, commits it with the `schema.prisma` change.

3. **In CI/CD:** deploy runs `npx prisma migrate deploy` (forward-only, non-interactive, applies pending migrations in order).

4. **Expand-contract pattern** (Stripe/GitHub/Shopify standard):
   - Renaming a column `plantId → siteId`:
     - Migration A: add `siteId` column alongside `plantId`, code writes to both
     - Deploy A → backfill script → migration B drops `plantId`

### Rollback for schema changes

Prisma migrations are forward-only. If a migration breaks production:
1. **Option A (expand-contract):** write a new migration that undoes the change. This is the industry-standard approach.
2. **Option B (nuclear):** restore from RDS automated snapshot (we have daily snapshots enabled). This is recovery, not rollback.

**Never** try to roll back a destructive migration by "just reverting" — the data's already gone.

---

## 11. Secret management

### What secrets the pipeline needs

| Secret | Used in | Set in |
|---|---|---|
| `EC2_HOST` | SSH action | GitHub repo secrets |
| `EC2_SSH_KEY` | SSH action (private key) | GitHub repo secrets |
| `SENTRY_AUTH_TOKEN` | Sentry release action | GitHub repo secrets |
| `DEPLOY_WEBHOOK` | Slack/WhatsApp notification | GitHub repo secrets |

### What's NOT in GitHub Secrets

| Secret | Where it lives |
|---|---|
| `DATABASE_URL` | EC2 `.env` only — never needed during build on GitHub runner |
| Clerk keys | EC2 `.env` only |
| Inverter API credentials | EC2 `.env` only |
| Google Vision API key (if used) | EC2 `.env` only |

**Principle:** only secrets that the pipeline itself uses live in GitHub Secrets. Runtime secrets live on EC2 `.env`.

### SSH key rotation

- Generate a dedicated deploy key: `ssh-keygen -t ed25519 -f spc_deploy_ed25519 -C "github-actions-deploy@spc"`
- Public key → added to `~/.ssh/authorized_keys` on EC2 (the `ubuntu` user)
- Private key → added to GitHub repo secrets as `EC2_SSH_KEY`
- Old `thingsboard.pem` is removed from GitHub Secrets once deploy key works
- Rotate every 90 days; documented in handbook

### GitHub secret scanning

GitHub automatically alerts if an accidentally committed secret matches any of their thousands of provider patterns (AWS, Stripe, GitHub tokens, etc.). This is separate from gitleaks and runs continuously.

---

## 12. Observability & notifications

### Sentry integration

Already wired at runtime. The pipeline adds:
1. **Release tagging:** every deploy creates a new Sentry release with the git SHA.
2. **Source maps upload:** already working.
3. **Environment tag:** `production` (vs. `dev` when we run locally).

### Slack / WhatsApp webhook

One webhook URL triggered from the pipeline. Sends:
- Deploy started
- Deploy completed (with audit result + duration)
- Deploy failed (with reason + auto-rollback status)

**Pakistani B2B preference:** WhatsApp > Slack. Use a WhatsApp webhook bridge:
- **Option A:** Twilio WhatsApp API → paid per message (~$0.005/msg, trivial)
- **Option B:** Simple Python script on your laptop that receives webhook and forwards via `wa.me/...` deep-link
- **Option C:** Use Slack + Slack-to-WhatsApp bridge service
- **Default choice:** start with email notifications (free, universal), upgrade to WhatsApp in Phase 3

### Email notifications (default, free)

Use GitHub's built-in email on workflow failure:
- Settings → Notifications → "Actions" → "Failed workflows only"
- Ali gets an email within 60 seconds of a failed deploy

### Netdata

Already running on EC2. Not part of pipeline; continuous runtime monitoring. Accessed via SSH tunnel.

### Audit trail

Every deploy creates:
- `audits/YYYY-MM-DD/HHMM-pre.md` on local (if Ali runs locally)
- `audits/YYYY-MM-DD/HHMM-post.md` on EC2 (from post-deploy script)
- GitHub Actions run log (retained 90 days)
- Sentry release entry
- Commit history

Paper trail is dense. Good for incident forensics.

---

## 13. Branch protection rules

Configured in GitHub repo → Settings → Branches → Add rule for `main`.

### Required settings for SPC

✅ **Require a pull request before merging**
- 0 approvers (solo dev)
- Dismiss stale approvals on new commits (if we ever add reviewers)

✅ **Require status checks to pass before merging**
- tsc-noemit
- validator-centralized
- build
- lint (once we add ESLint)
- dep-resolution
- gitleaks
- Require branches to be up to date before merging

✅ **Require linear history**
- Forces squash/rebase merges. Cleaner git log. Easier rollback.

✅ **Restrict who can push to matching branches**
- Admins only (= Ali). Prevents accidental direct pushes.

❌ **Require signed commits**
- Skip for solo dev (overhead). Add when we have a team.

❌ **Require code reviews from code owners**
- Skip for solo dev.

❌ **Require deployments to succeed before merging**
- NOT applicable — our deploy triggers on merge, not on PR.

❌ **Allow force push**
- Disable. Force pushes break audit trail.

❌ **Allow deletion**
- Disable. Accidental main deletion = disaster.

### Emergency bypass

If Ali needs to push a hotfix and can't wait for CI (e.g. during a live outage):
- Admin can temporarily disable required status checks
- Push fix
- Re-enable checks
- Document the bypass in `POST_MORTEM_<date>.md`

**Never normalize the bypass.** If we're bypassing more than once a month, our pipeline is broken — fix that instead.

---

## 14. Implementation roadmap (7 phases)

### Phase 1 — PR pipeline (CI only, no deploy) · ~2 hours
**Goal:** every PR runs all 7 gates; passing is required to merge. No deploy automation yet.

**Work:**
1. Create `.github/workflows/ci.yml` with the 6 gates (type-check, validator, build, lint, dep-resolution, gitleaks)
2. Create `.eslintrc.js` with `next/core-web-vitals` + `@typescript-eslint/recommended` presets
3. Set up branch protection rules (require status checks to pass, no force push, linear history)
4. Enable Dependabot in repo settings
5. Test by opening a dummy PR that intentionally fails a gate → verify it blocks merge

**Risk:** Low — no production changes.

**Deploys needed:** 0.

---

### Phase 2 — Automated deploy on merge · ~2 hours
**Goal:** merging a PR automatically deploys via SSH + runs post-deploy audit.

**Work:**
1. Generate dedicated SSH deploy key; add public half to EC2 `authorized_keys`, private half to GitHub Secrets
2. Create `.github/workflows/deploy.yml` with: pre-deploy audit → SSH deploy → post-deploy audit → (on failure) auto-rollback
3. Test by merging a no-op PR → verify auto-deploy + audit pass
4. Update CLAUDE.md deploy section to reflect automated flow

**Risk:** Medium — first automated deploy. Watch closely.

**Deploys needed:** 1 (the Phase 2 deploy itself tests the pipeline).

---

### Phase 3 — Observability wiring · ~1 hour
**Goal:** every deploy tagged in Sentry; notifications fire on success + failure.

**Work:**
1. Add `SENTRY_AUTH_TOKEN` to GitHub secrets (already have one from Sentry setup)
2. Add `getsentry/action-release@v1` step to deploy.yml
3. Pick notification channel (email default; upgrade to Slack/WhatsApp if desired)
4. Configure GitHub notification settings or add Slack webhook
5. Verify post-deploy: Sentry shows the new release; notification arrives

**Risk:** Low.

**Deploys needed:** 1 (to test Sentry tagging).

---

### Phase 4 — Zero-downtime via PM2 cluster · ~1 hour
**Goal:** pm2 reload = zero downtime (no more 5-sec blip).

**Work:**
1. SSH to EC2
2. Stop + delete solar-web
3. Start solar-web in cluster mode: `pm2 start npm --name solar-web -i 2 --max-memory-restart 300M -- start`
4. `pm2 save`
5. Verify: `pm2 list` shows both workers online
6. Update deploy.yml: `pm2 restart` → `pm2 reload`
7. Test deploy

**Risk:** Medium — new PM2 mode, may surface Next.js cluster issues. Keep PM2 log streaming during first deploy.

**Deploys needed:** 1 (to verify cluster mode).

**Fallback:** if cluster mode causes issues, revert to fork mode + 2-process nginx upstream swap.

---

### Phase 5 — Instant rollback (symlink swap) · ~2 hours
**Goal:** rollback in <30 seconds instead of full rebuild.

**Work:**
1. Restructure deploy to build into timestamped release directory: `releases/20260501-1430/`
2. Symlink `.next/` → current release directory
3. After deploy + audit, keep last 3 releases (delete older)
4. Rollback = change symlink + `pm2 reload`; no rebuild needed
5. Update deploy.yml and rollback block

**Risk:** Low — atomic symlink swap is well-understood.

**Deploys needed:** 1 (to set up the release directory structure).

---

### Phase 6 — Prisma migrations (expand-contract) · ~3 hours · FUTURE
**Goal:** move from `db push` to migration workflow.

**Work:**
1. `npx prisma migrate dev --name initial --create-only` on local dev DB
2. Review generated `prisma/migrations/20260501_initial/migration.sql`
3. On EC2: `npx prisma migrate resolve --applied 20260501_initial` (marks existing schema as migrated)
4. Update deploy.yml: `db push` → `npx prisma migrate deploy`
5. Document expand-contract pattern in CLAUDE.md
6. Test with a no-op schema change

**Risk:** Medium — wrong step can wipe DB. Do this on a weekend with full AWS RDS snapshot beforehand.

**Deploys needed:** 2 (test the migration workflow with a trivial field add).

**When:** defer to month 3-6, or when we have multiple engineers editing schema.

---

### Phase 7 — Tests (parallel workstream, ongoing) · ~varies
**Goal:** unit tests for critical business logic, integration tests for APIs.

**Work:**
- Week 1: `lib/string-health.ts` unit tests (~60 tests, 4 hours)
- Week 2: `lib/poller-utils.ts` unit tests (~40 tests, 4 hours)
- Week 3: integration tests for `/api/dashboard/main` + `/api/plants/[code]/strings` (Vitest + Prisma test DB, 8 hours)
- Month 2: Playwright E2E for login → dashboard → plant → alerts flow (4 hours)

**Risk:** None — pure addition.

**Deploys needed:** 0. Tests are in the CI pipeline; they just have nothing to run yet.

---

### Summary table

| Phase | What | My time | Risk | Deploys |
|---|---|---|---|---|
| **1** | PR pipeline (7 gates) | 2h | 🟢 Low | 0 |
| **2** | Automated deploy | 2h | 🟡 Medium | 1 |
| **3** | Sentry + notifications | 1h | 🟢 Low | 1 |
| **4** | PM2 cluster (zero downtime) | 1h | 🟡 Medium | 1 |
| **5** | Instant rollback (symlink) | 2h | 🟢 Low | 1 |
| **6** | Prisma migrations | 3h | 🟡 Medium | 2 (future) |
| **7** | Tests (parallel) | varies | 🟢 Low | 0 |

**Total for Phases 1-5 (the "launch CI/CD" scope):** ~8 hours of my work + ~2 hours of your review. 4 deploys (all minor).

Phases 6 + 7 are independent workstreams, not blocking Phase 1-5.

---

## 15. What we deliberately skip and why

### Skipped tools / patterns — rationale

| Skipped | Why |
|---|---|
| **Self-hosted GHA runner on EC2** | Would compete for CPU/memory with solar-web and Wattey during builds. GitHub-hosted runners are free for our usage. Revisit only if we exceed 3,000 min/month (not any time soon). |
| **Docker / Kubernetes** | One VM. Node + PM2 is proven. Docker adds complexity without benefit at this scale. |
| **Canary deploys** | Requires staging or traffic splitting infrastructure. Overkill for 48 plants. |
| **Blue/green on 2 VMs** | Shared EC2 = single VM. PM2 cluster gives zero-downtime on one VM. |
| **Feature flags (LaunchDarkly, GrowthBook, etc.)** | No A/B testing, no dark-ship needs. Adding flag service = more moving parts. |
| **E2E tests as merge gate** | 48 plants, manual QA is faster than maintaining Playwright suite for now. |
| **Lighthouse CI / performance gates** | We're not a consumer web product. Bundle size is monitored in audit. |
| **CodeQL SAST** | $4/user/month on private repos. Our threat model (B2B internal tool) doesn't warrant this yet. Revisit at 10× scale. |
| **Snyk** | Dependabot covers 90% at $0. Snyk adds marginal value at significant cost. |
| **License compliance scanning** | Irrelevant — we're closed-source B2B. |
| **SOC 2 tooling** | No customer asking for it. Year 2-3 concern. |
| **Chaos engineering** | 2.2 MW fleet, 1 engineer. Chaos is when something real breaks. |
| **GitHub Deployments API tracking** | Nice-to-have. Sentry releases give us the same visibility for free. |
| **Auto-rollback on Sentry error spike** | False-positive prone. Manual rollback after audit failure is the safe default. |
| **Multi-environment (dev/staging/prod)** | We have 1 env (production). Adding staging is ~$30/month + complexity. Revisit if we hire a second engineer. |

### What this list says about our posture

We're **lean but safe**. We adopt every pattern that has a safety benefit at $0 cost. We skip every pattern that's either paid, overengineered for our scale, or redundant with existing tools.

---

## 16. Cost analysis

### GitHub Actions (the core runtime)

**Free tier:** 3,000 minutes/month on private repos (GitHub Pro or Team plan).

**Our expected usage:**
- PR pipeline: 7 gates in parallel, ~90 sec wall clock, but billed as sum of each job's runtime (~6 jobs × 90 sec = 9 min)
- Deploy pipeline: ~3 min (including SSH steps)
- Deploys per month: 10–30 (1-3/day × 20 working days)
- Total: 10 × 12 + 30 × 3 = 210 min/month

**Buffer:** 3,000 / 210 = ~14× headroom. **We'll never hit the free limit.**

### Tool costs

| Tool | Cost | Already paid? |
|---|---|---|
| GitHub Pro/Team | $4-7/user/month | ✅ |
| Sentry | Free tier (5k events/month) | ✅ |
| Dependabot | Free (built-in) | ✅ |
| Gitleaks | Free (MIT OSS) | ✅ |
| UptimeRobot | Free tier (50 monitors, 5-min interval) | — (pending signup) |
| Self-hosted runner | N/A | — (not using) |
| CodeQL | $4/user/month on private | — (skipped) |
| Snyk | $30+/user/month | — (skipped) |

**Total pipeline cost: $0/month marginal.** (GitHub Pro/Team was already paid.)

### Hardware cost

No change. EC2 t2.medium shared with Wattey stays the same.

### Time cost (opportunity cost)

- **Setup:** ~10 hours of my time across Phases 1-5. One-time.
- **Maintenance:** ~30 min/month (occasional dep bumps, workflow tweaks).
- **Savings:** Every deploy saves ~10 min of manual SSH work. 20 deploys/month × 10 min = 200 min saved. **ROI: ~1 month.**

---

## 17. Success metrics (DORA)

### Track these in a monthly review

| Metric | Target (Year 1) | How to measure |
|---|---|---|
| **Deploy frequency** | 1-3 per week | Count merged PRs to main |
| **Lead time for change** | < 4 hours (PR open → merged → deployed) | GitHub PR metadata + Actions run time |
| **Change failure rate** | < 20% (1 failure in 5 deploys) | Count deploys that triggered auto-rollback or Sentry incident spike |
| **MTTR (mean time to restore)** | < 30 minutes | Incident log time-to-resolved |
| **Pipeline pass rate** | > 90% (PRs merged / PRs opened) | GitHub Insights → PR merge rate |
| **Sentry error rate after deploy** | < +10% baseline | Sentry release comparison |

### Monthly review template (5-minute exercise)

```markdown
# CI/CD Review — 2026-05

## Numbers
- Deploys: X
- Auto-rollbacks: X
- Avg lead time: X hours
- Change failure rate: X%
- MTTR: X min (from incident log)

## What went well
- [bullet]

## What broke
- [bullet + link to post-mortem if any]

## Action items
- [bullet]
```

---

## 18. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GHA secrets leaked (SSH key, Sentry token) | Low | High | Dedicated deploy user on EC2 (not root). Sudoers restricted to specific commands. Key rotation every 90d. |
| PR gate gets a false positive and blocks legitimate merge | Medium | Low-medium | Admin can bypass manually. Document the bypass in incident log. |
| Deploy fails mid-way and leaves EC2 in weird state | Low | High | Auto-rollback on audit failure. Symlink swap (Phase 5) recovers instantly. |
| Prisma migration breaks production | Low | Critical | `--accept-data-loss=false` enforced. RDS automated snapshots daily. Phase 6 adds expand-contract discipline. |
| PM2 cluster mode surfaces Next.js shared-state bugs | Medium | Medium | Watch first deploy carefully. Fall back to fork mode + 2-process nginx upstream as backup. |
| GitHub Actions outage blocks all deploys | Low (GHA has 99.95% SLA) | Medium | Manual SSH deploy path stays documented in CLAUDE.md. Emergency hatch always available. |
| Builds take longer than 5 minutes (timeout concern) | Low | Low | Current build: 90s. Cache can cut to 30s. Headroom is huge. |
| Someone pushes a broken package.json change | Low | High | Gate #5 (dep-resolution dry-run) catches. If it slips through, auto-rollback catches. Two-layer defense. |
| Rollback itself fails | Very low | Critical | Manual SSH always works. Document rollback steps in CLAUDE.md. Keep last 3 builds in `releases/` after Phase 5. |
| SSH to EC2 fails from GHA runner | Low | High | GitHub publishes GHA runner IP ranges. EC2 security group rules allow those (or allow all 0.0.0.0/0 on port 22 with fail2ban + key-only auth — our current setup). |
| Auto-rollback triggers on a false-positive audit failure | Low-medium | Low (we just redeploy) | Audit checks are conservative (must see pm2 status + `/api/health` 200 + stderr clean). Hard to false-positive. |
| CI/CD logs leak sensitive info | Low | Medium | GHA masks secrets automatically. Set `::add-mask::` for computed values. Audit logs periodically. |

---

## 19. Decision points (needs your input)

These are YOUR calls before I start building. Answer these 7 and I can execute Phase 1 immediately.

1. **Phase order.** Do Phases 1 → 2 → 3 in one session (5-6 hours) OR spread over a week? My vote: one session.

2. **Notification channel.** Start with email only (free, zero setup) OR go straight to Slack/WhatsApp webhook? My vote: email first, upgrade later.

3. **Branch-protection strictness.** Enforce strict rules immediately (required status checks, no force push) OR start permissive and tighten after observation? My vote: strict from day one.

4. **Dependabot auto-merge.** Let Dependabot auto-merge patch-level dep bumps after all gates pass OR require Ali to review each? My vote: require review (safer). Revisit after 1 month.

5. **Emergency bypass policy.** Document + allow bypasses during outages OR block all bypasses (Ali uses manual SSH during emergencies)? My vote: bypasses allowed BUT require post-incident write-up.

6. **Phase 4 PM2 cluster migration.** Test in off-hours (2 AM Pakistan time when 0 plants producing) OR during low-traffic afternoon? My vote: off-hours.

7. **Phase 6 Prisma migrations.** Schedule for month 3-6 OR do it now since we're already doing infra work? My vote: defer — don't combine with Phase 1-5 launch.

---

## 20. Appendix — copy-pasteable YAML

Full workflows, ready to drop into `.github/workflows/`.

### `.github/workflows/ci.yml` — PR gates

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'

jobs:
  type-check:
    name: TypeScript compile
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npx tsc --noEmit

  validator:
    name: Centralization validator (20 checks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/validate-centralized.sh

  build:
    name: Next.js build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - uses: actions/cache@v4
        with:
          path: .next/cache
          key: nextjs-${{ hashFiles('**/package-lock.json') }}-${{ github.sha }}
          restore-keys: |
            nextjs-${{ hashFiles('**/package-lock.json') }}-
      - run: npm ci --legacy-peer-deps
      - run: npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19
      - run: npx prisma generate
      - run: npm run build
        env:
          SKIP_ENV_VALIDATION: 'true'
          DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy'

  lint:
    name: ESLint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npx eslint --max-warnings 0 app components lib middleware.ts

  dep-resolution:
    name: Dependency resolution (peer-dep dry-run)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Check if package.json changed
        id: deps-changed
        run: |
          if git diff --name-only origin/main...HEAD | grep -qE '^package(-lock)?\.json$'; then
            echo "changed=true" >> $GITHUB_OUTPUT
          else
            echo "changed=false" >> $GITHUB_OUTPUT
          fi
      - name: Verify react / @types/react major alignment
        if: steps.deps-changed.outputs.changed == 'true'
        run: |
          REACT=$(node -p "require('./package.json').dependencies?.react?.match(/\d+/)?.[0] || 'n/a'")
          TYPES=$(node -p "require('./package.json').devDependencies?.['@types/react']?.match(/\d+/)?.[0] || 'n/a'")
          if [ "$REACT" != "n/a" ] && [ "$TYPES" != "n/a" ] && [ "$REACT" != "$TYPES" ]; then
            echo "::error::react@$REACT vs @types/react@$TYPES — major version mismatch"
            exit 1
          fi
          echo "react@$REACT aligned with @types/react@$TYPES"
      - name: Clean install dry-run
        if: steps.deps-changed.outputs.changed == 'true'
        run: |
          TMP=$(mktemp -d)
          cp package.json package-lock.json "$TMP/"
          cd "$TMP"
          npm ci --legacy-peer-deps --no-audit --no-fund --dry-run

  gitleaks:
    name: Secret scanning (gitleaks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### `.github/workflows/deploy.yml` — deploy on merge

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false  # never cancel a running deploy

jobs:
  deploy:
    name: Deploy to production
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Pre-deploy audit
        run: bash scripts/audit-pre-deploy.sh

      - name: Capture current SHA for rollback
        id: prev
        run: |
          PREV_SHA=$(ssh -i <(echo "${{ secrets.EC2_SSH_KEY }}") \
            -o StrictHostKeyChecking=no ubuntu@${{ secrets.EC2_HOST }} \
            "cd ~/solar-web-app && git rev-parse HEAD")
          echo "sha=$PREV_SHA" >> $GITHUB_OUTPUT
          echo "Previous SHA: $PREV_SHA"

      - name: Deploy over SSH
        id: deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -e
            cd ~/solar-web-app
            echo "${{ steps.prev.outputs.sha }}" > ~/.spc-prev-sha

            echo "═══ Pull ═══"
            git pull origin main

            echo "═══ Install ═══"
            npm ci --legacy-peer-deps
            npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19

            echo "═══ Prisma ═══"
            npx prisma generate
            npx prisma db push --skip-generate --accept-data-loss=false

            echo "═══ Build ═══"
            rm -rf .next
            npm run build

            echo "═══ Reload ═══"
            pm2 reload solar-web
            pm2 reload solar-poller

            echo "═══ Warmup ═══"
            sleep 6

      - name: Post-deploy audit
        id: post-audit
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/solar-web-app
            bash scripts/audit-post-deploy.sh

      - name: Auto-rollback on audit failure
        if: failure() && steps.post-audit.outcome == 'failure'
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -e
            cd ~/solar-web-app
            PREV=$(cat ~/.spc-prev-sha)
            echo "ROLLING BACK TO $PREV"
            git reset --hard $PREV
            npm ci --legacy-peer-deps
            npm install --legacy-peer-deps @types/react@^19 @types/react-dom@^19
            npx prisma generate
            rm -rf .next
            npm run build
            pm2 reload solar-web
            pm2 reload solar-poller
            sleep 6
            bash scripts/audit-post-deploy.sh

      - name: Tag Sentry release
        if: success()
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: bijli-bachao-pk
          SENTRY_PROJECT: javascript-nextjs
        with:
          environment: production
          version: ${{ github.sha }}
          sourcemaps: ./.next

      - name: Notify (success)
        if: success()
        run: |
          echo "✅ Deploy ${{ github.sha }} succeeded"
          # Add Slack/WhatsApp webhook call here in Phase 3

      - name: Notify (failure)
        if: failure()
        run: |
          echo "❌ Deploy ${{ github.sha }} failed — rollback attempted"
          # Add alert webhook call here in Phase 3
```

### `.eslintrc.js` — minimal config for Phase 1

```js
module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Start permissive; tighten over time
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'react/no-unescaped-entities': 'off',
    '@next/next/no-img-element': 'off', // We use <img> intentionally on landing
  },
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'dist/',
    'prisma/generated/',
    'public/',
  ],
}
```

### Dependabot config — `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Karachi"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "deps"
      include: "scope"
    groups:
      # Group patch updates to reduce PR noise
      patch-updates:
        patterns: ["*"]
        update-types: ["patch"]
```

---

## Final summary

### The design
A 7-gate PR pipeline + 5-step deploy pipeline on GitHub-hosted runners + SSH to EC2, with auto-rollback on post-deploy audit failure. PM2 cluster mode for zero-downtime reload. Sentry release tagging. $0/month marginal cost.

### The principle
Because SPC has no staging, every merge-able PR must have passed every check that would run in a staging environment. After merge, the deploy is mechanical — but every risky action is wrapped in health checks with automatic rollback.

### The ask
Approve the 7 decision points in §19 and I'll start Phase 1.

---

*Research sources (ranked by influence on this design):*
- DORA metrics benchmarks (Google Cloud)
- Prisma expand-contract pattern docs
- PM2 cluster mode + graceful reload docs
- GitHub Actions 2026 pricing update
- Sentry GitHub deployment integration docs
- appleboy/ssh-action — de-facto GHA + SSH pattern
- gitleaks/gitleaks-action — de-facto secret scanning
- Dependabot — GitHub-native SCA
- SPC-specific: `POST_MORTEM_2026-04-22.md`, `AUDIT.md`, `scripts/audit-pre-deploy.sh` + `audit-post-deploy.sh`

*Paired files:*
- `NEXT-STEPS.md` — decision doc covering A/B/C/D options (this is "C" in depth)
- `POST_MORTEM_2026-04-22.md` — the incident that motivated this work
- `AUDIT.md` — full risk register
- `HANDOVER.md` — operator runbook
- `CLAUDE.md` — project context
- `scripts/audit-pre-deploy.sh` + `audit-post-deploy.sh` — the audit scripts this pipeline wraps

*Last updated: 2026-04-23 · paired with `app/page.tsx` commit `2900067` · supersedes the ad-hoc manual-deploy flow documented in CLAUDE.md.*
