#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   EMAIL="you@example.com" PASSWORD="your_password" ./scripts/send_whatsapp_optin.sh
#
# Reads SUPABASE_URL + SUPABASE_ANON_KEY from the repo root `.env` if present,
# then logs in and calls the `whatsapp-optin` Edge Function with the user JWT.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -z "${EMAIL:-}" || -z "${PASSWORD:-}" ]]; then
  echo "Missing EMAIL/PASSWORD."
  echo "Example: EMAIL=\"you@example.com\" PASSWORD=\"your_password\" $0"
  exit 1
fi

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

SUPABASE_URL="${SUPABASE_URL:-$(read_env_key SUPABASE_URL)}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_key SUPABASE_ANON_KEY)}"

if [[ -z "${SUPABASE_URL:-}" ]]; then
  SUPABASE_URL="http://127.0.0.1:54321"
fi

# If `.env` was written for containers, it may use host.docker.internal which
# does not resolve from the host OS. Make it host-friendly by default.
SUPABASE_URL="${SUPABASE_URL/host.docker.internal/127.0.0.1}"

if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo "Missing SUPABASE_ANON_KEY."
  echo "Set it in .env (SUPABASE_ANON_KEY=...) or export SUPABASE_ANON_KEY=..."
  echo "Tip: run 'npx supabase status' to get local keys."
  exit 1
fi

TOKEN_JSON="$(
  curl -sS "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
)"

ACCESS_TOKEN="$(
  printf '%s' "$TOKEN_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true
)"

if [[ -z "${ACCESS_TOKEN:-}" ]]; then
  echo "Login failed. Raw response:"
  echo "$TOKEN_JSON"
  exit 1
fi

curl -sS -X POST "${SUPABASE_URL}/functions/v1/whatsapp-optin" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(python3 - <<'PY'
import json, os
body = {}
tpl_name = (os.environ.get("TEMPLATE_NAME") or "").strip()
tpl_lang = (os.environ.get("TEMPLATE_LANG") or "").strip()
if tpl_name:
  body["template_name"] = tpl_name
if tpl_lang:
  body["template_lang"] = tpl_lang
print(json.dumps(body))
PY
)" | python3 -m json.tool || true


