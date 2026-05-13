#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-}"
CONNECTION_NAME="${2:-}"
[ -n "$PERSONA" ] || {
  printf 'usage: scripts/get-jwt.sh <persona> [connection_name]\n' >&2
  exit 2
}

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

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
ENV_FILE="$ROOT/supabase/.env"
if { [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; } && [ -f "$ENV_FILE" ]; then
  SUPABASE_URL="${SUPABASE_URL:-$(awk -F= '/^SUPABASE_URL=/{print $2; exit}' "$ENV_FILE")}"
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(awk -F= '/^SUPABASE_ANON_KEY=/{print $2; exit}' "$ENV_FILE")}"
fi
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  STATUS_JSON="$(supabase status --output json 2>/dev/null || true)"
  if [ -n "$STATUS_JSON" ]; then
    SUPABASE_URL="${SUPABASE_URL:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).API_URL || ""))')}"
    SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).ANON_KEY || ""))')}"
  fi
fi

[ -n "$SUPABASE_URL" ] || {
  printf 'missing SUPABASE_URL and no local supabase status\n' >&2
  exit 1
}
[ -n "$SUPABASE_ANON_KEY" ] || {
  printf 'missing SUPABASE_ANON_KEY and no local supabase status\n' >&2
  exit 1
}

TOKEN_PAYLOAD="$(
  node -e 'const fs=require("fs"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,"utf8")); const refresh=String(j.refresh_token || ""); if(refresh){process.stdout.write(JSON.stringify({grant:"refresh_token", body:{refresh_token:refresh}})); process.exit(0)} const email=String(j.email || ""); const password=String(j.password || ""); if(!email || !password){process.stderr.write(`missing refresh_token or email/password in ${p}\n`); process.exit(1)} process.stdout.write(JSON.stringify({grant:"password", body:{email,password}}));' "$CONNECTION"
)"

GRANT_TYPE="$(printf '%s' "$TOKEN_PAYLOAD" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).grant))')"
TOKEN_BODY="$(printf '%s' "$TOKEN_PAYLOAD" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).body)))')"

curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=$GRANT_TYPE" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  --data "$TOKEN_BODY" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); if(!j.access_token){console.error(s); process.exit(1)} process.stdout.write(j.access_token)})'
