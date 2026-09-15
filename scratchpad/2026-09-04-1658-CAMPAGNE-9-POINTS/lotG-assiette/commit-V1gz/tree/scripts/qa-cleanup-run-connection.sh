#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-}"
CONNECTION_NAME="${2:-}"
[ -n "$PERSONA" ] && [ -n "$CONNECTION_NAME" ] || {
  printf 'usage: scripts/qa-cleanup-run-connection.sh <persona> <connection_name>\n' >&2
  exit 2
}

case "$PERSONA" in
  qa-skill) ;;
  *)
    printf 'refusing cleanup: persona must be whitelisted, got %s\n' "$PERSONA" >&2
    exit 1
    ;;
esac

case "$CONNECTION_NAME" in
  *[!A-Za-z0-9_-]*)
    printf 'invalid connection_name: %s\n' "$CONNECTION_NAME" >&2
    exit 2
    ;;
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONNECTION_FILE="$ROOT/tests/real-personas/$PERSONA/connections/$CONNECTION_NAME.json"
[ -f "$CONNECTION_FILE" ] || {
  printf 'missing %s\n' "$CONNECTION_FILE" >&2
  exit 1
}

IS_TEMP="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.temporary === true));' "$CONNECTION_FILE")"
[ "$IS_TEMP" = "true" ] || {
  printf 'refusing cleanup: connection is not marked temporary=true\n' >&2
  exit 1
}

USER_ID="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.user_id || ""));' "$CONNECTION_FILE")"
[ -n "$USER_ID" ] || {
  printf 'missing user_id in %s\n' "$CONNECTION_FILE" >&2
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

case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    printf 'refusing cleanup outside local Supabase: %s\n' "$SUPABASE_URL" >&2
    exit 1
    ;;
esac

USER_JSON="$(curl -sS "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
IS_TEST="$(printf '%s' "$USER_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const app=j.app_metadata||{}; const user=j.user_metadata||{}; process.stdout.write(String(app.is_test_persona === true || user.is_test_persona === true));})')"
IS_TEMP_AUTH="$(printf '%s' "$USER_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const app=j.app_metadata||{}; const user=j.user_metadata||{}; process.stdout.write(String(app.temporary_qa_connection === true || user.temporary_qa_connection === true));})')"
[ "$IS_TEST" = "true" ] && [ "$IS_TEMP_AUTH" = "true" ] || {
  printf 'refusing cleanup: auth user is not marked temporary test persona\n' >&2
  exit 1
}

# Reset first through the whitelisted script so related rows are purged before auth deletion.
bash "$ROOT/scripts/qa-reset-persona.sh" "$PERSONA" "$CONNECTION_NAME" >/dev/null

curl -sS -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" >/dev/null

rm -f "$CONNECTION_FILE"
printf 'cleanup complete for %s connection=%s (%s)\n' "$PERSONA" "$CONNECTION_NAME" "$USER_ID"
