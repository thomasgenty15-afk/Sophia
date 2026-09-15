#!/usr/bin/env bash
# 1V — lance un run réel et garde les TROIS fichiers.
#   ./run.sh <foyer|solo> <request-id> <dossier> [<corps json>]
set -euo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
LANE="$1"; RID="$2"; OUT="$3"; BODY="${4:-}"
case "$LANE" in
  foyer) EMAIL="qa1v.foyer@keeltest.dev"; FN="generate-household-meal-v1" ;;
  solo)  EMAIL="qa1v.solo@keeltest.dev";  FN="generate-meal-v1" ;;
  *) echo "lane inconnue"; exit 2 ;;
esac
mkdir -p "$OUT"
JWT=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "$BODY" > "$OUT/request-body.json"
echo "== POST $FN  request_id=$RID =="
START=$(date +%s)
HTTP=$(curl -s -o "$OUT/http-response.json" -w '%{http_code}' -X POST \
  "http://127.0.0.1:54321/functions/v1/$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "x-request-id: $RID" \
  --max-time 590 --data "$BODY")
echo "HTTP $HTTP en $(( $(date +%s) - START )) s"
head -c 400 "$OUT/http-response.json"; echo
