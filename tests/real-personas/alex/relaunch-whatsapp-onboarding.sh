#!/usr/bin/env bash
set -euo pipefail

# Relaunch Alex's WhatsApp simulation onboarding from a clean test surface.
# Scope: WhatsApp simulation data only. This intentionally does not delete
# Alex's profile, plan, Architecte/module traces, memories, or web chat history.
#
# Usage:
#   tests/real-personas/alex/relaunch-whatsapp-onboarding.sh
#   ALEX_USER_ID="<uuid>" tests/real-personas/alex/relaunch-whatsapp-onboarding.sh
#   KEEP_WHATSAPP_HISTORY=1 tests/real-personas/alex/relaunch-whatsapp-onboarding.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SUPABASE_ENV_FILE="${SUPABASE_ENV_FILE:-$ROOT_DIR/supabase/.env}"

ALEX_USER_ID="${ALEX_USER_ID:-9e165f02-6314-403b-8f01-27c0485c4aa2}"
ALEX_FIRST_NAME="${ALEX_FIRST_NAME:-Alex}"
KEEP_WHATSAPP_HISTORY="${KEEP_WHATSAPP_HISTORY:-0}"

read_env_key() {
  local key="$1"
  if [[ ! -f "$SUPABASE_ENV_FILE" ]]; then
    return 0
  fi
  awk -F= -v k="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == k {
      v = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      gsub(/^'\''|'\''$/, "", v)
      print v
      exit
    }
  ' "$SUPABASE_ENV_FILE"
}

status_value() {
  local key="$1"
  supabase status --output json 2>/dev/null | node -e '
    const key = process.argv[1];
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      const start = s.indexOf("{");
      const end = s.lastIndexOf("}");
      if (start < 0 || end < start) return;
      const json = JSON.parse(s.slice(start, end + 1));
      process.stdout.write(String(json[key] || ""));
    });
  ' "$key"
}

SUPABASE_URL="${SUPABASE_URL:-$(read_env_key SUPABASE_URL)}"
SUPABASE_URL="${SUPABASE_URL:-$(status_value API_URL)}"
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SUPABASE_URL="${SUPABASE_URL/host.docker.internal/127.0.0.1}"

SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(read_env_key SUPABASE_SERVICE_ROLE_KEY)}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$(status_value SERVICE_ROLE_KEY)}"

INTERNAL_SECRET="${INTERNAL_FUNCTION_SECRET:-$(read_env_key INTERNAL_FUNCTION_SECRET)}"
INTERNAL_SECRET="${INTERNAL_SECRET:-$(read_env_key SECRET_KEY)}"
INTERNAL_SECRET="${INTERNAL_SECRET:-$(status_value SECRET_KEY)}"
SIM_ENABLED="${WHATSAPP_WEB_SIMULATION_ENABLED:-$(read_env_key WHATSAPP_WEB_SIMULATION_ENABLED)}"

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Missing service role key. Start Supabase locally or provide SUPABASE_SERVICE_ROLE_KEY." >&2
  exit 1
fi

if [[ -z "$INTERNAL_SECRET" ]]; then
  echo "Missing INTERNAL_FUNCTION_SECRET/SECRET_KEY. Check $SUPABASE_ENV_FILE or Supabase status." >&2
  exit 1
fi

case "$(printf '%s' "$SIM_ENABLED" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on) ;;
  *)
    echo "Refusing to run: WHATSAPP_WEB_SIMULATION_ENABLED is not enabled." >&2
    echo "Set WHATSAPP_WEB_SIMULATION_ENABLED=1 in $SUPABASE_ENV_FILE and restart Supabase Functions." >&2
    exit 1
    ;;
esac

