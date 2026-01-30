#!/usr/bin/env bash
set -euo pipefail

# WhatsApp Cloud API (Meta) — make phone number go "Connected"
#
# This script helps you:
# - discover IDs (Business ID, WABA_ID, PHONE_NUMBER_ID)
# - register the phone number with your 2-step verification PIN
# - subscribe your app to the WABA
# - sanity-check webhook GET challenge
#
# Requirements:
# - A valid Graph API access token with WhatsApp permissions for your WABA.
#
# Examples:
#   export ACCESS_TOKEN="..."
#   export GRAPH_VERSION="v21.0"         # optional (default v21.0)
#   export BUSINESS_ID="..."             # for discovery commands
#   export WABA_ID="..."                 # for subscribe + listing phone numbers
#   export PHONE_NUMBER_ID="..."         # for register
#   export PIN="123456"                  # 2-step verification PIN (6 digits)
#
#   ./scripts/whatsapp_connect_number.sh list-businesses
#   ./scripts/whatsapp_connect_number.sh list-wabas "$BUSINESS_ID"
#   ./scripts/whatsapp_connect_number.sh list-phone-numbers "$WABA_ID"
#   ./scripts/whatsapp_connect_number.sh register "$PHONE_NUMBER_ID" "$PIN"
#   ./scripts/whatsapp_connect_number.sh subscribe "$WABA_ID"
#   ./scripts/whatsapp_connect_number.sh connect "$PHONE_NUMBER_ID" "$PIN" "$WABA_ID"
#
# Webhook check (optional):
#   export WEBHOOK_URL="https://<project>.functions.supabase.co/whatsapp-webhook"
#   export VERIFY_TOKEN="..."
#   ./scripts/whatsapp_connect_number.sh check-webhook

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Prefer Supabase local env if present, fallback to repo root `.env`.
# Note: in some environments, `.env` files may be ignored by tooling/sandboxing.
ENV_FILE_DEFAULT="$ROOT_DIR/supabase/.env"
if [[ ! -f "$ENV_FILE_DEFAULT" ]]; then
  ENV_FILE_DEFAULT="$ROOT_DIR/.env"
fi
ENV_FILE="${ENV_FILE:-$ENV_FILE_DEFAULT}"

read_env_key() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
try:
  lines = open(path, "r", encoding="utf-8").read().splitlines()
except FileNotFoundError:
  print("")
  sys.exit(0)
for line in lines:
  s = line.strip()
  if not s or s.startswith("#"):
    continue
  if "=" not in s:
    continue
  k, v = s.split("=", 1)
  if k.strip() == key:
    print(v.strip().strip('"').strip("'"))
    sys.exit(0)
print("")
PY
}

GRAPH_VERSION="${GRAPH_VERSION:-$(read_env_key WHATSAPP_GRAPH_VERSION)}"
GRAPH_VERSION="${GRAPH_VERSION:-v21.0}"
# Accept either ACCESS_TOKEN or WHATSAPP_ACCESS_TOKEN (matches our Edge Functions naming).
ACCESS_TOKEN="${ACCESS_TOKEN:-${WHATSAPP_ACCESS_TOKEN:-}}"
ACCESS_TOKEN="${ACCESS_TOKEN:-$(read_env_key WHATSAPP_ACCESS_TOKEN)}"
PIN_DEFAULT="${PIN:-${WHATSAPP_2FA_PIN:-${WHATSAPP_PIN:-}}}"
PIN_DEFAULT="${PIN_DEFAULT:-$(read_env_key WHATSAPP_2FA_PIN)}"
PIN_DEFAULT="${PIN_DEFAULT:-$(read_env_key WHATSAPP_PIN)}"

api_get() {
  local path="$1"
  curl -sS "https://graph.facebook.com/${GRAPH_VERSION}/${path}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json"
}

api_post_json() {
  local path="$1"
  local json="$2"
  curl -sS -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${path}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$json"
}

strip_plus() {
  local s="${1:-}"
  s="${s//[[:space:]]/}"
  s="${s//-/}"
  s="${s//(/}"
  s="${s//)/}"
  if [[ "$s" == +* ]]; then
    s="${s:1}"
  fi
  echo "$s"
}

require_token() {
  if [[ -z "${ACCESS_TOKEN:-}" ]]; then
    echo "Missing ACCESS_TOKEN (or WHATSAPP_ACCESS_TOKEN in .env)."
    exit 1
  fi
}

cmd="${1:-}"
shift || true

