#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# audit-pre-deploy.sh — LOCAL gate run BEFORE pushing to main
#
# Purpose:
#   Block unsafe deploys at the operator's laptop, not at production.
#   Extends `npm run build` (which already runs TS + validator) with:
#     • git-diff risk flags for high-blast-radius files
#     • bundle-size delta vs previous build
#     • summary report written to ./audits/YYYY-MM-DD/HHMM-pre.md
#
# Usage:
#   bash scripts/audit-pre-deploy.sh
#   exit 0 = safe to deploy; exit 1 = stop
# ═══════════════════════════════════════════════════════════════════════

set -u  # fail on undefined vars, but let individual checks tally failures

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TS=$(date -u +'%Y-%m-%d %H:%M:%S UTC')
DAY=$(date -u +'%Y-%m-%d')
HHMM=$(date -u +'%H%M')
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

AUDITS_DIR="$REPO_ROOT/audits/$DAY"
mkdir -p "$AUDITS_DIR"
REPORT="$AUDITS_DIR/$HHMM-pre.md"

ERRORS=0
WARNINGS=0

# Every check writes to both stdout and the report; report is markdown.
say_stdout() { echo -e "$1"; }
report() { echo "$1" >> "$REPORT"; }
both() { say_stdout "$1"; report "$1"; }

# ── Header ───────────────────────────────────────────────────────────
both "# Pre-deploy audit · $TS"
report ""
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
report "**HEAD:** \`$GIT_HEAD\` · **branch:** \`$GIT_BRANCH\`"
report ""

both ""
both "── Check 1: TypeScript compile ──────────────────────"
if npx tsc --noEmit 2>/tmp/pre-audit-tsc.log; then
  both "${GREEN}PASS${NC}: tsc --noEmit clean"
  report "- PASS: tsc --noEmit clean"
else
  both "${RED}FAIL${NC}: TypeScript errors (see /tmp/pre-audit-tsc.log)"
  report "- FAIL: TypeScript errors"
  report '```'
  report "$(head -50 /tmp/pre-audit-tsc.log)"
  report '```'
  ERRORS=$((ERRORS + 1))
fi

both ""
both "── Check 2: Centralisation validator ───────────────"
if bash scripts/validate-centralized.sh > /tmp/pre-audit-val.log 2>&1; then
  # Pull the summary line, strip colour codes
  SUMMARY=$(grep -E 'VALIDATION (PASSED|FAILED)' /tmp/pre-audit-val.log | sed 's/\x1b\[[0-9;]*m//g' | head -1)
  both "${GREEN}PASS${NC}: $SUMMARY"
  report "- PASS: $SUMMARY"
else
  both "${RED}FAIL${NC}: validator failed"
  report "- FAIL: validator failed"
  report '```'
  report "$(tail -30 /tmp/pre-audit-val.log | sed 's/\x1b\[[0-9;]*m//g')"
  report '```'
  ERRORS=$((ERRORS + 1))
fi

both ""
both "── Check 3: High-blast-radius file diff ────────────"
# Files that deserve a second human pair of eyes when touched.
RISK_PATTERNS=(
  'lib/poller-utils.ts'
  'lib/string-health.ts'
  'lib/api-auth.ts'
  'lib/api-access.ts'
  'middleware.ts'
  'prisma/schema.prisma'
  'next.config.js'
  'scripts/run-poller.ts'
  'scripts/validate-centralized.sh'
  'app/api/webhooks/'
)

