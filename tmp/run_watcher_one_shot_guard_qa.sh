#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUN_ID="${QA_RUN_ID:-watcher-oneshot-guard-$(date +%Y%m%d%H%M%S)}"
RUN_DIR="$ROOT/tmp/watcher-one-shot-qa/$RUN_ID"
mkdir -p "$RUN_DIR"

STATUS_JSON="$(/usr/local/bin/supabase status --output json)"
SUPABASE_URL="$(printf '%s' "$STATUS_JSON" | jq -r '.API_URL')"
ANON_KEY="$(printf '%s' "$STATUS_JSON" | jq -r '.ANON_KEY')"
SERVICE_ROLE_KEY="$(printf '%s' "$STATUS_JSON" | jq -r '.SERVICE_ROLE_KEY')"
INTERNAL_SECRET="$(awk -F= '/^INTERNAL_FUNCTION_SECRET=/{print $2}' "$ROOT/supabase/.env" | tail -n 1)"

EMAIL="qa-${RUN_ID}@example.com"
PASSWORD="1234567"
SCOPE="qa-watcher-one-shot-${RUN_ID}"

admin_create_body="$(jq -nc \
  --arg email "$EMAIL" \
  --arg password "$PASSWORD" \
  --arg run_id "$RUN_ID" \
  '{
    email: $email,
    password: $password,
    email_confirm: true,
    app_metadata: {
      is_test_persona: true,
      temporary_qa_connection: true,
      persona: "qa-watcher-one-shot",
      run_id: $run_id
    },
    user_metadata: {
      is_test_persona: true,
      temporary_qa_connection: true,
      timezone: "Europe/Paris"
    }
  }')"

create_status="$(curl -sS -o "$RUN_DIR/auth-create.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  --data "$admin_create_body")"
if [ "$create_status" != "200" ] && [ "$create_status" != "201" ]; then
  printf 'auth create failed: %s\n' "$create_status" >&2
  cat "$RUN_DIR/auth-create.json" >&2
  exit 1
fi
USER_ID="$(jq -r '.id' "$RUN_DIR/auth-create.json")"

login_body="$(jq -nc --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')"
login_status="$(curl -sS -o "$RUN_DIR/auth-login.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "content-type: application/json" \
  --data "$login_body")"
if [ "$login_status" != "200" ]; then
  printf 'login failed: %s\n' "$login_status" >&2
  cat "$RUN_DIR/auth-login.json" >&2
  exit 1
fi
ACCESS_TOKEN="$(jq -r '.access_token' "$RUN_DIR/auth-login.json")"

user_status="$(curl -sS -o "$RUN_DIR/auth-user.json" -w '%{http_code}' \
  "$SUPABASE_URL/auth/v1/user" \
  -H "apikey: $ANON_KEY" \
  -H "authorization: Bearer $ACCESS_TOKEN")"
if [ "$user_status" != "200" ]; then
  printf 'auth user verification failed: %s\n' "$user_status" >&2
  exit 1
fi

send_turn() {
  local turn="$1"
  local content="$2"
  local response_path="$RUN_DIR/turn-${turn}.response.json"
  local request_id="qa-watcher-one-shot-${RUN_ID}-t$(printf '%02d' "$turn")"
  local history='[]'
  if [ -s "$RUN_DIR/transcript.json" ]; then
    history="$(jq '[.[-12:][] | {role, content}]' "$RUN_DIR/transcript.json")"
  fi
  local body
  body="$(jq -nc \
    --arg user_id "$USER_ID" \
    --arg scope "$SCOPE" \
    --arg content "$content" \
    --argjson history "$history" \
    '{
      user_id: $user_id,
      channel: "web",
      scope: $scope,
      content: $content,
      history: $history,
      disable_debounce: true,
      force_full_ai: true
    }')"
  local status
  status="$(curl -sS -o "$response_path" -w '%{http_code}' \
    -X POST "$SUPABASE_URL/functions/v1/test-send-message" \
    -H "apikey: $ANON_KEY" \
    -H "authorization: Bearer $ANON_KEY" \
    -H "x-user-authorization: Bearer $ACCESS_TOKEN" \
    -H "x-request-id: $request_id" \
    -H "content-type: application/json" \
    --data "$body")"
  local assistant
  assistant="$(jq -r '.response.content // ""' "$response_path")"
  jq -n \
    --argjson turn "$turn" \
    --arg request_id "$request_id" \
    --arg user "$content" \
    --argjson status "$status" \
    --arg assistant "$assistant" \
    --slurpfile response "$response_path" \
    '{turn:$turn, request_id:$request_id, status:$status, user:$user, assistant:$assistant, response:$response[0]}' \
    > "$RUN_DIR/turn-${turn}.summary.json"
  if [ ! -s "$RUN_DIR/transcript.json" ]; then printf '[]\n' > "$RUN_DIR/transcript.json"; fi
  jq --arg user "$content" --arg assistant "$assistant" \
    '. + [{role:"user", content:$user}, {role:"assistant", content:$assistant}]' \
    "$RUN_DIR/transcript.json" > "$RUN_DIR/transcript.tmp"
  mv "$RUN_DIR/transcript.tmp" "$RUN_DIR/transcript.json"
  printf '%s\n' "$status"
}

