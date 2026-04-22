#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# audit-continuous.sh — runs on EC2 every hour via cron
#
# Purpose:
#   Hourly heartbeat telemetry. Captures system + data-integrity + poller
#   state in a dated markdown report. No external dependencies — just
#   bash + psql + pm2 + df/free/uptime.
#
# Cron installation (on EC2):
#   crontab -e
#   # append:
#   0 * * * * bash /home/ubuntu/solar-web-app/scripts/audit-continuous.sh >> /home/ubuntu/solar-web-app/audits/cron.log 2>&1
#
# Reports land in ~/solar-web-app/audits/YYYY-MM-DD/HHMM-continuous.md.
# No rotation policy yet — add find -mtime +30 -delete later.
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
REPORT="$AUDITS_DIR/$HHMM-continuous.md"

DBURL=""
if [ -f "$APP_ROOT/.env" ]; then
  DBURL=$(grep '^DATABASE_URL=' "$APP_ROOT/.env" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//' | cut -d'?' -f1)
fi

WARNINGS=0
ERRORS=0

out() { echo -e "$1"; echo "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$REPORT"; }

out "# Continuous audit · $TS"
out ""

# ── System: disk, memory, CPU ──────────────────────────────────────
out "## System"
out ""

DISK_PCT=$(df -h / 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
DISK_USED=$(df -h / 2>/dev/null | awk 'NR==2 {print $3"/"$2}')
if [ -n "$DISK_PCT" ] && [ "$DISK_PCT" -gt 85 ]; then
  out "- ${RED}disk${NC}: ${DISK_USED} (${DISK_PCT}%) — CRITICAL"
  ERRORS=$((ERRORS + 1))
elif [ -n "$DISK_PCT" ] && [ "$DISK_PCT" -gt 70 ]; then
  out "- ${YELLOW}disk${NC}: ${DISK_USED} (${DISK_PCT}%) — warning"
  WARNINGS=$((WARNINGS + 1))
else
  out "- ${GREEN}disk${NC}: ${DISK_USED} (${DISK_PCT}%)"
fi

MEM_USED=$(free -m 2>/dev/null | awk 'NR==2 {print $3"/"$2" MB"}')
MEM_PCT=$(free 2>/dev/null | awk 'NR==2 {printf "%.0f", $3*100/$2}')
if [ -n "$MEM_PCT" ] && [ "$MEM_PCT" -gt 85 ]; then
  out "- ${YELLOW}mem${NC}: ${MEM_USED} (${MEM_PCT}%) — warning"
  WARNINGS=$((WARNINGS + 1))
else
  out "- ${GREEN}mem${NC}: ${MEM_USED} (${MEM_PCT}%)"
fi

LOAD=$(uptime | awk -F'load average:' '{print $2}' | xargs)
out "- load: $LOAD"

# ── SSL cert expiry ────────────────────────────────────────────────
out ""
out "## SSL"
out ""
SSL_DAYS=""
if command -v openssl >/dev/null 2>&1; then
  SSL_DAYS=$(echo | openssl s_client -servername spc.bijlibachao.pk -connect spc.bijlibachao.pk:443 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2)
  if [ -n "$SSL_DAYS" ]; then
    EXP_EPOCH=$(date -d "$SSL_DAYS" +%s 2>/dev/null || echo 0)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXP_EPOCH - NOW_EPOCH) / 86400 ))
    if [ "$DAYS_LEFT" -lt 14 ]; then
      out "- ${RED}SSL cert${NC}: ${DAYS_LEFT} days remaining — certbot renewal should have run"
      ERRORS=$((ERRORS + 1))
    elif [ "$DAYS_LEFT" -lt 30 ]; then
      out "- ${YELLOW}SSL cert${NC}: ${DAYS_LEFT} days remaining"
      WARNINGS=$((WARNINGS + 1))
    else
      out "- ${GREEN}SSL cert${NC}: ${DAYS_LEFT} days remaining"
    fi
  fi
fi

