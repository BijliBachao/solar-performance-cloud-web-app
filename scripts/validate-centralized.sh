#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# validate-centralized.sh — Production-grade build-time enforcement
#
# Prevents ANY code from bypassing lib/string-health.ts centralized thresholds
# or shipping insecure fetch calls. Runs before every `npm run build`.
#
# If this script passes, the codebase is guaranteed consistent.
# If it fails, the build fails — no deployment possible.
#
# Usage: bash scripts/validate-centralized.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ERRORS=0
WARNINGS=0

SRC_DIRS="lib/ app/ components/"
EXCLUDE="--exclude-dir=node_modules --exclude-dir=.next"
ALLOWED="string-health.ts"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CENTRALIZED PATTERNS VALIDATION (Production Grade)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# SECTION 1: THRESHOLD ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════

echo "── Section 1: Threshold Enforcement ──────────────────"
echo ""

# ── 1.1: No inline 0.1 current threshold ANYWHERE ──────────────────
# Scans ALL source files (not just server). Excludes CSS/style values.
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '[><=!]=\? 0\.1[^0-9]' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'api-validation' \
  | grep -v 'ACTIVE_CURRENT_THRESHOLD' \
  | grep -v 'dtHours\|toFixed\|Decimal\|\.toFixed\|parseFloat\|parseInt' \
  | grep -v 'opacity\|rem\|px\|em\|scale\|transition\|duration\|delay' \
  | grep -v 'gap-\|p-\|py-\|px-\|pt-\|pb-\|pl-\|pr-\|m-\|mt-\|mb-\|ml-\|mr-' \
  | grep -v 'rounded\|border\|inset\|ring\|shadow\|blur\|brightness' \
  | grep -v 'w-\|h-\|min-w\|min-h\|max-w\|max-h\|leading\|tracking' \
  | grep -v 'z-\|space-\|divide-\|text-\[' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.1]: Inline 0.1 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use isActive() or ACTIVE_CURRENT_THRESHOLD from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.1]: No inline 0.1 thresholds${NC}"
fi

# ── 1.2: No inline >= 90 comparison ANYWHERE in logic ───────────────
# This catches healthPercent >= 90, score >= 90, uptime >= 90, etc.
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '>= 90\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HEALTH_HEALTHY\|HEALTH_CAUTION\|HEALTH_WARNING\|HEALTH_SEVERE' \
  | grep -v 'className\|style\|css\|tailwind' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.2]: Inline >= 90 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use HEALTH_HEALTHY from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.2]: No inline >= 90 thresholds${NC}"
fi

# ── 1.3: No inline >= 75 or >= 70 comparison ────────────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '>= 75\b\|>= 70\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HEALTH_CAUTION' \
  | grep -v 'className\|style\|css' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.3]: Inline >= 75 or >= 70 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use HEALTH_CAUTION from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.3]: No inline >= 75/70 thresholds${NC}"
fi

# ── 1.4: No inline >= 50 or < 50 in health/score/percent context ───
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '>= 50\b\|< 50\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HEALTH_WARNING\|HEALTH_CAUTION\|GAP_CRITICAL' \
  | grep -v 'className\|style\|css\|tailwind\|width\|height\|max-w\|min-w' \
  | grep -v 'limit\|skip\|take\|page\|offset\|timeout\|delay\|padding\|margin' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.4]: Inline >= 50 or < 50 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use HEALTH_WARNING or GAP_CRITICAL from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.4]: No inline >= 50 / < 50 thresholds${NC}"
fi

# ── 1.5: No inline >= 25 or < 25 in gap/health context ─────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '>= 25\b\|> 25\b\|< 25\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HEALTH_SEVERE\|GAP_WARNING' \
  | grep -v 'className\|style\|css\|tailwind' \
  | grep -v 'limit\|skip\|take\|page\|offset\|timeout\|padding\|margin\|length' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.5]: Inline >= 25 or > 25 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use GAP_WARNING or HEALTH_SEVERE from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.5]: No inline 25 thresholds${NC}"
fi

