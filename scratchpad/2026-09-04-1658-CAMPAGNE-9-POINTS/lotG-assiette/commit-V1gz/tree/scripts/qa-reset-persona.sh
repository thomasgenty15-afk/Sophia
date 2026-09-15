#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-}"
CONNECTION_NAME="${2:-}"
[ -n "$PERSONA" ] || {
  printf 'usage: scripts/qa-reset-persona.sh <persona> [connection_name]\n' >&2
  exit 2
}

# Whitelist: personas QA locales uniquement. Le 2e filet (is_test_persona=true
# dans auth metadata, verifie plus bas) reste obligatoire quoi qu'il arrive.
case "$PERSONA" in
  qa-skill|paul|eva|alex|rose|nina) ;;
  *)
    printf 'refusing reset: persona must be whitelisted, got %s\n' "$PERSONA" >&2
    exit 1
    ;;
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONNECTION="$ROOT/tests/real-personas/$PERSONA/connection.json"
if [ -n "$CONNECTION_NAME" ]; then
  case "$CONNECTION_NAME" in
    *[!A-Za-z0-9_-]*)
      printf 'invalid connection_name: %s\n' "$CONNECTION_NAME" >&2
      exit 2
      ;;
  esac
  CONNECTION="$ROOT/tests/real-personas/$PERSONA/connections/$CONNECTION_NAME.json"
fi
[ -f "$CONNECTION" ] || {
  printf 'missing %s\n' "$CONNECTION" >&2
  exit 1
}

USER_ID="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.user_id || ""));' "$CONNECTION")"
[ -n "$USER_ID" ] || {
  printf 'missing user_id in %s\n' "$CONNECTION" >&2
  exit 1
}

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  STATUS_JSON="$(supabase status --output json 2>/dev/null || true)"
  if [ -n "$STATUS_JSON" ]; then
    SUPABASE_URL="${SUPABASE_URL:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).API_URL || ""))')}"
    SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).SERVICE_ROLE_KEY || JSON.parse(s).SECRET_KEY || ""))')}"
  fi
fi

[ -n "$SUPABASE_URL" ] || {
  printf 'missing SUPABASE_URL and no local supabase status\n' >&2
  exit 1
}
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || {
  printf 'missing SUPABASE_SERVICE_ROLE_KEY and no local supabase status\n' >&2
  exit 1
}

USER_JSON="$(curl -sS "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
IS_TEST="$(printf '%s' "$USER_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const app=j.app_metadata||{}; const user=j.user_metadata||{}; process.stdout.write(String(app.is_test_persona === true || user.is_test_persona === true));})')"
[ "$IS_TEST" = "true" ] || {
  printf 'refusing reset: auth user is not marked is_test_persona=true\n' >&2
  exit 1
}

delete_table() {
  local table="$1"
  curl -sS -X DELETE "$SUPABASE_URL/rest/v1/$table?user_id=eq.$USER_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "prefer: return=minimal" >/dev/null
}

delete_table "memory_item_sources"
delete_table "memory_item_entities"
delete_table "memory_item_topics"
delete_table "memory_item_actions"
delete_table "memory_items"
delete_table "user_topic_memories"
delete_table "chat_messages"
delete_table "scheduled_checkins"

curl -sS -X PATCH "$SUPABASE_URL/rest/v1/user_chat_states?user_id=eq.$USER_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -H "prefer: return=minimal" \
  --data '{"current_mode":"companion","risk_level":0,"investigation_state":null,"short_term_context":"","unprocessed_msg_count":0,"temp_memory":{}}' >/dev/null

LOG="$ROOT/tests/real-personas/$PERSONA/reset-log.md"
printf -- '- %s reset persona=%s connection=%s user_id=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PERSONA" "${CONNECTION_NAME:-default}" "$USER_ID" >> "$LOG"
printf 'reset complete for %s connection=%s (%s)\n' "$PERSONA" "${CONNECTION_NAME:-default}" "$USER_ID"
