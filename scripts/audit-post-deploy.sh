#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# audit-post-deploy.sh — runs ON EC2 immediately after `pm2 restart`
#
# Purpose:
#   Verify the deploy is actually serving traffic and healthy. Writes a
#   dated report to ~/solar-web-app/audits/ for the audit trail.
#   Exit non-zero → deployer should roll back.
#
# Usage (on EC2):
#   bash ~/solar-web-app/scripts/audit-post-deploy.sh
#
# Typical post-deploy wrapper (append to your deploy script):
#   pm2 restart solar-web solar-poller
#   sleep 15   # let Next.js boot
#   bash ~/solar-web-app/scripts/audit-post-deploy.sh || {
#     echo "POST-DEPLOY AUDIT FAILED — consider rolling back"
#     exit 1
#   }
# ═══════════════════════════════════════════════════════════════════════

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TS=$(date -u +'%Y-%m-%d %H:%M:%S UTC')
DAY=$(date -u +'%Y-%m-%d')
HHMM=$(date -u +'%H%M')

APP_ROOT="${APP_ROOT:-$HOME/solar-web-app}"
AUDITS_DIR="$APP_ROOT/audits/$DAY"
mkdir -p "$AUDITS_DIR"
REPORT="$AUDITS_DIR/$HHMM-post.md"

# Configurable via env
PUBLIC_URL="${PUBLIC_URL:-https://spc.bijlibachao.pk}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3001}"
PM2_APPS=(solar-web solar-poller)

ERRORS=0
WARNINGS=0

out() { echo -e "$1"; echo "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$REPORT"; }

out "# Post-deploy audit · $TS"
out ""
out "**Public URL:** $PUBLIC_URL · **Commit:** \`$(cd "$APP_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)\`"
out ""

# ── Check 1 — PM2 processes are online ─────────────────────────────
# pm2 jlist nests status under pm2_env.status — use Python to parse
# properly rather than brittle regex.
out "── Check 1: PM2 processes ─────────────────────────"
for app in "${PM2_APPS[@]}"; do
  READ=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
want = '$app'
data = json.load(sys.stdin)
for item in data:
  if item.get('name') == want:
    env = item.get('pm2_env', {})
    print(env.get('status','unknown'), env.get('pm_uptime',0))
    break
else:
  print('notfound 0')
" 2>/dev/null || echo "parse-error 0")
  STATUS=$(echo "$READ" | awk '{print $1}')
  UPTIME=$(echo "$READ" | awk '{print $2}')
  if [ "$STATUS" = "online" ]; then
    NOW_MS=$(($(date +%s) * 1000))
    UP_SEC=$(( (NOW_MS - UPTIME) / 1000 ))
    out "${GREEN}PASS${NC}: $app online (uptime ${UP_SEC}s)"
  else
    out "${RED}FAIL${NC}: $app status=${STATUS}"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Check 2 — Health endpoint ───────────────────────────────────────
out ""
out "── Check 2: /api/health ───────────────────────────"
HEALTH_RESP=$(curl -sS --max-time 10 -w "\n%{http_code}" "$LOCAL_URL/api/health" 2>&1 || echo "ERROR")
HEALTH_CODE=$(echo "$HEALTH_RESP" | tail -1)
HEALTH_BODY=$(echo "$HEALTH_RESP" | sed '$d')

if [ "$HEALTH_CODE" = "200" ]; then
  out "${GREEN}PASS${NC}: /api/health → 200"
  # Extract status from JSON (crude but avoids jq dependency)
  H_STATUS=$(echo "$HEALTH_BODY" | grep -oE '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
  H_DB=$(echo "$HEALTH_BODY" | grep -oE '"ok":(true|false)' | head -1)
  H_POLL_AGE=$(echo "$HEALTH_BODY" | grep -oE '"latest_measurement_age_sec":[0-9]*' | cut -d: -f2 | head -1)
  out "     status=$H_STATUS · db=$H_DB · poller_age_sec=${H_POLL_AGE:-unknown}"
  if [ "$H_STATUS" = "degraded" ]; then
    out "${YELLOW}WARN${NC}: health reports degraded (poller stale or similar)"
    WARNINGS=$((WARNINGS + 1))
  fi
elif [ "$HEALTH_CODE" = "503" ]; then
  out "${RED}FAIL${NC}: /api/health → 503 (service degraded/down)"
  out '```'
  out "$HEALTH_BODY"
  out '```'
  ERRORS=$((ERRORS + 1))
