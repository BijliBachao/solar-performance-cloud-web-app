# SPC — Next Steps Decision Doc

> **Purpose:** The 4 things we could work on next on the SPC product (the dashboard + admin platform, NOT the landing page). Each explained in plain language so you can pick intelligently.
>
> **As of:** 2026-04-23
> **Status of the platform:** ✅ Stable, live at `https://spc.bijlibachao.pk/dashboard`. No emergencies. All 4 items below are improvements, not fires.

---

## Quick overview

| Option | What it is | Risk | Time | Your time needed |
|---|---|---|---|---|
| **A** | Monthly Health Report (dashboard widget) | 🟢 Very low | 3–4 h | ~1 h review |
| **B** | Next.js 15 upgrade (closes 7 security CVEs) | 🟡 Medium-high | 4–8 h | ~1 h review |
| **C** | CI/CD pipeline (GitHub Actions auto-deploy) | 🟢 Low | 2–4 h | ~30 min review |
| **D** | UptimeRobot (external monitoring) | 🟢 Zero | 10 min | **10 min — this is mostly YOU** |

---

# Option A — Monthly Health Report

## What it is in one sentence

A **dashboard widget** that shows a plant's last 30 days of performance as a colored grid (rows = PV strings, columns = days, cell color = health score).

## The picture in your head

Imagine a calendar. On the left edge: list of your PV strings (PV1, PV2, PV3 … PV150). Along the top: the last 30 days. Each cell is colored:

- 🟢 **Green** — string healthy that day (≥ 90%)
- 🟡 **Amber** — warning (50–89%)
- 🔴 **Red** — critical (< 50%)
- ⚫ **Grey** — no data that day

A customer can see at a glance: "PV7 went from green → yellow → red over the last 3 weeks" — panel degradation caught early.

## Why it matters

- **Today:** customers see LIVE status (right now) + 24h data. They CAN'T see "how has my plant done this month".
- **Problem it solves:** gradual degradation — panels dying slowly over weeks. The current pages only show snapshots; this shows trends.
- **History:** you built this component before launch day (2026-04-22), then hid it because we were going live in 4 hours. Your exact words: *"we'll work on it later"*. The code is there — just not rendered yet.

## What the work involves

1. **Query** the database for last-30-days per-string daily health scores (backend already has it — `string_daily` table)
2. **Render** the heatmap grid UI (scrollable — we have 316 active strings, 30 days = 9,480 cells — plenty)
3. **Click-through** — click a cell to see that specific string's detail for that day
4. **Filters** — plant selector + date-range picker (defaults to last 30 days)
5. **Empty state** — "Not enough data" when a string has < 7 days of history
6. **Test** on real data (you have 316 active strings today)
7. **Deploy**

## Risk

🟢 **Very low.** Backend data exists. It's UI work on a single component. If it breaks, we hide it again — the dashboard continues working.

## Effort

- **My time:** ~3–4 hours
- **Your time:** ~1 hour to review the final result
- **Deploys needed:** 1 (single shipment)

## When to pick this

- You want to finish the dashboard before adding anything new
- You want a **small visible win** customers immediately notice
- You don't have a 6-hour block free — this fits in a single focused session
- You want the "complete" feeling before moving to less-visible work

## When NOT to pick this

- You're worried about security (pick B first)
- You want deploy automation (pick C first)

---

# Option B — Next.js 15 Upgrade

## What it is in one sentence

**Upgrading the underlying web framework** from Next.js version 14 to version 15 to close 7 documented security vulnerabilities.

## Background — what Next.js even is

Next.js is the **framework the entire SPC app is built on**. Think of it like the engine under a car:

- You never see it when you drive
- It runs everything — the pages, the API routes, the sign-in flow, the dashboard
- Every month the engine gets updates and patches
- If you don't update it, old security holes stay open

We're on Next.js 14.2.35. Current stable is 15.x.

## What the 7 CVEs are

CVE = **Common Vulnerabilities and Exposures** — publicly documented security holes.

All 7 in our current Next 14.x are **Denial of Service (DoS)** class — meaning an attacker could send crafted requests that crash the app or consume server resources. None of them are "data theft" or "account takeover" — they're "crash the site" attacks.

## Why it matters

- **Today we have mitigations:** nginx rate limiting (blocks flood attacks), fail2ban (blocks repeat offenders), firewall rules (UFW). These reduce the risk but don't eliminate it.
- **Over time:** unpatched frameworks become bigger targets. Once an attacker knows exactly which version you're on (visible in HTTP headers), exploit kits auto-target you.
- **Customer trust:** insurance and enterprise customers increasingly audit dependency versions. "Running latest Next.js" is a trust checkbox.
- **Our 2026-04-22 incident:** was NOT from a Next.js CVE — it was from a peer-dependency mismatch after a Clerk upgrade. But the outage proved our stack is sensitive to dependency upgrades. So Next 15 needs **careful** handling, not a quick `npm install`.