rest_delete() {
  local path="$1"
  local label="$2"
  local code
  code="$(curl -sS -o /tmp/alex-wa-reset-response.json -w "%{http_code}" \
    -X DELETE "$SUPABASE_URL/rest/v1/$path" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "prefer: return=minimal")"
  if [[ "$code" == "204" || "$code" == "200" || "$code" == "404" ]]; then
    echo "reset: $label"
    return 0
  fi
  echo "WARN: could not reset $label (HTTP $code)" >&2
  cat /tmp/alex-wa-reset-response.json >&2 || true
}

rest_patch() {
  local path="$1"
  local body="$2"
  local label="$3"
  local code
  code="$(curl -sS -o /tmp/alex-wa-reset-response.json -w "%{http_code}" \
    -X PATCH "$SUPABASE_URL/rest/v1/$path" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "content-type: application/json" \
    -H "prefer: return=minimal" \
    --data "$body")"
  if [[ "$code" == "204" || "$code" == "200" ]]; then
    echo "reset: $label"
    return 0
  fi
  echo "ERROR: could not reset $label (HTTP $code)" >&2
  cat /tmp/alex-wa-reset-response.json >&2 || true
  exit 1
}

if [[ "$KEEP_WHATSAPP_HISTORY" != "1" ]]; then
  rest_delete "chat_messages?user_id=eq.$ALEX_USER_ID&scope=eq.whatsapp" "chat_messages scope=whatsapp"
fi

rest_delete "whatsapp_inbound_dedup?user_id=eq.$ALEX_USER_ID" "whatsapp_inbound_dedup"
rest_delete "whatsapp_cost_events?user_id=eq.$ALEX_USER_ID" "whatsapp_cost_events"
rest_delete "whatsapp_outbound_messages?user_id=eq.$ALEX_USER_ID" "whatsapp_outbound_messages"
rest_delete "user_profile_facts?user_id=eq.$ALEX_USER_ID&key=in.(coach.tone,coach.challenge_level,coach.question_tendency)" "WhatsApp onboarding coach preferences"

rest_patch \
  "profiles?id=eq.$ALEX_USER_ID" \
  '{"whatsapp_state":null,"whatsapp_state_updated_at":null,"whatsapp_opted_in":true,"whatsapp_opted_out_at":null,"whatsapp_optout_confirmed_at":null,"phone_invalid":false}' \
  "profile WhatsApp state"

rest_patch \
  "user_chat_states?user_id=eq.$ALEX_USER_ID&scope=eq.whatsapp" \
  '{"current_mode":"companion","risk_level":0,"investigation_state":null,"short_term_context":"","unprocessed_msg_count":0,"temp_memory":{}}' \
  "user_chat_states scope=whatsapp"

PAYLOAD="$(node -e '
  const userId = process.argv[1];
  const firstName = process.argv[2];
  process.stdout.write(JSON.stringify({
    user_id: userId,
    purpose: "optin",
    require_opted_in: false,
    message: {
      type: "template",
      name: "sophia_optin_v2",
      language: "fr",
      components: [{
        type: "body",
        parameters: [{ type: "text", text: firstName }],
      }],
    },
    metadata_extra: {
      source: "alex_relaunch_whatsapp_onboarding",
      sim_event: "optin",
      reset_before_trigger: true,
    },
  }));
' "$ALEX_USER_ID" "$ALEX_FIRST_NAME")"

HTTP_CODE="$(curl -sS -o /tmp/alex-wa-optin-response.json -w "%{http_code}" \
  -X POST "$SUPABASE_URL/functions/v1/whatsapp-send" \
  -H "content-type: application/json" \
  -H "x-request-id: alex-relaunch-whatsapp-onboarding" \
  -H "x-internal-secret: $INTERNAL_SECRET" \
  --data "$PAYLOAD")"

echo "trigger optin: HTTP $HTTP_CODE"
cat /tmp/alex-wa-optin-response.json
echo

if [[ "$HTTP_CODE" != "200" ]]; then
  exit 1
fi

echo "Done. Open /chat as Alex; the WhatsApp simulation onboarding starts from the opt-in template."
