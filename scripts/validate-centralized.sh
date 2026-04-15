#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# validate-centralized.sh — Build-time enforcement for centralized patterns
#
# Fails the build if ANY file outside lib/string-health.ts contains inline
# string health thresholds. Run as part of "npm run build" or CI.
#
# Usage: bash scripts/validate-centralized.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
ERRORS=0

echo "━━━ Validating centralized string health patterns ━━━"
echo ""

# ── Check 1: No inline active current threshold (0.1) in server code ────────
# Allowed: lib/string-health.ts, comments, node_modules, .next
VIOLATIONS=$(grep -rn "> 0\.1\|< 0\.1\|>= 0\.1\|<= 0\.1" \
  lib/ app/api/ \
  --include="*.ts" \
  | grep -v "string-health\.ts" \
  | grep -v "node_modules" \
  | grep -v "\.next/" \
  | grep -v "api-validation" \
  | grep -v "dtHours\|Decimal\|toFixed" \
  | grep -v "^[^:]*:[^:]*://\|^[^:]*:[^:]*:\s*//" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}FAIL: Inline 0.1 threshold found outside string-health.ts${NC}"
  echo "$VIOLATIONS"
  echo ""
  echo "  Fix: Import ACTIVE_CURRENT_THRESHOLD from '@/lib/string-health'"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: No inline 0.1 thresholds${NC}"
fi

# ── Check 2: No inline gap thresholds (50/25/10) in classification ──────────
VIOLATIONS2=$(grep -rn "gapPercent\|gap_percent\|gapPct" \
  lib/ app/api/ \
  --include="*.ts" \
  | grep -E "> (50|25|10)\b|>= (50|25|10)\b" \
  | grep -v "string-health\.ts" \
  | grep -v "node_modules" \
  | grep -v "\.next/" \
  || true)

if [ -n "$VIOLATIONS2" ]; then
  echo -e "${RED}FAIL: Inline gap threshold found outside string-health.ts${NC}"
  echo "$VIOLATIONS2"
  echo ""
  echo "  Fix: Import GAP_CRITICAL/GAP_WARNING/GAP_INFO from '@/lib/string-health'"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: No inline gap thresholds${NC}"
fi

# ── Check 3: No inline health score buckets (90/75/50) ──────────────────────
VIOLATIONS3=$(grep -rn "health_score\|healthScore\|avg_health_score" \
  lib/ app/api/ components/ \
  --include="*.ts" --include="*.tsx" \
  | grep -E ">= (90|75|50)\b|< (90|75|50)\b" \
  | grep -v "string-health\.ts" \
  | grep -v "node_modules" \
  | grep -v "\.next/" \
  | grep -v "HEALTH_HEALTHY\|HEALTH_WARNING" \
  || true)

if [ -n "$VIOLATIONS3" ]; then
  echo -e "${RED}FAIL: Inline health bucket threshold found outside string-health.ts${NC}"
  echo "$VIOLATIONS3"
  echo ""
  echo "  Fix: Import HEALTH_HEALTHY/HEALTH_WARNING from '@/lib/string-health'"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: No inline health bucket thresholds${NC}"
fi

# ── Check 4: string-health.ts must exist ────────────────────────────────────
if [ ! -f "lib/string-health.ts" ]; then
  echo -e "${RED}FAIL: lib/string-health.ts is missing!${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: lib/string-health.ts exists${NC}"
fi

# ── Check 5: Key exports must be present ────────────────────────────────────
REQUIRED_EXPORTS="ACTIVE_CURRENT_THRESHOLD GAP_CRITICAL GAP_WARNING GAP_INFO HEALTH_HEALTHY HEALTH_WARNING STALE_MS isActive isStale classifyRealtime classifyAlertSeverity bucketHealthScore computePerformance computeAvailability computeHealthScore filterActive leaveOneOutAvg activeAvg"

MISSING=""
for export in $REQUIRED_EXPORTS; do
  if ! grep -q "export.*$export" lib/string-health.ts; then
    MISSING="$MISSING $export"
  fi
done

if [ -n "$MISSING" ]; then
  echo -e "${RED}FAIL: Missing exports in string-health.ts:${MISSING}${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: All required exports present in string-health.ts${NC}"
fi

# ── Check 6: No duplicate StringStatus type definitions ─────────────────────
VIOLATIONS6=$(grep -rn "'NORMAL' | 'WARNING' | 'CRITICAL' | 'OPEN_CIRCUIT' | 'DISCONNECTED'" \
  lib/ app/ components/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "string-health\.ts" \
  | grep -v "node_modules" \
  | grep -v "import.*StringStatus" \
  || true)

if [ -n "$VIOLATIONS6" ]; then
  echo -e "${RED}FAIL: Duplicate StringStatus type found outside string-health.ts${NC}"
  echo "$VIOLATIONS6"
  echo ""
  echo "  Fix: Import { type StringStatus } from '@/lib/string-health'"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS: No duplicate StringStatus type definitions${NC}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}━━━ VALIDATION FAILED: $ERRORS error(s) ━━━${NC}"
  echo ""
  echo "All string health thresholds must be in lib/string-health.ts"
  echo "See CLAUDE.md > 'String Health Classification Rules'"
  exit 1
else
  echo -e "${GREEN}━━━ VALIDATION PASSED: All centralized patterns enforced ━━━${NC}"
fi
