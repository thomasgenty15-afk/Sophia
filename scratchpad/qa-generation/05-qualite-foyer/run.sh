#!/usr/bin/env bash
# ÉTAPE ⑤ — un run réel sur le foyer `qa5a`, et LES TROIS FICHIERS.
#   ./run.sh <cooking_shape|none> <request-id> <dossier>
# Variables: DAYS (défaut 1), STARTS (défaut 2026-08-19), CONTEXT
#
# ⚠️ BASH OBLIGATOIRE (`#!/usr/bin/env bash`, lancé par `./`) : sous zsh,
# `set -- $spec` ne découpe pas le mot et le mode part comme un jeton hors
# liste — `readCookingShape` rend `null`, le run part, rend 200, et mesure le
# calcul seul. Piège payé par l'étape ③.
set -uo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SHAPE="$1"; RID="$2"; OUT="$3"
EMAIL="qa5a.foyer@keeltest.dev"
OWNER="5a000000-0000-4000-8000-000000000001"
FN="generate-household-meal-v1"
DAYS="${DAYS:-1}"
STARTS="${STARTS:-2026-08-19}"
CONTEXT="${CONTEXT:-}"
if [ "$SHAPE" = "none" ]; then SHAPE_JSON="null"; else SHAPE_JSON="\"$SHAPE\""; fi
BODY="{\"window\":{\"kind\":\"exact\",\"starts_on\":\"$STARTS\",\"duration_days\":$DAYS},\"intent\":\"prepare_next\",\"replaces\":null,\"context\":\"$CONTEXT\",\"cooking_shape\":$SHAPE_JSON}"
mkdir -p "$OUT"

# ── LA FENÊTRE EST LIBÉRÉE AVANT CHAQUE RUN (409 `plan_overlaps_existing`) ──
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -qtAc \
  "update public.student_generated_meals set retired_at = now()
     where household_id = (select household_id from public.household_members
                            where user_id = '$OWNER')
       and retired_at is null;" >/dev/null

JWT=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

printf '%s' "$BODY" > "$OUT/request-body.json"

# ── LES ENTRÉES, RELUES EN BASE AU MOMENT DU RUN ───────────────────────────
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "
select jsonb_pretty(jsonb_build_object(
  'asked_at', now(),
  'request_id', '$RID',
  'cooking_shape_asked', $( [ "$SHAPE" = none ] && echo "'null'::jsonb" || echo "to_jsonb('$SHAPE'::text)" ),
  'window', jsonb_build_object('starts_on','$STARTS','duration_days',$DAYS),
  'household_id', (select household_id from public.household_members where user_id='$OWNER'),
  'roster', (select jsonb_agg(jsonb_build_object(
       'member_id', r.member_id, 'first_name', r.first_name, 'age_state', r.age_state,
       'role', r.role, 'goal', r.goal, 'diet', r.diet, 'eating_rhythm', r.eating_rhythm,
       'has_account', r.user_id is not null, 'away_days', r.away_days,
       'body', (select jsonb_build_object('height_cm',b.height_cm,'weight_kg',b.weight_kg,'gender',b.gender,'activity_level',b.activity_level)
                  from public.household_member_bodies b where b.member_id=r.member_id),
       'allergies', coalesce((select jsonb_agg(a.label) from public.household_member_allergies a where a.member_id=r.member_id),'[]'::jsonb),
       'dislikes', coalesce((select jsonb_agg(x.label) from public.household_food_restrictions x where x.member_id=r.member_id),'[]'::jsonb)
     )) from public.keel_household_roster_for('$OWNER') r),
  'practical_constraints', (select practical_constraints from public.student_goals where user_id='$OWNER'),
  'owner_goal', (select goal from public.student_goals where user_id='$OWNER')
));" > "$OUT/inputs.json"

echo "== POST $FN  cooking_shape=$SHAPE  days=$DAYS  request_id=$RID =="
START=$(date +%s)
HTTP=$(curl -s -o "$OUT/http-response.json" -w '%{http_code}' -X POST \
  "http://127.0.0.1:54321/functions/v1/$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "x-request-id: $RID" \
  --max-time 590 --data "$BODY")
echo "HTTP $HTTP en $(( $(date +%s) - START )) s"
echo "$HTTP" > "$OUT/http-status.txt"
head -c 240 "$OUT/http-response.json"; echo

# ── ⚠️ UN VIDAGE VIDE N'EST PAS UNE PREUVE D'ABSENCE ───────────────────────
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select source||' | '||coalesce(model,'-')||' | '||status||' | '||coalesce(system_prompt_chars::text,'-')||' | '||coalesce(user_message_chars::text,'-')||' | '||created_at
     from public.llm_raw_response_events where request_id='$RID' order by created_at;" | tee "$OUT/model.txt"

# `--source` OBLIGATOIRE: un request_id foyer porte souvent deux appels.
node "$ROOT/scripts/export_llm_prompt_dump.mjs" --request-id "$RID" \
  --source "$FN" --out "$OUT/dump" >/dev/null 2>&1
ls "$OUT/dump" 2>/dev/null

# ── CE QUE LE MOTEUR A DÉCIDÉ, ARCHIVÉ DANS LE PLAN ────────────────────────
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select jsonb_pretty(jsonb_build_object(
      'plan_id', id, 'created_at', created_at, 'starts_on', starts_on,
      'household', generated_from->'household',
      'rationale', generated_from->'rationale'))
     from public.student_generated_meals
     where household_id=(select household_id from public.household_members where user_id='$OWNER')
     order by created_at desc limit 1;" > "$OUT/plan-written.json" 2>/dev/null

# ── LE PLAN COMPLET, TEL QU'IL EST EN BASE (la surface lue à table) ────────
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select jsonb_pretty(jsonb_build_object('plan_id', id, 'created_at', created_at,
      'starts_on', starts_on, 'duration_days', duration_days, 'scope', scope,
      'servings', servings, 'cooking_sessions', cooking_sessions,
      'preparations', preparations, 'dishes', dishes,
      'member_portions', member_portions, 'shopping_list', shopping_list))
     from public.student_generated_meals
     where household_id=(select household_id from public.household_members where user_id='$OWNER')
     order by created_at desc limit 1;" > "$OUT/plan-payload.json" 2>/dev/null
wc -c "$OUT/plan-payload.json" 2>/dev/null