turn1_status="$(send_turn 1 "Rappelle-moi demain à 9h10 de préparer le dossier client.")"
turn2_status="$(send_turn 2 "Demain matin, ce dossier client me stresse un peu ; il faut vraiment que je le prépare avant l'appel.")"

curl -sS "$SUPABASE_URL/rest/v1/scheduled_checkins?user_id=eq.$USER_ID&select=id,status,origin,scheduled_for,event_context,message_payload,created_at&order=created_at.asc" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "accept: application/json" > "$RUN_DIR/checkins-before-watcher.json"

now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
old_iso="1970-01-01T00:00:00Z"
state_body="$(jq -nc \
  --arg user_id "$USER_ID" \
  --arg scope "$SCOPE" \
  --arg now_iso "$now_iso" \
  --arg old_iso "$old_iso" \
  '{user_id:$user_id, scope:$scope, last_interaction_at:$now_iso, last_processed_at:$old_iso, temp_memory:{}}')"
curl -sS -o "$RUN_DIR/user-state-upsert.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/rest/v1/user_chat_states?on_conflict=user_id,scope" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -H "prefer: resolution=merge-duplicates,return=representation" \
  --data "$state_body" > "$RUN_DIR/user-state-upsert.status"

message_rows="$(jq -nc \
  --arg user_id "$USER_ID" \
  --arg scope "$SCOPE" \
  --argjson transcript "$(cat "$RUN_DIR/transcript.json")" \
  '$transcript | map({user_id:$user_id, scope:$scope, role:.role, content:.content})')"
curl -sS -o "$RUN_DIR/chat-messages-insert.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/rest/v1/chat_messages" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -H "prefer: return=representation" \
  --data "$message_rows" > "$RUN_DIR/chat-messages-insert.status"

trigger_status="$(curl -sS -o "$RUN_DIR/watcher-trigger.response.json" -w '%{http_code}' \
  -X POST "$SUPABASE_URL/functions/v1/trigger-watcher-batch" \
  -H "apikey: $ANON_KEY" \
  -H "authorization: Bearer $ANON_KEY" \
  -H "x-internal-secret: $INTERNAL_SECRET" \
  -H "x-request-id: qa-watcher-one-shot-${RUN_ID}-watcher" \
  -H "content-type: application/json" \
  --data '{"force_full_ai":true}')"

curl -sS "$SUPABASE_URL/rest/v1/scheduled_checkins?user_id=eq.$USER_ID&select=id,status,origin,scheduled_for,event_context,message_payload,created_at&order=created_at.asc" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "accept: application/json" > "$RUN_DIR/checkins-after-watcher.json"

jq -n \
  --arg run_id "$RUN_ID" \
  --arg user_id "$USER_ID" \
  --arg email "$EMAIL" \
  --argjson turn1_status "$turn1_status" \
  --argjson turn2_status "$turn2_status" \
  --argjson trigger_status "$trigger_status" \
  --arg run_dir "$RUN_DIR" \
  --slurpfile before "$RUN_DIR/checkins-before-watcher.json" \
  --slurpfile after "$RUN_DIR/checkins-after-watcher.json" \
  --slurpfile watcher "$RUN_DIR/watcher-trigger.response.json" \
  '{
    run_id:$run_id,
    user_id:$user_id,
    email:$email,
    turn_statuses: [$turn1_status,$turn2_status],
    watcher_status:$trigger_status,
    watcher_response:$watcher[0],
    before_count: ($before[0] | length),
    after_count: ($after[0] | length),
    before_watcher_count: ($before[0] | map(select(.origin == "watcher")) | length),
    after_watcher_count: ($after[0] | map(select(.origin == "watcher")) | length),
    one_shot_count_after: ($after[0] | map(select((.event_context // "") | startswith("one_shot_reminder:"))) | length),
    checkins_after: $after[0],
    run_dir:$run_dir
  }' | tee "$RUN_DIR/summary.json"