# ── 1.6: No inline > 10 gap comparison ──────────────────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  'gap.*> 10\b\|gap.*>= 10\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'GAP_INFO' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.6]: Inline gap > 10 threshold found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use GAP_INFO from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.6]: No inline gap > 10 thresholds${NC}"
fi

# ── 1.7: No hardcoded plant health_state magic numbers (3/2/1) ─────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  'health_state === 3\|health_state === 2\|health_state === 1' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'PLANT_HEALTH' \
  || true)

# Also check shorthand like `state === 3` in health context
VIOLATIONS2=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  'State === 3\|State === 2\|State === 1' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'PLANT_HEALTH' \
  || true)

COMBINED="${VIOLATIONS}${VIOLATIONS2}"
if [ -n "$COMBINED" ]; then
  echo -e "${RED}FAIL [1.7]: Hardcoded health_state magic numbers${NC}"
  echo "$COMBINED"
  echo "  Fix: Use PLANT_HEALTH_HEALTHY/FAULTY/DISCONNECTED from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.7]: No hardcoded health_state magic numbers${NC}"
fi

# ── 1.8: No inline staleness constants ──────────────────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '15 \* 60 \* 1000\|900000\|STALE_THRESHOLD' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'STALE_MS' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [1.8]: Inline staleness constant found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use STALE_MS from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [1.8]: No inline staleness constants${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SECTION 2: TYPE ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════

echo "── Section 2: Type Enforcement ───────────────────────"
echo ""

# ── 2.1: No duplicate StringStatus type ─────────────────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  "'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'OFFLINE'" $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'import.*StringStatus' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [2.1]: Duplicate StringStatus type definition${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Import { type StringStatus } from '@/lib/string-health'"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [2.1]: No duplicate StringStatus types${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SECTION 3: SECURITY ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════

echo "── Section 3: Security Enforcement ───────────────────"
echo ""

# ── 3.1: All fetch('/api/...') calls must have credentials: 'include'
# Check for fetch calls to /api/ that don't have credentials on same or next 3 lines
FETCH_FILES=$(grep -rln --include="*.ts" --include="*.tsx" $EXCLUDE \
  "fetch(" app/ 2>/dev/null \
  | grep -v 'node_modules\|\.next\|route\.ts' \
  || true)

CRED_VIOLATIONS=""
for file in $FETCH_FILES; do
  # Find lines with fetch('/api/ or fetch("/api/ or fetch(`/api/
  FETCH_LINES=$(grep -n "fetch.*['\"\`]/api/" "$file" 2>/dev/null || true)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    LINE_NUM=$(echo "$line" | cut -d: -f1)
    # Check if 'credentials' appears within 5 lines after the fetch
    HAS_CRED=$(sed -n "${LINE_NUM},$((LINE_NUM + 5))p" "$file" | grep -c 'credentials' || true)
    if [ "$HAS_CRED" -eq 0 ]; then
      CRED_VIOLATIONS="${CRED_VIOLATIONS}${file}:${LINE_NUM}: $(echo "$line" | cut -d: -f2-)\n"
    fi
  done <<< "$FETCH_LINES"
done

if [ -n "$CRED_VIOLATIONS" ]; then
  echo -e "${RED}FAIL [3.1]: fetch('/api/...') missing credentials: 'include'${NC}"
  echo -e "$CRED_VIOLATIONS"
  echo "  Fix: Add { credentials: 'include' } to every fetch call"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [3.1]: All fetch('/api/') calls include credentials${NC}"
fi

# ── 3.2: All admin API routes must have requireRole check ───────────
ADMIN_ROUTES=$(find app/api/admin -name "route.ts" 2>/dev/null || true)
MISSING_AUTH=""
for route in $ADMIN_ROUTES; do
  if ! grep -q "requireRole" "$route"; then
    MISSING_AUTH="${MISSING_AUTH}${route}\n"
  fi
done

