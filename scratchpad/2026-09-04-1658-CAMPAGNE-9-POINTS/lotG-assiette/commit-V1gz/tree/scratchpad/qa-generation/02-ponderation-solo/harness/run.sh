#!/usr/bin/env bash
# ===========================================================================
# AGENT 2A — un run RÉEL sur `generate-meal-v1`, et les TROIS fichiers.
#   ./run.sh <1..5> <iteration> <numero-de-run> <dossier-de-sortie>
# ===========================================================================
# ⚠️ Le plan précédent de CE scénario est supprimé avant l'appel: sans ça, le
# second run sur la même fenêtre rend `409 plan_overlaps_existing` et on
# mesurerait un refus au lieu d'une composition.
set -uo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
S="$1"; ITER="$2"; RUN="$3"; OUT="$4"
EMAIL="qa2a.s${S}@keeltest.dev"
UID_="2a000000-0000-4000-8000-00000000000${S}"
RID="2a0000${ITER}-${S}${RUN}00-4000-8000-000000000001"

case "$S" in
  1) BODY='{"mode":"from_pantry","window":{"kind":"exact","starts_on":"2026-08-19","duration_days":3},"intent":"prepare_next","replaces":null,"meal_slot":null,"servings":1,"context":"Thursday evening is chaotic, two late meetings","preferences":"smoky harissa flavours, and one proper crust","pantry":[{"term":"tinned chickpeas"},{"term":"basmati rice"},{"term":"smoked paprika"},{"term":"natural yogurt"}]}' ;;
  2) BODY='{"mode":"to_shop","window":{"kind":"exact","starts_on":"2026-08-19","duration_days":3},"intent":"prepare_next","replaces":null,"meal_slot":null,"servings":1,"context":null,"preferences":null,"pantry":[]}' ;;
  3) BODY='{"mode":"to_shop","window":{"kind":"exact","starts_on":"2026-08-19","duration_days":3},"intent":"prepare_next","replaces":null,"meal_slot":null,"servings":1,"context":"A friend is staying over on Friday and she is a big eater","preferences":"I want a proper tahini and sesame noodle bowl, and a roast chicken traybake","pantry":[]}' ;;
  4) BODY='{"mode":"to_shop","window":{"kind":"exact","starts_on":"2026-08-19","duration_days":3},"intent":"prepare_next","replaces":null,"meal_slot":null,"servings":1,"context":"Money is very tight until the end of the month","preferences":"slow-braised lamb shanks and a proper saffron risotto","pantry":[]}' ;;
  5) BODY='{"mode":"to_shop","window":{"kind":"exact","starts_on":"2026-08-19","duration_days":3},"intent":"prepare_next","replaces":null,"meal_slot":null,"servings":1,"context":null,"preferences":"something green and crunchy","pantry":[]}' ;;
  *) echo "scenario inconnu"; exit 2 ;;
esac

mkdir -p "$OUT"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -q -c \
  "delete from public.student_generated_meals where user_id='${UID_}';" >/dev/null 2>&1

JWT=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

printf '%s' "$BODY" > "$OUT/request-body.json"
START=$(date +%s)
HTTP=$(curl -s -o "$OUT/http-response.json" -w '%{http_code}' -X POST \
  "http://127.0.0.1:54321/functions/v1/generate-meal-v1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "x-request-id: $RID" \
  --max-time 590 --data "$BODY")
ELAPSED=$(( $(date +%s) - START ))
echo "S${S} iter=${ITER} run=${RUN} rid=${RID} HTTP=${HTTP} ${ELAPSED}s"
printf '%s' "$RID" > "$OUT/request-id.txt"
head -c 300 "$OUT/http-response.json"; echo
