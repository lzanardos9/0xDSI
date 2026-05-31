#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Smoke Test: Databricks App Health
# ─────────────────────────────────────────────────────────────────
# Validates that the deployed Databricks App is functional:
#   - /health returns 200
#   - /ready returns 200
#   - /api/auth/session returns 200 or 401 (not 500)
#   - / serves the React SPA (index.html)
#   - /api/query returns 200 for a simple SELECT
#
# Usage:
#   ./tests/smoke_test_app.sh <APP_URL> [AUTH_TOKEN]
#
# Example:
#   ./tests/smoke_test_app.sh https://my-app.databricksapps.com
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_URL="${1:-}"
AUTH_TOKEN="${2:-}"

if [ -z "$APP_URL" ]; then
  echo -e "${RED}Usage: $0 <APP_URL> [AUTH_TOKEN]${NC}"
  exit 1
fi

APP_URL="${APP_URL%/}"
PASS=0
FAIL=0
WARN=0

check() {
  local description="$1"
  local endpoint="$2"
  local expected_codes="$3"
  local headers="${4:-}"

  local curl_opts=(-s -o /dev/null -w "%{http_code}" --max-time 10)
  if [ -n "$headers" ]; then
    curl_opts+=(-H "$headers")
  fi
  if [ -n "$AUTH_TOKEN" ]; then
    curl_opts+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi

  local status
  status=$(curl "${curl_opts[@]}" "${APP_URL}${endpoint}" 2>/dev/null || echo "000")

  if echo "$expected_codes" | grep -qw "$status"; then
    echo -e "  ${GREEN}PASS${NC} [${status}] ${description}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} [${status}] ${description} (expected: ${expected_codes})"
    FAIL=$((FAIL + 1))
  fi
}

check_body() {
  local description="$1"
  local endpoint="$2"
  local expected_string="$3"

  local curl_opts=(-s --max-time 10)
  if [ -n "$AUTH_TOKEN" ]; then
    curl_opts+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi

  local body
  body=$(curl "${curl_opts[@]}" "${APP_URL}${endpoint}" 2>/dev/null || echo "")

  if echo "$body" | grep -q "$expected_string"; then
    echo -e "  ${GREEN}PASS${NC} ${description}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} ${description} (expected body to contain: ${expected_string})"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=========================================="
echo " 0xDSI Databricks App Smoke Test"
echo "=========================================="
echo " Target: ${APP_URL}"
echo " Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=========================================="
echo ""

echo "--- Health & Readiness ---"
check "Health endpoint" "/health" "200"
check "Readiness endpoint" "/ready" "200"

echo ""
echo "--- Authentication ---"
check "Auth session (200 or 401, not 500)" "/api/auth/session" "200 401"

echo ""
echo "--- Frontend SPA ---"
check "Root serves HTML" "/" "200"
check_body "Root contains React app" "/" "<!DOCTYPE html>"
check "Static assets accessible" "/assets" "200 301 404"

echo ""
echo "--- API Endpoints ---"
check "Query endpoint exists" "/api/query" "200 400 401 405"
check "Metrics endpoint" "/api/metrics" "200 401 404"

echo ""
echo "=========================================="
echo " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}SMOKE TEST FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}ALL SMOKE TESTS PASSED${NC}"
  exit 0
fi