## What the work involves

1. **Read** the Next 14 → 15 migration guide
2. **Run** `npx @next/codemod@canary upgrade` — Next.js ships an official auto-migrator that rewrites most breaking changes for you
3. **Fix breaking changes** — Next 15 changed some defaults:
   - `params` and `searchParams` (route params) are now `Promise` objects — you have to `await` them instead of reading directly
   - Some caching defaults changed (specifically `fetch` no longer caches by default)
   - `headers()` and `cookies()` are async now
   - Some React hooks behave differently
4. **Fix any TypeScript errors** — the compiler will catch most of them
5. **Test every route locally** — sign-in, plant list, plant detail, analysis, alerts
6. **Run the validator** (20/20 checks) + pre-deploy audit
7. **Staged deploy** — build on EC2 but keep old version PM2-running until verified (we can do this by building to a different directory first)
8. **Fix anything that broke on production**
9. **Full regression test:** sign-in → plant list → plant detail → analysis → alerts → sign-out → sign-in as admin → admin pages

## Risk

🟡 **Medium to high.** Next 15 has real breaking changes. The auto-migration codemod helps but doesn't catch 100%. Worst case: another 502 outage like 2026-04-22 — but this time from Next.js changes, not peer-dependencies.

Rollback plan: `git revert` the upgrade commit → redeploy. Tested escape route.

## Effort

- **My time:** 4–8 hours (wide range — depends on what the codemod breaks)
- **Your time:** ~1 hour to review + approve
- **Deploys needed:** 2–3 (staged, with rollback ready)

## When to pick this

- You're in a calm business week — no launch, no active sales push
- You have 4+ hours of focused time to babysit the deploy
- You're OK with some risk to close real security exposure
- Ideally: **late-night Pakistan time** (customer impact minimised if something breaks)

## When NOT to pick this

- You have a big sales / partnership meeting this week — don't take risk
- You're planning to leave the platform unwatched for days
- It's Friday afternoon — never do this Friday afternoon (support-hours are limited over weekend)

---

# Option C — CI/CD Pipeline (GitHub Actions)

## What it is in one sentence

**Automating the deploy process** so that every push to `main` is automatically audited, built, and deployed — with a human checkable log.

## What our deploy looks like TODAY (manual)

```
1. I write code
2. I push to main
3. I manually SSH into EC2
4. I manually run: git pull
5. I manually run: npm ci && npx prisma generate && rm -rf .next && npm run build
6. I manually run: pm2 restart solar-web
7. I manually run: bash scripts/audit-post-deploy.sh
8. I hope nothing broke
```

**The problem:** step 0 (pre-deploy audit) is voluntary. Today's 502 outage at 13:07 UTC happened because the pre-audit wasn't run — it would have caught the peer-dep issue.

## What it would look like AFTER CI/CD

```
1. I write code
2. I push to main
3. GitHub Actions automatically:
   ├── checks TypeScript
   ├── runs the validator (20 checks)
   ├── runs pre-deploy audit (6 checks including Check 6 dep-resolution)
   ├── IF ANY CHECK FAILS → STOP. Notify Ali on Slack/email. Don't deploy.
   ├── IF ALL PASS → SSH to EC2, pull, build, restart pm2
   └── runs post-deploy audit. Notify Ali on Slack/email: ✅ or ❌
4. I get a Slack ping: "✅ deploy 5fab0f9 succeeded — 72 sec build, /api/health 200"
```

**No step can be skipped.** The audit IS the deploy gate.

## What GitHub Actions actually is

It's built into GitHub already. Every repo can have an automation file at `.github/workflows/deploy.yml` describing what should run on what trigger (push, PR, tag, schedule). GitHub provides the compute for free (2,000 minutes/month for private repos — we'd use <30 min/month).

## Why it matters

- **Today** we rely on *me remembering* to run the audit before push. Today's outage proves that's a bad design.
- **After:** the audit can't be skipped. A broken deploy is caught before it reaches production.
- **Bonus:** the whole process is visible — every deploy has a log, a timestamp, a pass/fail record. If something breaks, we can look at the exact commit log and see which check failed.
- **Team-ready:** if another engineer joins Bijli Bachao, they can push without needing SSH access. CI/CD deploys for them.

## What the work involves

