#!/usr/bin/env bash
# Agent 16 harness helpers. Production paths only: the webhook is called over
# HTTP with a REAL X-Hub-Signature-256 (MEGA_TEST_MODE=0, so the bypass in
# wa_security.ts is closed and the signature is actually verified).
set -uo pipefail

REPO="/Users/ahmedamara/Dev/Sophia 2"
ENVF="$REPO/supabase/functions/night_llm.env"
BASE="http://127.0.0.1:54321/functions/v1"

getenv() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '\r'; }

APP_SECRET="$(getenv WHATSAPP_APP_SECRET)"
SRK="$(getenv SUPABASE_SERVICE_ROLE_KEY)"
ANON="$(getenv SUPABASE_ANON_KEY)"
INTERNAL="$(getenv INTERNAL_FUNCTION_SECRET)"

JULIE="a1600000-0000-4000-8000-000000000011"
NORA="a1600000-0000-4000-8000-000000000012"
COACH="a1600000-0000-4000-8000-0000000000aa"
COACH_USER="a1600000-0000-4000-8000-000000000001"
JULIE_PHONE="33600000916"

# --- SQL -------------------------------------------------------------------
sq()  { docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -c "$1"; }
sqt() { docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -qAt -c "$1"; }

# --- inbound WhatsApp, signed like Meta ------------------------------------
# usage: wa_post '<json payload>'
wa_post() {
  local body="$1"
  local sig
  sig="$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$APP_SECRET" -r | cut -d' ' -f1)"
  curl -sS -X POST "$BASE/whatsapp-webhook" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: sha256=$sig" \
    -H "apikey: $ANON" \
    --data-binary "$body" \
    --max-time 180
}

# text message from Julie
wa_text() { # $1 wamid, $2 text
  wa_post "$(cat <<JSON
{"object":"whatsapp_business_account","entry":[{"id":"WABA","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"33000000000","phone_number_id":"949276"},"contacts":[{"profile":{"name":"Julie"},"wa_id":"$JULIE_PHONE"}],"messages":[{"from":"$JULIE_PHONE","id":"$1","timestamp":"1780000000","type":"text","text":{"body":$(printf '%s' "$2" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}}]}}]}]}
JSON
)"
}

# interactive button reply (the evening tap)
wa_button() { # $1 wamid, $2 button id, $3 button title
  wa_post "$(cat <<JSON
{"object":"whatsapp_business_account","entry":[{"id":"WABA","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"33000000000","phone_number_id":"949276"},"contacts":[{"profile":{"name":"Julie"},"wa_id":"$JULIE_PHONE"}],"messages":[{"from":"$JULIE_PHONE","id":"$1","timestamp":"1780000000","type":"interactive","interactive":{"type":"button_reply","button_reply":{"id":"$2","title":"$3"}}}]}}]}]}
JSON
)"
}

# --- crons (internal secret) ------------------------------------------------
cron_call() { # $1 function, $2 json body
  curl -sS -X POST "$BASE/$1" \
    -H "Content-Type: application/json" \
    -H "x-internal-secret: $INTERNAL" \
    -H "apikey: $ANON" \
    -d "$2" --max-time 180
}

# Retry wrapper: the shared local runtime returns sporadic Kong 502s under the
# concurrent load of the other QA agents. Retries are transport-level only.
retry_json() { # $1..: command
  local out rc
  for i in 1 2 3 4 5; do
    out="$("$@" 2>&1)"; rc=$?
    if [ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q "invalid response was received from the upstream"; then
      printf '%s' "$out"; return 0
    fi
    sleep 2
  done
  printf '%s' "$out"; return 1
}
