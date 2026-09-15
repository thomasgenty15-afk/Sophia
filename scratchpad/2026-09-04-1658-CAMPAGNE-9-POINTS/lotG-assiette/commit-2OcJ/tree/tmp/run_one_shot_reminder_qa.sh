#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:=http://127.0.0.1:54321}"
: "${SUPABASE_ANON_KEY:?missing SUPABASE_ANON_KEY}"
: "${SUPABASE_SERVICE_ROLE_KEY:?missing SUPABASE_SERVICE_ROLE_KEY}"
: "${QA_EMAIL:=qa-oneshot-reminder-r1@example.com}"
: "${QA_PASSWORD:=1234567}"
: "${QA_USER_ID:?missing QA_USER_ID}"
: "${QA_RUN_ID:=oneshotreminder-r1}"
: "${QA_SCOPE:=qa-one-shot-reminder-${QA_RUN_ID}}"
: "${QA_TURN:?missing QA_TURN}"
: "${QA_CONTENT:?missing QA_CONTENT}"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUN_DIR="$ROOT/tmp/one-shot-reminder-qa/$QA_RUN_ID"
mkdir -p "$RUN_DIR"
RAW_PATH="$RUN_DIR/raw.json"
SUMMARY_PATH="$RUN_DIR/summary.json"
DURABLE_PATH="$RUN_DIR/durable.json"
touch "$RAW_PATH" "$SUMMARY_PATH"
[ -s "$RAW_PATH" ] || printf '[]\n' > "$RAW_PATH"
[ -s "$SUMMARY_PATH" ] || printf '[]\n' > "$SUMMARY_PATH"

TOKEN_BODY="$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  --data "$(jq -nc --arg email "$QA_EMAIL" --arg password "$QA_PASSWORD" '{email:$email,password:$password}')")"
ACCESS_TOKEN="$(printf '%s' "$TOKEN_BODY" | jq -r '.access_token // empty')"
[ -n "$ACCESS_TOKEN" ] || {
  printf 'login failed: %s\n' "$(printf '%s' "$TOKEN_BODY" | jq -c '{error,error_description,msg}')" >&2
  exit 1
}

USER_STATUS="$(curl -sS -o "$RUN_DIR/auth-user-turn-$QA_TURN.json" -w '%{http_code}' \
  "$SUPABASE_URL/auth/v1/user" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $ACCESS_TOKEN")"
[ "$USER_STATUS" = "200" ] || {
  printf 'auth user verification failed: %s\n' "$USER_STATUS" >&2
  exit 1
}

HISTORY="$(jq '[.[-12:][] | select(.user != null and .assistant != null) | ({role:"user", content:.user}, {role:"assistant", content:.assistant})]' "$SUMMARY_PATH")"
REQUEST_ID="qa-one-shot-reminder-${QA_RUN_ID}-t$(printf '%02d' "$QA_TURN")"
BODY="$(jq -nc \
  --arg user_id "$QA_USER_ID" \
  --arg scope "$QA_SCOPE" \
  --arg content "$QA_CONTENT" \
  --argjson history "$HISTORY" \
  '{
    user_id: $user_id,
    channel: "web",
    scope: $scope,
    content: $content,
    history: $history,
    disable_debounce: true,
    force_full_ai: true
  }')"

HTTP_STATUS="$(curl -sS -o "$RUN_DIR/turn-$QA_TURN.response.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/functions/v1/test-send-message" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-user-authorization: Bearer $ACCESS_TOKEN" \
  -H "x-request-id: $REQUEST_ID" \
  -H "content-type: application/json" \
  --data "$BODY")"
RESPONSE_BODY="$(cat "$RUN_DIR/turn-$QA_TURN.response.json")"

jq --argjson item "$(jq -nc \
  --argjson turn "$QA_TURN" \
  --arg request_id "$REQUEST_ID" \
  --arg user "$QA_CONTENT" \
  --argjson status "$HTTP_STATUS" \
  --argjson body "$RESPONSE_BODY" \
  '{turn:$turn, request_id:$request_id, user:$user, status:$status, body:$body}')" \
  '. + [$item]' "$RAW_PATH" > "$RAW_PATH.tmp"
mv "$RAW_PATH.tmp" "$RAW_PATH"

ASSISTANT="$(printf '%s' "$RESPONSE_BODY" | jq -r '.response.content // .response.reply // .content // ""')"
jq --argjson item "$(printf '%s' "$RESPONSE_BODY" | jq -c \
  --argjson turn "$QA_TURN" \
  --arg request_id "$REQUEST_ID" \
  --arg user "$QA_CONTENT" \
  --argjson status "$HTTP_STATUS" \
  --arg assistant "$ASSISTANT" \
  '{
    turn: $turn,
    request_id: $request_id,
    status: $status,
    ok: (.ok // null),
    user: $user,
    assistant: $assistant,
    aborted: (.aborted // .response.aborted // false),
    abort_reason: (.abort_reason // .response.abort_reason // null),
    empty_response: (($assistant | length) == 0),
    response_tool_execution: (.response.tool_execution // null),
    response_executed_tools: (.response.executed_tools // []),
    response_owner: (.conversation_turn_trace.response_owner // .trace.response_owner // .conversation_turn_trace.route_decision.response_owner // null),
    selected_handler: (.conversation_turn_trace.route_decision.selected_handler // null),
    route_reason_code: (.conversation_turn_trace.route_decision.reason_code // null),
    safety_pregate: (.conversation_turn_trace.safety_pregate // null),
    direct_effects: (.conversation_turn_trace.direct_effects // .conversation_turn_trace.turn_frame.direct_effects // null),
    pending_tool_skill_confirmation: (.conversation_turn_trace.pending_tool_skill_confirmation // .conversation_turn_trace.turn_frame.pending_tool_skill_confirmation // null),
    tool_skill_run: (.conversation_turn_trace.tool_skill_run // null),
    memory_write_candidates_emitted: (.conversation_turn_trace.memory_write_candidates_emitted // null),
    trace_error: (.trace_error // null)
  }')" \
  '. + [$item]' "$SUMMARY_PATH" > "$SUMMARY_PATH.tmp"
mv "$SUMMARY_PATH.tmp" "$SUMMARY_PATH"

curl -sS "$SUPABASE_URL/rest/v1/scheduled_checkins?user_id=eq.$QA_USER_ID&select=id,status,scheduled_for,event_context,message_payload,created_at&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "accept: application/json" > "$DURABLE_PATH"

jq -n \
  --argjson summary "$(jq '.[-1]' "$SUMMARY_PATH")" \
  --argjson durable_count "$(jq 'length' "$DURABLE_PATH")" \
  --arg raw_path "$RAW_PATH" \
  --arg summary_path "$SUMMARY_PATH" \
  --arg durable_path "$DURABLE_PATH" \
  '{
    turn: $summary.turn,
    status: $summary.status,
    empty_response: $summary.empty_response,
    aborted: $summary.aborted,
    tool_execution: $summary.response_tool_execution,
    executed_tools: $summary.response_executed_tools,
    response_owner: $summary.response_owner,
    selected_handler: $summary.selected_handler,
    route_reason_code: $summary.route_reason_code,
    safety: $summary.safety_pregate,
    direct_effects: $summary.direct_effects,
    scheduled_checkins_for_user: $durable_count,
    assistant_preview: ($summary.assistant | gsub("\\s+";" ") | .[0:700]),
    raw_path: $raw_path,
    summary_path: $summary_path,
    durable_path: $durable_path
  }'
