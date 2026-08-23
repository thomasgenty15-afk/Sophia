#!/usr/bin/env bash
# LOT « porte du moteur » — un run réel du foyer 1V à quatre bouches.
#   ./run.sh <request-id> <dossier>
# Garde les TROIS fichiers: entrées (request-body.json + inputs.json),
# prompt (dump/), sortie (http-response.json + plan-written.json).
set -euo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
RID="$1"; OUT="$2"
EMAIL="qa1v.foyer@keeltest.dev"; FN="generate-household-meal-v1"
# ⚠️ `replace_current` PLUTÔT QUE `prepare_next`: le foyer a déjà un plan vivant
# sur cette fenêtre (`plan_overlaps_existing`, 409 avant tout appel modèle). On
# reste sur le chemin du produit — on ne supprime aucune ligne à la main.
LIVE=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c \
  "select id from student_generated_meals where household_id=(select household_id from household_members where user_id='1e000000-0000-4000-8000-000000000002') and retired_at is null order by starts_on desc limit 1;")
BODY="{\"window\":{\"kind\":\"exact\",\"starts_on\":\"2026-08-19\",\"duration_days\":3},\"intent\":\"replace_current\",\"replaces\":\"$LIVE\",\"context\":\"Odalric is repainting the hallway on Thursday and the kitchen table is under a dust sheet\",\"cooking_shape\":null}"
mkdir -p "$OUT"
JWT=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
printf '%s' "$BODY" > "$OUT/request-body.json"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c \
  "select json_agg(row_to_json(t)) from (select m.first_name, m.role, (m.user_id is not null) as has_account, m.birth_date, m.goal, m.target_pace_kg_per_week, b.height_cm, b.weight_kg, b.gender, b.activity_level, public.keel_household_member_age(m.member_id) as age_state from public.household_members m left join public.household_member_bodies b using(member_id) where m.household_id = (select household_id from public.household_members where user_id='1e000000-0000-4000-8000-000000000002') order by m.joined_at) t;" \
  > "$OUT/inputs.json"
echo "== POST $FN  request_id=$RID =="
START=$(date +%s)
HTTP=$(curl -s -o "$OUT/http-response.json" -w '%{http_code}' -X POST \
  "http://127.0.0.1:54321/functions/v1/$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "x-request-id: $RID" \
  --max-time 590 --data "$BODY")
echo "HTTP $HTTP en $(( $(date +%s) - START )) s"
head -c 300 "$OUT/http-response.json"; echo
# ⚠️ L'INSTRUMENT AVANT LA LECTURE: prouver que la ligne existe.
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select source, status, system_prompt_chars, user_message_chars from llm_raw_response_events where request_id='$RID';"
node "$ROOT/scripts/export_llm_prompt_dump.mjs" --request-id "$RID" --source generate-household-meal-v1 --out "$OUT/dump" || true
# La SORTIE écrite: le plan, ses boîtes, ses parts, et le compteur.
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c \
  "select row_to_json(t) from (select id, created_at, generated_from->'household'->'box_sizing' as box_sizing, preparations, member_portions from student_generated_meals where household_id=(select household_id from household_members where user_id='1e000000-0000-4000-8000-000000000002') order by created_at desc limit 1) t;" \
  > "$OUT/plan-written.json"
python3 -c "import json,sys;d=json.load(open('$OUT/plan-written.json'));print(json.dumps(d['box_sizing']))" || true
