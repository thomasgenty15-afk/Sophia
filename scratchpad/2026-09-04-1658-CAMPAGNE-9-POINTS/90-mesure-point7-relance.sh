#!/usr/bin/env bash
# POINT 7 — MESURE DU REMÈDE « relance par parties » (f81ce212), sur mes cinq
# configurations de foyer, UN tirage chacune, en `intent: draft` (rien n'est écrit).
#
# AVANT (plans d'hier, avant le lot) :
#   C03 quatre/balanced/2c  séparation 12/12  200
#   C04 quatre/balanced/1c   6/9              200
#   C05 quatre/1c/sans cong. 0/10             422 mouth_unfed
#   C06 cinq/keen/3c         0/6              422 mouth_unfed
#   C07 cinq/minimal/3c      1/13             422 mouth_unfed
# ⚠️ UN TIRAGE PAR FOYER NE FAIT PAS UN TAUX. Ce qu'on lit : 422→200 sur les mêmes
# fixtures, `retry_merged_cells` dans `household.meals_delivered`, `group_excluded`.
set -uo pipefail
. "$(dirname "$0")/00-env.sh"
OUT="$CAMP_DIR/point7-relance"; mkdir -p "$OUT"
# Kong à 900 s : ne survit pas à `supabase start` (mesuré par la session voisine).
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong: 900 s" ) || echo "kong: extension KO (à vérifier)"
set_pc() { # <email> <style> <runs> <equipment-json>
  psqlq -c "update student_goals sg set practical_constraints = practical_constraints || jsonb_build_object('cooking_style','$2','grocery_runs',$3,'kitchen_equipment','$4'::jsonb) from profiles p where p.id=sg.user_id and p.email='$1';" >/dev/null
}
tir() { # <cas> <email>
  local CAS=$1 EMAIL=$2 JWT; JWT=$(login "$EMAIL")
  local F="$OUT/$CAS-$(date +%H%M%S).json"
  echo "── $CAS · empreinte foyer $(codeprint generate-household-meal-v1) · $(date +%H:%M:%S)"
  local CODE; CODE=$(curl -s --max-time 900 -X POST "$API_URL/functions/v1/generate-household-meal-v1" \
    -H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'content-type: application/json' \
    -d '{"operation":"compose","window":{"kind":"days","count":7},"intent":"draft","replaces":null,"context":null,"cooking_shape":null,"preferences":null}' \
    -o "$F" -w "%{http_code}")
  python3 - "$F" "$CODE" "$CAS" <<'PY'
import json,sys
f,code,cas=sys.argv[1:4]
try: d=json.load(open(f,encoding='utf-8'))
except Exception: print(f"   http={code} · réponse illisible"); sys.exit()
h=d.get('household') or {}
md=h.get('meals_delivered') or {}
rb=h.get('regime_belt') or {}
print(f"   http={code}  missing={md.get('missing')}  retry_on={md.get('retry_on')}  retry_merged_cells={md.get('retry_merged_cells')}  retry_accepted={md.get('retry_accepted')}")
print(f"   regime_belt: bites={rb.get('bites')} separated={rb.get('separated')} not_separated={rb.get('not_separated')} refused={rb.get('refused')} group_excluded={rb.get('group_excluded')}")
if code!="200": print(f"   ⛔ {d.get('error')} · {str(d.get('detail'))[:120]}")
PY
}
# Les cinq configurations de la campagne (état restauré à la fin : quatre = balanced/2c/avec cong., cinq = keen/3c).
trap 'set_pc "$QUATRE_EMAIL" balanced 2 "[\"oven\",\"stovetop\",\"fridge\",\"freezer\"]"; set_pc "$CINQ_EMAIL" keen 3 "[\"oven\",\"stovetop\",\"fridge\",\"freezer\"]"; echo "fixtures restaurées"' EXIT
set_pc "$QUATRE_EMAIL" balanced 2 '["oven","stovetop","fridge","freezer"]'; tir C03 "$QUATRE_EMAIL"
set_pc "$QUATRE_EMAIL" balanced 1 '["oven","stovetop","fridge","freezer"]'; tir C04 "$QUATRE_EMAIL"
set_pc "$QUATRE_EMAIL" balanced 1 '["oven","stovetop","fridge"]';           tir C05 "$QUATRE_EMAIL"
set_pc "$CINQ_EMAIL"   keen     3 '["oven","stovetop","fridge","freezer"]'; tir C06 "$CINQ_EMAIL"
set_pc "$CINQ_EMAIL"   minimal  3 '["oven","stovetop","fridge","freezer"]'; tir C07 "$CINQ_EMAIL"