1. **Write** `.github/workflows/deploy.yml` — a YAML file describing the pipeline steps
2. **Store secrets** in GitHub repo settings:
   - SSH private key (for the `ssh ubuntu@...` step)
   - GITHUB_TOKEN (auto-provided by GitHub)
   - No DATABASE_URL needed at CI level (only at EC2)
3. **Copy** the existing `scripts/audit-pre-deploy.sh` logic into the pipeline
4. **Test on a dummy branch first** — push a few test commits, verify:
   - Passes when everything's green
   - Fails and STOPS when TypeScript has an error
   - Fails and STOPS when validator finds a problem
   - Deploys when all checks pass
5. **Wire in post-deploy audit** via SSH step (`ssh ec2 'bash scripts/audit-post-deploy.sh'`)
6. **Add notifications** — Slack webhook OR email for deploy success/failure
7. **Document** how to bypass in emergencies (hotfix override using a specific commit message flag)
8. **Turn it on** — from now, every push auto-deploys

## Risk

🟢 **Low during setup.** No production changes while we're building it. We test on a dummy branch.
Once live, it makes production **safer** not riskier — it can only BLOCK bad deploys, it can't make them worse.

## Effort

- **My time:** 2–4 hours (mostly writing YAML and testing the workflow end-to-end)
- **Your time:** 30 min review + approval to turn it on
- **Deploys needed:** 0 (the pipeline itself isn't deployed — it's a GitHub config)

## When to pick this

- You deploy more than once a week (today alone we deployed ~5 times — this saves a lot of "did I remember to audit?" decisions)
- You want to eliminate the possibility of another 2026-04-22-style outage
- You want every deploy to have an audit paper trail automatically

## When NOT to pick this

- You're going to hand the project off to someone else soon (then they should set it up their way)
- You want a "tangible" week — CI/CD is invisible work, no customer-visible change

---

# Option D — UptimeRobot

## What it is in one sentence

**A free external service** that pings your site every 5 minutes and alerts you on WhatsApp / email / Slack if it ever stops responding.

## The picture in your head

UptimeRobot is like a security guard posted OUTSIDE your building, watching your front door. They have no relation to your team or your servers — they're independent. Every 5 minutes they knock on the door (hit `https://spc.bijlibachao.pk/api/health`). If you answer, they tick off "still up". If you don't answer for 10 min, they call you: **"⚠ your site is DOWN"**.

## Why an external ping?

**Why not use our own monitoring (Sentry, Netdata, audit cron)?**
Because if your server crashes, your server-side monitoring **also crashes** — you'd never get the alert. External monitoring sees what customers see: "I tried to open the site, it didn't respond."

## What our `/api/health` endpoint returns

```json
{
  "status": "ok",
  "db": { "ok": true },
  "poller": { "last_run_sec_ago": 45 }
}
```

UptimeRobot:
1. Hits the URL
2. Gets a `200 OK` response with the JSON
3. Optionally parses the JSON and checks `"status": "ok"` (they support this)
4. If ok → no alert, log "up"
5. If 500 / 503 / timeout → **alert sent within 5 min**

## Why it matters

- **Today** if SPC goes down at 3 AM on a Sunday, you find out when a customer complains on Monday morning.
- **After UptimeRobot** you get a WhatsApp / email / Slack alert **within 5 minutes** of any outage.
- **Our 2026-04-22 outage:** caught by post-deploy audit after 3 minutes (lucky — we were in the deploy window). If it had happened 6 hours later when you were asleep, you wouldn't have known for 8+ hours. UptimeRobot would have woken you.
- **Public uptime badge:** UptimeRobot gives you a public `status.bijlibachao.pk`-style badge showing your historical uptime. Customers like that.
- **Compliance stat:** currently ~99.9% uptime (3 min outage in 10-hour window). UptimeRobot measures this officially.

## What the work involves

**This is mostly YOU — not me.**

### Your 10 minutes:

1. Go to https://uptimerobot.com
2. Click "Register for FREE"
3. Use your BijliBachao email (doesn't matter which, but prefer one you check daily)
4. Verify the email
5. Click "+ Add New Monitor"
6. Fill in:
   - **Type:** HTTP(S)
   - **Friendly Name:** `SPC Production` (or whatever)
   - **URL:** `https://spc.bijlibachao.pk/api/health`
   - **Monitoring Interval:** 5 minutes (free tier default)
   - **Alert When Down:** select "Response Code Match" and set it to check for status codes 2xx only
7. Click "Create Monitor"
8. In "My Profile" → "Alert Contacts" add your:
   - Email (default)
   - WhatsApp (use their Twilio / SMS gateway OR use a free Slack/Discord webhook)
9. Link the contact to the monitor
10. Done. Now UptimeRobot pings `/api/health` every 5 min forever.

### My part (already done):

- `/api/health` endpoint is public (verified ✓)
- Returns JSON with `"status": "ok"` when healthy (verified ✓)
- Returns 503 when DB is down (code exists ✓)

### The setup guide already exists

See `UPTIMEROBOT_SETUP.md` in this repo — I wrote it last week with screenshots-worth-of-steps.

## Risk

🟢 **Zero risk.** No code changes. No production impact. Just an independent pair of eyes watching from outside. Worst case: they send too many email alerts and you have to tune the alert threshold.

## Effort

- **My time:** 0 (setup already written, endpoint already live)
- **Your time:** ~10 minutes
- **Deploys needed:** 0

## When to pick this

- **Today. Right now. Literally 10 minutes.**
- Before you go on any trip / holiday
- Before any big sales push where an outage would be embarrassing

## When NOT to pick this

- Never. There's no scenario where NOT having external monitoring on a production site is sensible.

---

# Side-by-side comparison

| Criterion | A · Monthly Report | B · Next 15 | C · CI/CD | D · UptimeRobot |
|---|---|---|---|---|
| **What you get** | A new dashboard widget | 7 security holes closed | Automated safe deploys | External uptime alerts |
| **Visible to customer** | ✅ Yes — new feature | ❌ No (invisible security) | ❌ No (internal tooling) | ❌ No (peace of mind) |
| **Who does the work** | Me | Me (you review) | Me (you approve) | **You** (10 min) |
| **Risk of breaking prod** | 🟢 Very low | 🟡 Medium–high | 🟢 Low | 🟢 Zero |
| **Your time needed** | ~1 h review | ~1 h review | ~30 min approval | ~10 min signup |
| **My time** | 3–4 h | 4–8 h | 2–4 h | 0 min |
| **Deploys needed** | 1 | 2–3 | 0 (no production change) | 0 |
| **Urgency** | No deadline | 30-day window | 30-day window | **Do it today** |
| **Reversibility** | Just hide it again | `git revert` | Turn off workflow | Delete monitor |

---

# My honest recommended order

### 🥇 1. Today, 10 minutes → **UptimeRobot** (Option D)
Zero risk. Zero of my time. 10 min of yours. Gains you sleep-well-at-night peace of mind immediately. **There is literally no excuse to skip this.**

### 🥈 2. Next session (3–4 hours of mine) → **Monthly Health Report** (Option A)
Customer-visible win. Completes the dashboard. Low risk. Good "tangible" week.

### 🥉 3. Later this month (2–4 hours) → **CI/CD Pipeline** (Option C)
Stops future 2026-04-22-style deploy surprises. Invisible to customers but a quiet game-changer for our reliability.

### 🏅 4. When you have a calm 6-hour block → **Next.js 15 upgrade** (Option B)
The risky-but-important one. Don't rush this. Pick a late-night window, test carefully, have a rollback plan.

---

# FAQ

### Q: Can I do more than one at a time?
**A:** Sure. D + A could be same day (D is 10 min of you, A is 3-4 h of me — don't block each other). Don't combine B with anything else in the same session.

### Q: What if I don't have time for any of these right now?
**A:** Do D today (10 min). Then ignore this file for a month. Everything else is scheduled — no emergency.

### Q: What if something NEW breaks? Can we pause and fix?
**A:** Yes. The platform is stable today. These 4 options are improvements. If a real bug or customer issue surfaces, that takes priority.

### Q: What if I want to do something completely different?
**A:** Tell me. We can always course-correct. These are just the highest-value things I see from today's audit.

### Q: Do I need to read LANDING-DESIGN.md or SPC-KNOWLEDGE-BOOK.md for any of these?
**A:** No. Those are for the landing page. This is product work. Keep them separate.

### Q: What about the 7 open items in AUDIT.md?
**A:** 3 of them are the 4 options above (Next 15 = B, CI/CD = C, UptimeRobot = D). The other 4 are:
- **H2 — Test suite** (60-day window): unit + integration tests. Would be "Option E" if we ever write it.
- **H3 / H6 — Separate EC2** (90-day window): infrastructure scaling. Not coding — ops work.
- **M1 — Backfill script**: auto-fixes itself over time. Low value to prioritise.
- **Content-CMS**: not in AUDIT but could add a CMS for plant descriptions, owner names, etc. Not urgent.

---

## Contact

If you want to discuss / change priorities: just message Claude with "discuss next steps" and this doc + the 4 options are your reference.

*Last updated: 2026-04-23 · next review: when any of A / B / C ships.*
