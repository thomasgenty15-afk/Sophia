#!/usr/bin/env bash
set -euo pipefail
# usage: turn.sh <nn> <message>   (reads JWT from /tmp/rose_jwt_h19.txt, ANON from supabase status)
NN="$1"; MSG="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"
NOW="${NOW_ISO:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}"
SCOPE="qa-rose-hard19-2026-07-14-r1"
JWT="$(cat /tmp/rose_jwt_h19.txt)"
ANON="$(supabase status --output json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).ANON_KEY))')"
BODY="$(node -e '
const [msg, now, scope] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  message: msg, channel: "web", scope,
  force_full_ai: true, disable_debounce: true,
  client_now_iso: now, client_timezone: "Europe/Paris",
}));' "$MSG" "$NOW" "$SCOPE")"
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/test-send-message" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "x-user-authorization: Bearer $JWT" -H "content-type: application/json" \
  --data "$BODY" --max-time 300 > "$DIR/t$NN.raw.json"
echo "HTTP body bytes: $(wc -c < "$DIR/t$NN.raw.json")"
