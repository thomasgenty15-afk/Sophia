#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:-}"
TURN="${2:-}"
CONTENT="${3:-}"
CONNECTION_NAME="${CONNECTION_NAME:-all_skills_rfix1}"
[ -n "$RUN_ID" ] && [ -n "$TURN" ] && [ -n "$CONTENT" ] || {
  printf 'usage: %s <run_id> <turn> <content>\n' "$0" >&2
  exit 2
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONNECTION_FILE="$ROOT/tests/real-personas/qa-skill/connections/$CONNECTION_NAME.json"
JWT_FILE="/tmp/qa_skill_${CONNECTION_NAME}.jwt"
OUT="/tmp/qa_fullai_t${TURN}.json"
BODY="/tmp/qa_fullai_body_${TURN}.json"

[ -f "$CONNECTION_FILE" ] || {
  printf 'missing connection file\n' >&2
  exit 1
}
[ -f "$JWT_FILE" ] || {
  printf 'missing jwt file\n' >&2
  exit 1
}

USER_ID="$(
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.user_id||""));' "$CONNECTION_FILE"
)"
JWT="$(tr -d '\r\n' < "$JWT_FILE")"
export RUN_ID CONTENT USER_ID

node -e 'const fs=require("fs"); fs.writeFileSync(process.argv[1], JSON.stringify({
  user_id: process.env.USER_ID,
  channel: "web",
  scope: `qa-all-skills-navigation-2026-05-06-${process.env.RUN_ID}`,
  content: process.env.CONTENT,
  disable_debounce: true,
  force_full_ai: true,
}));' "$BODY"

HTTP_STATUS="$(
  curl -sS -w '%{http_code}' -o "$OUT" \
    -X POST 'http://127.0.0.1:54321/functions/v1/test-send-message' \
    -H "authorization: Bearer $JWT" \
    -H 'content-type: application/json' \
    -H "x-request-id: qa-all-skills-navigation-2026-05-06-${RUN_ID}-t${TURN}" \
    --data @"$BODY"
)"

node -e '
const fs = require("fs");
const status = process.argv[1];
const p = process.argv[2];
let body = {};
try { body = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
const trace = body.trace?.trace ?? body.trace ?? body.conversation_turn_trace ?? null;
const content = String(body.response?.content ?? body.content ?? "").replace(/\s+/g, " ").trim();
console.log(`http=${status}`);
console.log(`content=${content.slice(0, 900)}`);
console.log(`tool=${body.response?.tool_execution ?? body.tool_execution ?? "unknown"}`);
console.log(`executed_tools=${JSON.stringify(body.response?.executed_tools ?? body.executed_tools ?? [])}`);
console.log(`owner=${trace?.route_decision?.response_owner ?? trace?.response_owner ?? null}`);
console.log(`handler=${trace?.route_decision?.selected_handler ?? null}`);
console.log(`reason=${trace?.route_decision?.reason_code ?? null}`);
console.log(`safety=${trace?.safety_pregate?.risk_band ?? null}/${trace?.safety_pregate?.allow_side_effects ?? null}`);
' "$HTTP_STATUS" "$OUT"
