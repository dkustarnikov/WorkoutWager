#!/usr/bin/env bash
# WorkoutWager integration test suite
# Usage:
#   ./scripts/integration-test.sh
#   BASE_URL=https://... AUTH_TOKEN=eyJ... ./scripts/integration-test.sh
#
# Reads defaults from bruno/environments/dev.bru if env vars not set.

set -euo pipefail

# ── colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); }
section() { echo -e "\n${CYAN}── $1 ──${NC}"; }

# ── read Bruno dev env as defaults ──────────────────────────────────────────
BRUNO_ENV="$(dirname "$0")/../bruno/environments/dev.bru"

read_bru_var() {
  grep -E "^  $1:" "$BRUNO_ENV" | sed "s/  $1: //" | tr -d '\r'
}

BASE_URL="${BASE_URL:-$(read_bru_var baseUrl)}"
AUTH_TOKEN="${AUTH_TOKEN:-$(read_bru_var authToken)}"
USER_ID="${USER_ID:-$(read_bru_var userId)}"
COGNITO_URL="${COGNITO_URL:-$(read_bru_var cognitoUrl)}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-$(read_bru_var cognitoClientId)}"

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

echo -e "${CYAN}WorkoutWager Integration Tests${NC}"
echo    "  Base URL : $BASE_URL"
echo    "  User ID  : $USER_ID"

# ── helpers ──────────────────────────────────────────────────────────────────
auth_header() { echo "Authorization: Bearer $AUTH_TOKEN"; }

get() {
  curl -s -o /tmp/ww_resp.json -w "%{http_code}" \
    -H "$(auth_header)" \
    "$BASE_URL/$1"
}

post() {
  local path="$1"; shift
  curl -s -o /tmp/ww_resp.json -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    -d "$1" \
    "$BASE_URL/$path"
}

put() {
  local path="$1"; shift
  curl -s -o /tmp/ww_resp.json -w "%{http_code}" \
    -X PUT \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    -d "$1" \
    "$BASE_URL/$path"
}

delete() {
  curl -s -o /tmp/ww_resp.json -w "%{http_code}" \
    -X DELETE \
    -H "$(auth_header)" \
    "$BASE_URL/$1"
}

body() { cat /tmp/ww_resp.json; }
jq_val() { body | jq -r "$1" 2>/dev/null; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label (expected $expected, got $actual)"
    echo -e "    ${YELLOW}$(body)${NC}"
  fi
}

# ── 1. Health ─────────────────────────────────────────────────────────────────
section "Health"
status=$(curl -s -o /tmp/ww_resp.json -w "%{http_code}" "$BASE_URL/health")
assert_status "GET /health" "200" "$status"

# ── 2. User ───────────────────────────────────────────────────────────────────
section "User"

status=$(post "configure-user" "{\"userId\":\"$USER_ID\"}")
assert_status "POST /configure-user" "200" "$status"

status=$(post "get-user-info" "{\"userId\":\"$USER_ID\"}")
assert_status "POST /get-user-info" "200" "$status"

# ── 3. Goals ─────────────────────────────────────────────────────────────────
section "Goals"

status=$(get "goals")
assert_status "GET /goals" "200" "$status"

GOAL_PAYLOAD='{
  "userId": "'"$USER_ID"'",
  "goalType": "fitness",
  "goalName": "Integration Test Goal",
  "generalObjective": "Test goal created by integration script",
  "totalAmount": 100,
  "deadline": "2027-01-01T00:00:00.000Z",
  "milestones": [],
  "allOrNothing": false,
  "rewardDestination": "savings",
  "penaltyDestination": "savings",
  "penaltyInterestRate": 0
}'

status=$(post "goal" "$GOAL_PAYLOAD")
assert_status "POST /goal" "201" "$status"
GOAL_ID=$(jq_val '.goalId')
MILESTONE_ID=$(jq_val '.milestones[0].milestoneId')
echo    "    goalId      : $GOAL_ID"
echo    "    milestoneId : $MILESTONE_ID"

status=$(get "goal/$GOAL_ID")
assert_status "GET /goal/{goalId}" "200" "$status"

UPDATE_PAYLOAD='{
  "userId": "'"$USER_ID"'",
  "goalType": "fitness",
  "goalName": "Integration Test Goal - Updated",
  "generalObjective": "Updated by integration script",
  "totalAmount": 150,
  "deadline": "2027-07-01T00:00:00.000Z",
  "milestones": [
    {
      "milestoneName": "Halfway Check-In",
      "type": "fitness",
      "completion": false,
      "milestoneDeadline": "2027-04-01T00:00:00.000Z",
      "monetaryValue": 75
    },
    {
      "milestoneName": "Final Run",
      "type": "fitness",
      "completion": false,
      "milestoneDeadline": "2027-07-01T00:00:00.000Z",
      "monetaryValue": 75
    }
  ],
  "allOrNothing": false,
  "rewardDestination": "savings",
  "penaltyDestination": "savings",
  "penaltyInterestRate": 10
}'

status=$(put "goal/$GOAL_ID" "$UPDATE_PAYLOAD")
assert_status "PUT /goal/{goalId}" "200" "$status"
MILESTONE_ID=$(jq_val '.milestones[0].milestoneId')

# ── 4. Milestones ─────────────────────────────────────────────────────────────
section "Milestones"

ADD_MILESTONE_PAYLOAD='{
  "milestone": {
    "milestoneName": "Bonus Checkpoint",
    "type": "fitness",
    "completion": false,
    "milestoneDeadline": "2027-03-15T00:00:00.000Z",
    "monetaryValue": 50
  }
}'

status=$(post "goal/$GOAL_ID/milestone" "$ADD_MILESTONE_PAYLOAD")
assert_status "POST /goal/{goalId}/milestone" "200" "$status"
NEW_MILESTONE_ID=$(jq_val '.milestones | map(select(.milestoneName == "Bonus Checkpoint")) | .[0].milestoneId')

UPDATE_MILESTONE_PAYLOAD='{
  "milestoneName": "Bonus Checkpoint - Updated",
  "type": "fitness",
  "completion": false,
  "milestoneDeadline": "2027-03-20T00:00:00.000Z",
  "monetaryValue": 60
}'

status=$(put "goal/$GOAL_ID/milestone/$NEW_MILESTONE_ID" "$UPDATE_MILESTONE_PAYLOAD")
assert_status "PUT /goal/{goalId}/milestone/{milestoneId}" "200" "$status"

status=$(post "goal/$GOAL_ID/milestone/$MILESTONE_ID/complete" "{}")
assert_status "POST /goal/{goalId}/milestone/{milestoneId}/complete" "200" "$status"

# ── 5. Transactions ───────────────────────────────────────────────────────────
section "Transactions"

status=$(get "goal/$GOAL_ID/transactions")
assert_status "GET /goal/{goalId}/transactions" "200" "$status"

# ── 6. Cleanup ────────────────────────────────────────────────────────────────
section "Cleanup"

status=$(delete "goal/$GOAL_ID")
assert_status "DELETE /goal/{goalId}" "200" "$status"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}────────────────────────────────${NC}"
TOTAL=$((PASS + FAIL))
echo -e "  ${GREEN}$PASS passed${NC} / ${RED}$FAIL failed${NC} / $TOTAL total"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}  TESTS FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}  ALL TESTS PASSED${NC}"
fi