else
  out "${RED}FAIL${NC}: /api/health → $HEALTH_CODE"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 3 — Public URL reachable ─────────────────────────────────
out ""
out "── Check 3: Public root URL ───────────────────────"
PUB_CODE=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" "$PUBLIC_URL" 2>/dev/null || echo "000")
PUB_TIME=$(curl -sS --max-time 10 -o /dev/null -w "%{time_total}" "$PUBLIC_URL" 2>/dev/null || echo "0")
if [ "$PUB_CODE" = "200" ] || [ "$PUB_CODE" = "307" ]; then
  out "${GREEN}PASS${NC}: $PUBLIC_URL → $PUB_CODE (${PUB_TIME}s)"
else
  out "${RED}FAIL${NC}: $PUBLIC_URL → $PUB_CODE"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 4 — Recent stderr from solar-web ────────────────────────
out ""
out "── Check 4: solar-web stderr (last 2 min) ─────────"
LOG_FILE="$HOME/.pm2/logs/solar-web-error.log"
if [ -f "$LOG_FILE" ]; then
  # Count Error lines in the last 120 seconds worth of file
  ERR_COUNT=$(find "$LOG_FILE" -newermt "2 minutes ago" -print0 2>/dev/null | xargs -0 -I{} tail -200 {} | grep -cE '^Error|Failed|Cannot read|TypeError' || true)
  # If find didn't match (file untouched), assume 0 fresh errors
  if [ -z "$ERR_COUNT" ] || ! [[ "$ERR_COUNT" =~ ^[0-9]+$ ]]; then ERR_COUNT=0; fi
  if [ "$ERR_COUNT" -eq 0 ]; then
    out "${GREEN}PASS${NC}: 0 new errors in solar-web stderr"
  elif [ "$ERR_COUNT" -lt 5 ]; then
    out "${YELLOW}WARN${NC}: $ERR_COUNT error line(s) in solar-web stderr"
    WARNINGS=$((WARNINGS + 1))
  else
    out "${RED}FAIL${NC}: $ERR_COUNT error lines in solar-web stderr (last 2 min)"
    ERRORS=$((ERRORS + 1))
  fi
else
  out "${YELLOW}INFO${NC}: solar-web-error.log not found (first-ever deploy?)"
fi

# ── Check 5 — Recent stderr from solar-poller ─────────────────────
out ""
out "── Check 5: solar-poller stderr (last 10 min) ─────"
POLLER_LOG="$HOME/.pm2/logs/solar-poller-error.log"
if [ -f "$POLLER_LOG" ]; then
  RECENT=$(find "$POLLER_LOG" -newermt "10 minutes ago" -print0 2>/dev/null | xargs -0 -I{} tail -100 {})
  # Count ONLY 3rd-retry-exhausted provider failures (transient single retries are noise)
  PROV_ERR=$(echo "$RECENT" | grep -cE 'Failed to sync|HTTP 50[0-9]|ECONNREFUSED|ETIMEDOUT' || true)
  if [ -z "$PROV_ERR" ] || ! [[ "$PROV_ERR" =~ ^[0-9]+$ ]]; then PROV_ERR=0; fi
  if [ "$PROV_ERR" -eq 0 ]; then
    out "${GREEN}PASS${NC}: 0 provider-sync failures in the last 10 min"
  else
    out "${YELLOW}WARN${NC}: $PROV_ERR provider-sync failure(s) — check provider API status"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  out "${YELLOW}INFO${NC}: solar-poller-error.log not found"
fi

# ── Summary ─────────────────────────────────────────────────────────
out ""
out "── Summary ─────────────────────────────────────────"
PASSED=$((5 - ERRORS - WARNINGS))
out ""
out "- Passed: $PASSED · Warnings: $WARNINGS · Errors: $ERRORS"
out ""

if [ "$ERRORS" -gt 0 ]; then
  out "${RED}DEPLOY UNHEALTHY${NC} — consider rollback. Report: $REPORT"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  out "${YELLOW}DEPLOY HEALTHY WITH WARNINGS${NC} — Report: $REPORT"
  exit 0
else
  out "${GREEN}DEPLOY VERIFIED${NC} — Report: $REPORT"
  exit 0
fi