# What's in HEAD that origin/main doesn't have yet?
CHANGED=$(git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")

if [ -z "$CHANGED" ]; then
  both "${YELLOW}INFO${NC}: no unpushed changes detected (nothing to audit)"
  report "- INFO: no unpushed changes"
else
  report ""
  report "**Unpushed files:**"
  echo "$CHANGED" | while read -r f; do report "- \`$f\`"; done
  report ""

  RISKY=""
  for p in "${RISK_PATTERNS[@]}"; do
    if echo "$CHANGED" | grep -qE "^$p"; then
      RISKY="$RISKY$p "
    fi
  done

  if [ -n "$RISKY" ]; then
    both "${YELLOW}WARN${NC}: touched high-blast-radius files: $RISKY"
    report "- WARN: touched risk files → $RISKY"
    WARNINGS=$((WARNINGS + 1))
  else
    both "${GREEN}PASS${NC}: no risk-file changes in this diff"
    report "- PASS: no risk-file changes"
  fi
fi

both ""
both "── Check 4: Bundle size delta ──────────────────────"
# Only meaningful if a .next build exists locally. Skip silently otherwise
# (the post-deploy step on EC2 does the real size check).
if [ -d ".next" ]; then
  CUR_SIZE=$(du -sb .next 2>/dev/null | awk '{print $1}')
  PREV_FILE="$REPO_ROOT/.audit-prev-bundle.txt"
  PREV_SIZE=0
  if [ -f "$PREV_FILE" ]; then
    PREV_SIZE=$(cat "$PREV_FILE" 2>/dev/null || echo 0)
  fi

  CUR_MB=$(echo "scale=2; $CUR_SIZE / 1048576" | bc 2>/dev/null || echo "n/a")
  if [ "$PREV_SIZE" -gt 0 ]; then
    DELTA=$((CUR_SIZE - PREV_SIZE))
    DELTA_MB=$(echo "scale=2; $DELTA / 1048576" | bc 2>/dev/null || echo "n/a")
    SIGN=$([ "$DELTA" -ge 0 ] && echo "+" || echo "")
    both "INFO: .next = ${CUR_MB} MB (${SIGN}${DELTA_MB} MB vs last build)"
    report "- INFO: .next = ${CUR_MB} MB (${SIGN}${DELTA_MB} MB vs last build)"
  else
    both "INFO: .next = ${CUR_MB} MB (no baseline, tracking from here)"
    report "- INFO: .next = ${CUR_MB} MB (baseline set)"
  fi
  echo "$CUR_SIZE" > "$PREV_FILE"
else
  both "${YELLOW}INFO${NC}: no local .next build — skipping bundle delta"
  report "- INFO: no local .next build"
fi

both ""
both "── Check 5: uncommitted changes ────────────────────"
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
  both "${YELLOW}WARN${NC}: $UNCOMMITTED uncommitted file(s) — commit before pushing"
  report "- WARN: $UNCOMMITTED uncommitted file(s)"
  WARNINGS=$((WARNINGS + 1))
else
  both "${GREEN}PASS${NC}: working tree clean"
  report "- PASS: working tree clean"
fi

both ""
both "── Check 6: Dependency resolution (if package.json changed) ──"
# Added after the 2026-04-22 outage: @clerk/nextjs upgrade shifted peer-dep
# resolution; EC2's Next build auto-ran `npm install @types/react` WITHOUT
# --legacy-peer-deps and bailed on a react@19 vs @types/react@^18 conflict.
# That 502 could have been caught here by running a real clean install.
if echo "$CHANGED" | grep -qE '^package(-lock)?\.json$'; then
  report ""
  report "package.json or package-lock.json changed — running clean install in a tmpdir"
  TMPDIR=$(mktemp -d -t spc-dep-check-XXXXXX)
  cp package.json package-lock.json "$TMPDIR/" 2>/dev/null
  (cd "$TMPDIR" && npm ci --legacy-peer-deps --no-audit --no-fund --dry-run > /tmp/pre-audit-npmci.log 2>&1)
  NPMCI_EXIT=$?
  # Also check @types/react vs react major alignment — the specific trap
  REACT_MAJOR=$(node -p "require('./package.json').dependencies?.react?.match(/\d+/)?.[0] || 'n/a'" 2>/dev/null)
  TYPES_MAJOR=$(node -p "require('./package.json').devDependencies?.['@types/react']?.match(/\d+/)?.[0] || 'n/a'" 2>/dev/null)
  if [ "$REACT_MAJOR" != "n/a" ] && [ "$TYPES_MAJOR" != "n/a" ] && [ "$REACT_MAJOR" != "$TYPES_MAJOR" ]; then
    both "${RED}FAIL${NC}: react@$REACT_MAJOR vs @types/react@$TYPES_MAJOR — major-version mismatch"
    report "- FAIL: react major $REACT_MAJOR ≠ @types/react major $TYPES_MAJOR"
    ERRORS=$((ERRORS + 1))
  elif [ "$NPMCI_EXIT" -ne 0 ]; then
    both "${RED}FAIL${NC}: npm ci --dry-run exited $NPMCI_EXIT (peer-dep or other resolution error)"
    report "- FAIL: npm ci dry-run failed"
    report '```'
    report "$(tail -25 /tmp/pre-audit-npmci.log)"
    report '```'
    ERRORS=$((ERRORS + 1))
  else
    both "${GREEN}PASS${NC}: clean install resolves (react@$REACT_MAJOR aligned with @types/react@$TYPES_MAJOR)"
    report "- PASS: clean install resolves; types aligned"
  fi
  rm -rf "$TMPDIR"
else
  both "${GREEN}PASS${NC}: no dependency changes in this diff"
  report "- PASS: no dep changes"
fi

both ""
both "── Summary ─────────────────────────────────────────"
PASSED=$((6 - ERRORS - WARNINGS))
report ""
report "## Summary"
report ""
report "- Checks run: 6"
report "- Passed: $PASSED"
report "- Warnings: $WARNINGS"
report "- Errors: $ERRORS"
report ""

if [ "$ERRORS" -gt 0 ]; then
  both "${RED}DEPLOY BLOCKED${NC}: $ERRORS error(s), $WARNINGS warning(s)"
  report "**VERDICT:** DEPLOY BLOCKED"
  echo ""
  echo "Report: $REPORT"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  both "${YELLOW}DEPLOY WITH CAUTION${NC}: $WARNINGS warning(s)"
  report "**VERDICT:** DEPLOY WITH CAUTION (warnings only)"
  echo ""
  echo "Report: $REPORT"
  exit 0
else
  both "${GREEN}READY TO DEPLOY${NC}: all checks green"
  report "**VERDICT:** READY TO DEPLOY"
  echo ""
  echo "Report: $REPORT"
  exit 0
fi