case "$cmd" in
  list-businesses)
    require_token
    api_get "me/businesses?fields=id,name" | python3 -m json.tool
    ;;

  list-wabas)
    require_token
    business_id="${1:-${BUSINESS_ID:-}}"
    if [[ -z "${business_id:-}" ]]; then
      echo "Usage: $0 list-wabas <BUSINESS_ID>   (or export BUSINESS_ID=...)"
      exit 1
    fi
    api_get "${business_id}/owned_whatsapp_business_accounts?fields=id,name" | python3 -m json.tool
    ;;

  list-phone-numbers)
    require_token
    waba_id="${1:-${WABA_ID:-}}"
    if [[ -z "${waba_id:-}" ]]; then
      echo "Usage: $0 list-phone-numbers <WABA_ID>   (or export WABA_ID=...)"
      exit 1
    fi
    api_get "${waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status" | python3 -m json.tool
    ;;

  list-templates)
    require_token
    waba_id="${1:-${WABA_ID:-}}"
    if [[ -z "${waba_id:-}" ]]; then
      echo "Usage: $0 list-templates <WABA_ID>"
      exit 1
    fi
    api_get "${waba_id}/message_templates?fields=name,status,language,category&limit=200" | python3 -m json.tool
    ;;

  register)
    require_token
    phone_number_id="${1:-${PHONE_NUMBER_ID:-}}"
    pin="${2:-${PIN_DEFAULT:-}}"
    if [[ -z "${phone_number_id:-}" || -z "${pin:-}" ]]; then
      echo "Usage: $0 register <PHONE_NUMBER_ID> <PIN_6_DIGITS>"
      echo "Tip: you can also export WHATSAPP_2FA_PIN=123456 (or set it in your env file)."
      exit 1
    fi
    api_post_json "${phone_number_id}/register" "{\"messaging_product\":\"whatsapp\",\"pin\":\"${pin}\"}" | python3 -m json.tool
    ;;

  subscribe)
    require_token
    waba_id="${1:-${WABA_ID:-}}"
    if [[ -z "${waba_id:-}" ]]; then
      echo "Usage: $0 subscribe <WABA_ID>"
      exit 1
    fi
    api_post_json "${waba_id}/subscribed_apps" "{}" | python3 -m json.tool
    ;;

  send-template)
    require_token
    phone_number_id="${PHONE_NUMBER_ID:-$(read_env_key WHATSAPP_PHONE_NUMBER_ID)}"
    to_raw="${1:-}"
    tpl_name="${2:-}"
    tpl_lang="${3:-fr}"
    param1="${4:-}"
    if [[ -z "${phone_number_id:-}" || -z "${to_raw:-}" || -z "${tpl_name:-}" ]]; then
      echo "Usage: $0 send-template <TO_E164_OR_DIGITS> <TEMPLATE_NAME> [LANG=fr] [PARAM1]"
      echo "Notes:"
      echo "  - PHONE_NUMBER_ID is read from env (WHATSAPP_PHONE_NUMBER_ID) unless PHONE_NUMBER_ID is exported."
      echo "  - TO must be digits (Meta expects no '+'); we auto-strip '+' if present."
      exit 1
    fi
    to="$(strip_plus "$to_raw")"
    payload="$(python3 - <<PY
import json
tpl = {
  "name": "$tpl_name",
  "language": {"code": "$tpl_lang"},
}
if "$param1":
  tpl["components"] = [{"type":"body","parameters":[{"type":"text","text":"$param1"}]}]
print(json.dumps({
  "messaging_product": "whatsapp",
  "to": "$to",
  "type": "template",
  "template": tpl,
}))
PY
)"
    api_post_json "${phone_number_id}/messages" "$payload" | python3 -m json.tool
    ;;

  connect)
    require_token
    phone_number_id="${1:-${PHONE_NUMBER_ID:-}}"
    pin="${2:-${PIN_DEFAULT:-}}"
    waba_id="${3:-${WABA_ID:-}}"
    if [[ -z "${phone_number_id:-}" || -z "${pin:-}" || -z "${waba_id:-}" ]]; then
      echo "Usage: $0 connect <PHONE_NUMBER_ID> <PIN_6_DIGITS> <WABA_ID>"
      echo "Tip: you can also export WHATSAPP_2FA_PIN=123456 (or set it in your env file)."
      exit 1
    fi
    echo "==> Register phone number"
    api_post_json "${phone_number_id}/register" "{\"messaging_product\":\"whatsapp\",\"pin\":\"${pin}\"}" | python3 -m json.tool
    echo
    echo "==> Subscribe app to WABA"
    api_post_json "${waba_id}/subscribed_apps" "{}" | python3 -m json.tool
    ;;

  check-webhook)
    webhook_url="${WEBHOOK_URL:-}"
    verify_token="${VERIFY_TOKEN:-${WHATSAPP_WEBHOOK_VERIFY_TOKEN:-$(read_env_key WHATSAPP_WEBHOOK_VERIFY_TOKEN)}}"
    if [[ -z "${webhook_url:-}" || -z "${verify_token:-}" ]]; then
      echo "Usage: export WEBHOOK_URL=... VERIFY_TOKEN=...; $0 check-webhook"
      exit 1
    fi
    challenge="challenge_$(date +%s)"
    echo "==> GET ${webhook_url}?hub.mode=subscribe&hub.verify_token=***&hub.challenge=${challenge}"
    body="$(curl -sS "${webhook_url}?hub.mode=subscribe&hub.verify_token=${verify_token}&hub.challenge=${challenge}")"
    if [[ "$body" == "$challenge" ]]; then
      echo "OK: webhook handshake works (challenge echoed)."
      exit 0
    fi
    echo "FAIL: expected body '${challenge}', got:"
    echo "$body"
    exit 2
    ;;

  ""|-h|--help|help)
    sed -n '1,80p' "$0"
    ;;

  *)
    echo "Unknown command: ${cmd}"
    echo "Run: $0 --help"
    exit 1
    ;;
esac


