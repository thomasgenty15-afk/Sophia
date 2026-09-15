#!/usr/bin/env bash
set -euo pipefail
# usage: JWT=... ANON=... NOW_ISO=... turn.sh <nn> <message>
NN="$1"; MSG="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"
NOW="${NOW_ISO:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}"
SCOPE="qa-rose-hard18-2026-07-13-r1"
BODY="$(node -e '
const [msg, now, scope] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  message: msg, channel: "web", scope,
  force_full_ai: true, client_now_iso: now, client_timezone: "Europe/Paris",
}));' "$MSG" "$NOW" "$SCOPE")"
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/test-send-message" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "x-user-authorization: Bearer $JWT" -H "content-type: application/json" \
  --data "$BODY" --max-time 300 > "$DIR/t$NN.raw.json"
echo "HTTP body bytes: $(wc -c < "$DIR/t$NN.raw.json")"
