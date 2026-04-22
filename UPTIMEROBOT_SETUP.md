# UptimeRobot — external uptime monitor

> Only the SSH key holder + Sentry sees problems from *inside*. UptimeRobot tells us
> "the site is reachable from the public internet" — a failure no internal tool
> can detect (routing outage, certificate expired, domain registration lapsed).
>
> **Cost:** free tier is sufficient (up to 50 monitors, 5-min interval).
> **Signup required:** yes (I can't do this on your behalf).

---

## 1. Sign up

Go to https://uptimerobot.com · click **"Sign Up"** · use a work email.

## 2. Add the SPC monitor

After login, click **"+ New monitor"** (green button, top-right).

| Field | Value |
|---|---|
| Monitor type | **HTTP(s)** |
| Friendly name | **SPC — /api/health** |
| URL (or IP) | `https://spc.bijlibachao.pk/api/health` |
| Monitoring interval | **5 minutes** (free tier min) |
| Alert contact(s) | your email · a Slack webhook URL if you have one |

Optional advanced (click "Advanced settings"):

| Field | Value | Why |
|---|---|---|
| Expected status codes | `200` | we return 503 when degraded — treat that as an alert |
| Alert threshold | 2 failed checks | avoid single-blip false alarms |
| HTTP method | GET |
| Request timeout | 15 seconds | our endpoint does a DB ping, allow cushion |

Click **Create Monitor**.

## 3. Add a second monitor for the root page (optional but recommended)

UptimeRobot only bills monitors, not checks. Add a second one for the main page
so a white-labelled 502 from Nginx (that somehow lets `/api/health` through)
doesn't escape us.

| Field | Value |
|---|---|
| Monitor type | HTTP(s) |
| Friendly name | SPC — root |
| URL | `https://spc.bijlibachao.pk/` |
| Interval | 5 minutes |
| Expected codes | `200, 307` (auth redirect to `/sign-in` is a 307, still "up") |

## 4. Configure alerts

In UptimeRobot's **"My Settings" → "Alert Contacts"**, set up:

- **Email** — always useful · goes to ops inbox
- **Slack webhook** (if you have a Slack workspace) — create one at
  https://api.slack.com/messaging/webhooks, paste URL into UptimeRobot

Attach both contacts to both monitors.

## 5. Verify it works

From the UptimeRobot dashboard, click your SPC monitor. You should see:

- **Current Status:** Up (green)
- **Uptime Ratio:** 100% (after first check)
- **Last Checked:** a timestamp within the last 5 min
- Response time graph populating

Trigger a test alert by pausing the `solar-web` PM2 process for 2 minutes:

```bash
ssh -i thingsboard.pem ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com
pm2 stop solar-web
# wait 2 checks (10 min) for UptimeRobot to fire
pm2 start solar-web
```

You should receive an email/Slack "Monitor is DOWN" then "Monitor is UP".

## 6. Add the public status page (optional, for customers / auditors)

UptimeRobot → **"Public Status Pages"** → **"+ Add new"**:

| Field | Value |
|---|---|
| Page name | SPC Status |
| Domain | `status.bijlibachao.pk` (requires CNAME to `stats.uptimerobot.com`) OR use the free uptimerobot.com subdomain |
| Monitors | tick both SPC monitors |
| Design | neutral theme matching v3 solar-gold would be nice but not required |

This gives an operator-facing "is it up?" URL you can share with the enterprise
team without giving them UptimeRobot logins.

---

## Notes on what UptimeRobot catches vs our internal tools

| Failure mode | `/api/health` internally | UptimeRobot |
|---|---|---|
| DB unreachable | ✅ reports `status=down` | ✅ sees 503 |
| Poller stale | ✅ reports `stale=true` | ✅ sees 503 (we return it) |
| EC2 off | ❌ can't report | ✅ sees timeout |
| Nginx down | ❌ can't report | ✅ sees connection refused |
| DNS lapse / cert expired | ❌ can't report | ✅ sees cert/DNS error |
| AWS region outage | ❌ can't report | ✅ sees timeout |
| Route 53 misconfiguration | ❌ can't report | ✅ sees DNS NXDOMAIN |

**Internal tools diagnose; UptimeRobot proves.**