# ── PM2 state ──────────────────────────────────────────────────────
out ""
out "## PM2"
out ""
for app in solar-web solar-poller; do
  PM2_JSON=$(pm2 jlist 2>/dev/null || echo '[]')
  STATUS=$(echo "$PM2_JSON" | grep -oE "\"name\":\"$app\"[^}]*\"status\":\"[^\"]*\"" | grep -oE '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
  RESTARTS=$(echo "$PM2_JSON" | grep -oE "\"name\":\"$app\"[^}]*\"restart_time\":[0-9]*" | grep -oE '"restart_time":[0-9]*' | cut -d: -f2 | head -1)
  if [ "$STATUS" = "online" ]; then
    out "- ${GREEN}$app${NC}: online (lifetime restarts: ${RESTARTS:-n/a})"
  else
    out "- ${RED}$app${NC}: ${STATUS:-unknown}"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Database ────────────────────────────────────────────────────────
if [ -n "$DBURL" ] && command -v psql >/dev/null 2>&1; then
  out ""
  out "## Database"
  out ""

  DB_SIZE=$(psql "$DBURL" -At -c "SELECT pg_size_pretty(pg_database_size(current_database()))" 2>/dev/null)
  out "- db size: ${DB_SIZE:-(unavailable)}"

  # Table row counts
  ROWS_MEAS=$(psql "$DBURL" -At -c "SELECT COUNT(*) FROM string_measurements" 2>/dev/null || echo 0)
  ROWS_HOURLY=$(psql "$DBURL" -At -c "SELECT COUNT(*) FROM string_hourly" 2>/dev/null || echo 0)
  ROWS_DAILY=$(psql "$DBURL" -At -c "SELECT COUNT(*) FROM string_daily" 2>/dev/null || echo 0)
  ROWS_ALERTS_OPEN=$(psql "$DBURL" -At -c "SELECT COUNT(*) FROM alerts WHERE resolved_at IS NULL" 2>/dev/null || echo 0)
  out "- rows: measurements ${ROWS_MEAS} · hourly ${ROWS_HOURLY} · daily ${ROWS_DAILY} · open_alerts ${ROWS_ALERTS_OPEN}"

  # Ingestion rate
  ROWS_LAST_HR=$(psql "$DBURL" -At -c "SELECT COUNT(*) FROM string_measurements WHERE timestamp > NOW() - INTERVAL '1 hour'" 2>/dev/null || echo 0)
  AVG_LAST_24H=$(psql "$DBURL" -At -c "
    SELECT ROUND(COUNT(*) / 24.0, 0)
    FROM string_measurements
    WHERE timestamp > NOW() - INTERVAL '24 hours'
  " 2>/dev/null || echo 0)

  if [ "$ROWS_LAST_HR" -eq 0 ]; then
    out "- ${RED}ingestion${NC}: 0 rows last hour — poller silent"
    ERRORS=$((ERRORS + 1))
  elif [ "$AVG_LAST_24H" -gt 0 ]; then
    # Flag if last-hour rate < 50% of 24h avg (daylight vs night will dip — but this catches outages)
    HALF=$((AVG_LAST_24H / 2))
    if [ "$ROWS_LAST_HR" -lt "$HALF" ]; then
      out "- ${YELLOW}ingestion${NC}: ${ROWS_LAST_HR} rows/hr (24h avg ${AVG_LAST_24H}) — below half of average"
      WARNINGS=$((WARNINGS + 1))
    else
      out "- ${GREEN}ingestion${NC}: ${ROWS_LAST_HR} rows/hr (24h avg ${AVG_LAST_24H})"
    fi
  else
    out "- ingestion: ${ROWS_LAST_HR} rows/hr (no 24h baseline)"
  fi

  # Freshness: oldest per table + newest
  LATEST_MEAS=$(psql "$DBURL" -At -c "SELECT EXTRACT(EPOCH FROM (NOW() - MAX(timestamp)))::int FROM string_measurements" 2>/dev/null || echo "")
  if [ -n "$LATEST_MEAS" ] && [ "$LATEST_MEAS" -gt 0 ]; then
    if [ "$LATEST_MEAS" -gt 900 ]; then   # 15 minutes = STALE_MS
      out "- ${RED}freshness${NC}: latest measurement ${LATEST_MEAS}s ago — STALE"
      ERRORS=$((ERRORS + 1))
    else
      out "- ${GREEN}freshness${NC}: latest measurement ${LATEST_MEAS}s ago"
    fi
  fi

  # Sensor-fault rate: how many rows are PHYSICALLY IMPOSSIBLE?
  # (If the poller fix has shipped, this should trend to zero.)
  FAULT_TODAY=$(psql "$DBURL" -At -c "
    SELECT COUNT(*) FROM string_measurements
    WHERE timestamp > CURRENT_DATE
      AND (current >= 50 OR power >= 25000)
  " 2>/dev/null || echo 0)
  TOTAL_TODAY=$(psql "$DBURL" -At -c "
    SELECT COUNT(*) FROM string_measurements WHERE timestamp > CURRENT_DATE
  " 2>/dev/null || echo 1)
  if [ "$TOTAL_TODAY" -gt 0 ]; then
    FAULT_PCT=$(echo "scale=2; $FAULT_TODAY * 100 / $TOTAL_TODAY" | bc 2>/dev/null || echo "0")
    out "- sensor-fault rows today: ${FAULT_TODAY} / ${TOTAL_TODAY} (${FAULT_PCT}%)"
  fi
fi

# ── Poller error count (last hour) ─────────────────────────────────
out ""
out "## Poller stderr"
out ""
POLLER_LOG="$HOME/.pm2/logs/solar-poller-error.log"
if [ -f "$POLLER_LOG" ]; then
  RECENT=$(find "$POLLER_LOG" -newermt "1 hour ago" -print0 2>/dev/null | xargs -0 -I{} tail -500 {})
  ERR_COUNT=$(echo "$RECENT" | grep -cE 'Failed to sync|HTTP 50[0-9]|ECONNREFUSED|ETIMEDOUT' || true)
  if [ -z "$ERR_COUNT" ] || ! [[ "$ERR_COUNT" =~ ^[0-9]+$ ]]; then ERR_COUNT=0; fi
  if [ "$ERR_COUNT" -eq 0 ]; then
    out "- ${GREEN}clean${NC}: 0 provider-sync failures in the last hour"
  elif [ "$ERR_COUNT" -lt 10 ]; then
    out "- ${YELLOW}${ERR_COUNT} provider-sync failure(s)${NC} in the last hour"
    WARNINGS=$((WARNINGS + 1))
  else
    out "- ${RED}${ERR_COUNT} provider-sync failure(s)${NC} in the last hour — provider API likely down"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────
out ""
out "## Summary"
out ""
out "- Errors: $ERRORS · Warnings: $WARNINGS"
out ""

if [ "$ERRORS" -gt 0 ]; then
  echo "CONTINUOUS AUDIT: $ERRORS error(s) — see $REPORT"
  exit 2
elif [ "$WARNINGS" -gt 0 ]; then
  echo "CONTINUOUS AUDIT: $WARNINGS warning(s) — see $REPORT"
  exit 0
else
  echo "CONTINUOUS AUDIT: clean — $REPORT"
  exit 0
fi
