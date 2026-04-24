# Wattey ↔ SPC Coordination — Shared EC2 Rules

**For:** Wattey developer team
**From:** SPC (Solar Performance Cloud) team
**Host:** `ubuntu@ec2-54-175-170-207.compute-1.amazonaws.com`
**Last updated:** 2026-04-24
**SPC contact:** ai@right2fix.com

---

This EC2 hosts **two apps side by side**: SPC (`spc.bijlibachao.pk`) and Wattey (`wattey.bijlibachao.pk`). This document tells you **exactly what belongs to SPC so you can avoid it**. Respect the boundaries below and neither team will break the other.

---

## 1. Ownership map — never cross these lines

| Resource | Wattey (yours) | SPC (do NOT touch) |
|---|---|---|
| **App dir on EC2** | `~/reyy` | `~/solar-web-app` |
| **Port (internal)** | 3000 | 3001 |
| **Nginx site file** | `/etc/nginx/sites-available/wattey` | `/etc/nginx/sites-available/spc.bijlibachao.pk` |
| **Domain** | `wattey.bijlibachao.pk` | `spc.bijlibachao.pk` |
| **PM2 processes** | `nextjs-app`, `mqtt-service`, `reconcile-service` | `solar-web`, `solar-poller` |
| **Database (on shared RDS)** | your Wattey DB | `solar_dashboard` |

**SPC-owned tables inside `solar_dashboard` — do not write to any of these:**
`alerts`, `device_daily`, `devices`, `organizations`, `plant_assignments`, `plants`, `string_daily`, `string_hourly`, `string_measurements`, `users`, `vendor_alarms`

---

## 2. Dangerous commands — do NOT run on this shared host under any circumstance

| Command | Why it's banned |
|---|---|
| `pm2 delete all` / `pm2 restart all` / `pm2 kill` / `pm2 stop all` | Hits both apps — will kill SPC silently |
| `sudo systemctl restart nginx` | Hard restart drops in-flight requests on both domains; use `sudo nginx -t && sudo systemctl reload nginx` instead |
| `DROP DATABASE solar_dashboard` / any write on SPC tables | Destroys SPC data |
| `CREATE TABLE` in `solar_dashboard` | SPC uses Prisma `db push`; a hand-made table will break the next SPC deploy |
| Node.js / PM2 upgrade without coordination | SPC is locked to Node 18.20.8 + PM2 6.0.13; upgrading may break SPC |
| Opening port 3000 or 3001 in the AWS Security Group | Both apps proxy through Nginx; direct exposure breaks TLS and rate limiting |

---

## 3. Safe PM2 patterns — target by name, always

```bash
# Your Wattey processes
pm2 restart nextjs-app mqtt-service reconcile-service
pm2 logs nextjs-app
pm2 stop nextjs-app

# SPC processes — do not touch, shown for reference only
# pm2 restart solar-web solar-poller
# pm2 logs solar-poller
```

Target every `pm2` command by process name. Never use `all`.

---

## 4. Nginx safety

Your config: `/etc/nginx/sites-available/wattey`
SPC config: `/etc/nginx/sites-available/spc.bijlibachao.pk` — **do not edit**

When you change your own Nginx config:
```bash
sudo nginx -t               # test syntax first
sudo systemctl reload nginx # graceful — does not drop connections
```

Never `sudo systemctl restart nginx` — it's a hard restart that interrupts both apps.

Both domains use Let's Encrypt certs renewed by certbot. Plain `sudo certbot renew` (no `--force-renewal`) is safe.

---

## 5. Database — shared RDS, separate databases

**RDS host:** `bijli-bachao-db.cgposcwuc9y6.us-east-1.rds.amazonaws.com:5432`

The RDS instance is shared. Each app uses its own database inside that instance. SPC owns `solar_dashboard`; Wattey owns a different database on the same instance.

Read-only queries against `solar_dashboard` are fine if you ever need SPC data for a joint report — please coordinate first.

---

## 6. Shared system resources

| Resource | Version | Notes |
|---|---|---|
| **Node.js** | 18.20.8 | Do not upgrade without coordinating; SPC has tested against this version |
| **PM2** | 6.0.13 | Shared daemon; do not upgrade without coordinating |
| **Nginx** | system default | Reload (not restart) when editing your own site |
| **Disk (`/`)** | ~25% used | SPC poller logs are the main growth; `pm2-logrotate` handles rotation |

---

## 7. What to do if something breaks

| Symptom | Interpretation | Action |
|---|---|---|
| Wattey down, SPC up | Wattey-side issue | Wattey team handles |
| SPC down, Wattey up | SPC-side issue | SPC team handles |
| **Both down** | Shared infra (disk, Nginx, Node, PM2 daemon, RDS) | Contact both teams **before** any destructive recovery (no reboots, no `pm2 kill`, no hard nginx restarts) |

---

## 8. Sanity-check commands — run after any change to shared config

```bash
# Expect 5 app processes: 3 Wattey + 2 SPC
pm2 list

# Expect both 3000 (Wattey) and 3001 (SPC) in LISTEN state
sudo netstat -tlnp | grep -E ':300[01]'

# Expect 2 nginx sites enabled
ls /etc/nginx/sites-enabled/
# → spc.bijlibachao.pk  wattey

# Expect 200
curl -o /dev/null -s -w "%{http_code}\n" https://spc.bijlibachao.pk
```

If any of those numbers change after your work, something that belongs to SPC was touched — revert before walking away.

---

## 9. SPC deploy footprint — what you'll see when SPC pushes

When the SPC team deploys:

1. `cd ~/solar-web-app && git pull`
2. `npm ci --legacy-peer-deps` inside `~/solar-web-app`
3. `npx prisma db push` against `solar_dashboard` only
4. `rm -rf .next && npm run build`
5. `pm2 restart solar-web solar-poller`

You should see **zero impact** on Wattey during SPC deploys. If Wattey traffic is disrupted during an SPC deploy, email ai@right2fix.com immediately.

---

**Thanks for keeping these boundaries. Shared infra works when both sides play nice.**

— SPC Team