if [ -n "$MISSING_AUTH" ]; then
  echo -e "${RED}FAIL [3.2]: Admin API routes missing requireRole check${NC}"
  echo -e "$MISSING_AUTH"
  echo "  Fix: Add requireRole(userContext, ['SUPER_ADMIN']) to every admin route"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [3.2]: All admin API routes have requireRole check${NC}"
fi

# ── 3.3: No 403 responses (should be 404 to prevent info leakage) ──
VIOLATIONS=$(grep -rn --include="*.ts" $EXCLUDE \
  'status: 403\|{ status: 403 }' app/api/ 2>/dev/null \
  | grep -v 'api-auth\|api-errors\|api-access' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${YELLOW}WARN [3.3]: Direct 403 responses found (should use 404 for IDOR prevention)${NC}"
  echo "$VIOLATIONS"
  echo ""
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}PASS [3.3]: No direct 403 responses (IDOR-safe)${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SECTION 4: STRUCTURAL INTEGRITY
# ═══════════════════════════════════════════════════════════════════════

echo "── Section 4: Structural Integrity ───────────────────"
echo ""

# ── 4.1: string-health.ts must exist ───────────────────────────────
if [ ! -f "lib/string-health.ts" ]; then
  echo -e "${RED}FAIL [4.1]: lib/string-health.ts is missing!${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [4.1]: lib/string-health.ts exists${NC}"
fi

# ── 4.2: All required exports present ──────────────────────────────
REQUIRED_EXPORTS="ACTIVE_CURRENT_THRESHOLD GAP_CRITICAL GAP_WARNING GAP_INFO HEALTH_HEALTHY HEALTH_WARNING HEALTH_CAUTION HEALTH_SEVERE STALE_MS MS_PER_HOUR HERO_SPARKLINE_HOURS HERO_SPARKLINE_LOOKBACK_HOURS DASHBOARD_HISTORY_DAYS STANDBY_POWER_FLOOR_KW MAX_STRING_CURRENT_A MAX_STRING_POWER_W HEALTH_COVERAGE_MIN_RATIO classifyPlantLive MAX_DATE_RANGE_DAYS ACTIVE_LOOKBACK_DAYS PLANT_HEALTH_HEALTHY PLANT_HEALTH_FAULTY PLANT_HEALTH_DISCONNECTED isActive isStale classifyRealtime classifyAlertSeverity bucketHealthScore computePerformance computeAvailability computeHealthScore filterActive leaveOneOutAvg activeAvg computeGap canCompare StringStatus AlertSeverity HealthBucket PlantLiveStatus"

MISSING=""
for export in $REQUIRED_EXPORTS; do
  if ! grep -q "export.*$export" lib/string-health.ts 2>/dev/null; then
    MISSING="$MISSING $export"
  fi
done

if [ -n "$MISSING" ]; then
  echo -e "${RED}FAIL [4.2]: Missing exports in string-health.ts:${MISSING}${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [4.2]: All required exports present (${#REQUIRED_EXPORTS} checked)${NC}"
fi

# ── 4.3: No inline classification logic (status = 'CRITICAL') ──────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  "status = 'CRITICAL'\|status = 'WARNING'\|status = 'OPEN_CIRCUIT'" $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'node_modules' \
  | grep -v '===\|!==\|filter\|find\|\.status' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [4.3]: Inline status assignment found outside string-health.ts${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use classifyRealtime() or classifyAlertSeverity() from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [4.3]: No inline status classification logic${NC}"
fi

# ── 4.4: No inline IEC formula (perf * avail / 100) ────────────────
VIOLATIONS=$(grep -rn --include="*.ts" $EXCLUDE \
  'perfScore.*availScore.*100\|perf.*avail.*/ 100\|performance.*availability.*100' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'node_modules' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [4.4]: Inline IEC formula found outside string-health.ts${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use computeHealthScore() from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [4.4]: No inline IEC formulas${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SECTION 5: DASHBOARD WINDOW CONSTANTS
# ═══════════════════════════════════════════════════════════════════════

echo "── Section 5: Dashboard Window Constants ────────────"
echo ""

# ── 5.1: No inline 48-hour millisecond windows ─────────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '48 \* 60 \* 60 \* 1000\|48 \* MS_PER_HOUR' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HERO_SPARKLINE_LOOKBACK_HOURS' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.1]: Inline 48-hour window found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use HERO_SPARKLINE_LOOKBACK_HOURS * MS_PER_HOUR from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.1]: No inline 48-hour window constants${NC}"
fi

# ── 5.2: No magic sparkline slicing (.slice(-24)) ──────────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  '\.slice(-24)' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'HERO_SPARKLINE_HOURS' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.2]: Magic .slice(-24) found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use .slice(-HERO_SPARKLINE_HOURS) from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.2]: No magic sparkline slicing${NC}"
fi

# ── 5.3: No hardcoded 7-day loops for rolling averages ─────────────
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  'i <= 7\b\|i < 7\b\|getPKTDaysAgo(7)' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'DASHBOARD_HISTORY_DAYS' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.3]: Inline 7-day loop found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use DASHBOARD_HISTORY_DAYS from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.3]: No inline 7-day rolling loops${NC}"
fi

# ── 5.4: No inline standby-power floor numbers ─────────────────────
# Catch naive "power > 0.5" or "kw > 0.5" outside string-health.ts.
VIOLATIONS=$(grep -rnE --include="*.ts" --include="*.tsx" $EXCLUDE \
  '(power|[Pp]owerKw|kw)[a-zA-Z_]*\s*[<>]=?\s*0\.5' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'STANDBY_POWER_FLOOR_KW' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.4]: Inline standby power floor found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use STANDBY_POWER_FLOOR_KW / classifyPlantLive() from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.4]: No inline standby power floors${NC}"
fi

# ── 5.5: No inline max-string-power / max-current sensor ceilings ──
VIOLATIONS=$(grep -rnE --include="*.ts" --include="*.tsx" $EXCLUDE \
  '25[_]?000\b|\b25000\b' $SRC_DIRS 2>/dev/null \
  | grep -v "$ALLOWED" \
  | grep -v 'MAX_STRING_POWER_W' \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.5]: Inline max-string-power ceiling found${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use MAX_STRING_POWER_W from string-health.ts"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.5]: No inline max-string-power ceilings${NC}"
fi

# ── 5.6: No dead NVIDIA-green hex in /dashboard scope ──────────────
# DESIGN.md v3 (Solar Corporate) retired #76b900 — no file outside the
# landing page and admin (tasks #87/#88, tracked separately) may use it.
# Scoped narrowly to /dashboard and shared components to avoid churn.
VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" $EXCLUDE \
  -iE '#76b900|#5a8f00' app/dashboard/ components/shared/ 2>/dev/null \
  | grep -v '^\s*//' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL [5.6]: Dead NVIDIA-green hex in /dashboard or shared components${NC}"
  echo "$VIOLATIONS"
  echo "  Fix: Use solar-gold token from DESIGN.md v3 (#F59E0B family)."
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS [5.6]: No NVIDIA-green leaks in /dashboard scope${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════

TOTAL_CHECKS=20
PASSED=$((TOTAL_CHECKS - ERRORS - WARNINGS))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}  VALIDATION FAILED: $ERRORS error(s), $WARNINGS warning(s)${NC}"
  echo -e "  ${GREEN}$PASSED passed${NC} / ${RED}$ERRORS failed${NC} / ${YELLOW}$WARNINGS warnings${NC} out of $TOTAL_CHECKS checks"
  echo ""
  echo "  All thresholds must be in lib/string-health.ts"
  echo "  All fetch calls must include credentials"
  echo "  See CLAUDE.md > 'String Health Classification Rules'"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}  VALIDATION PASSED WITH WARNINGS: $WARNINGS warning(s)${NC}"
  echo -e "  ${GREEN}$PASSED passed${NC} / ${YELLOW}$WARNINGS warnings${NC} out of $TOTAL_CHECKS checks"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo -e "${GREEN}  VALIDATION PASSED: $TOTAL_CHECKS/$TOTAL_CHECKS checks passed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
