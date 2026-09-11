#!/usr/bin/env bash
# POINT 7 — MESURE DE v28 + `swap` (lane voisine) sur les deux foyers qui étaient
# passés au végétarien entier : C06 (cinq/keen/3c) et C07 (cinq/minimal/3c).
# AVANT (f81ce212) : casseroles carnées 0/3 et 0/5, bites=0, 200.
# On lit : http, household.swap (le dénominateur neuf), regime_belt, ET le contrôle
# indépendant — casseroles carnées et boîtes des omnivores les citant.
set -uo pipefail
. "$(dirname "$0")/00-env.sh"
OUT="$CAMP_DIR/point7-v28"; mkdir -p "$OUT"
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong: 900 s" ) || echo "kong: extension KO"
set_pc() { psqlq -c "update student_goals sg set practical_constraints = practical_constraints || jsonb_build_object('cooking_style','$2','grocery_runs',$3,'kitchen_equipment','$4'::jsonb) from profiles p where p.id=sg.user_id and p.email='$1';" >/dev/null; }
trap 'set_pc "$CINQ_EMAIL" keen 3 "[\"oven\",\"stovetop\",\"fridge\",\"freezer\"]"; echo "fixture restaurée"' EXIT
U=$(psqlq -c "select id from profiles where email='$CINQ_EMAIL';")
tir() { # <cas> <style>
  set_pc "$CINQ_EMAIL" "$2" 3 '["oven","stovetop","fridge","freezer"]'
  local JWT; JWT=$(login "$CINQ_EMAIL"); local F="$OUT/$1-$(date +%H%M%S).json"; local SINCE; SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "── $1 · empreinte foyer $(codeprint generate-household-meal-v1) · $(date +%H:%M:%S)"
  local CODE; CODE=$(curl -s --max-time 900 -X POST "$API_URL/functions/v1/generate-household-meal-v1" -H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'content-type: application/json' \
    -d '{"operation":"compose","window":{"kind":"days","count":7},"intent":"draft","replaces":null,"context":null,"cooking_shape":null,"preferences":null}' -o "$F" -w "%{http_code}")
  python3 - "$F" "$CODE" <<'PY'
import json,sys
f,code=sys.argv[1:3]
d=json.load(open(f,encoding='utf-8'))
h=d.get('household') or {}
print(f"   http={code}")
print(f"   swap (dénominateur neuf) : {h.get('swap')}")
rb=h.get('regime_belt') or {}; md=h.get('meals_delivered') or {}
print(f"   regime_belt: bites={rb.get('bites')} separated={rb.get('separated')} refused={rb.get('refused')} group_excluded={rb.get('group_excluded')} · meals_delivered: missing={md.get('missing')} retry_on={md.get('retry_on')} accepted={md.get('retry_accepted')} merged={md.get('retry_merged_cells')}")
MEAT={"poultry","red_meat","white_fish","fatty_fish","fish","shellfish","processed_meat","lean_protein"}
preps={p['id']:p for p in (d.get('preparations') or [])}
meat={pid for pid,p in preps.items() if {i.get('group') for i in (p.get('ingredients') or [])} & MEAT}
sm=st=0
for dish in (d.get('dishes') or []):
    for b in (dish.get('boxes') or []):
        if len(b.get('member_ids') or [])!=1: continue
        st+=1; sm+= bool({it.get('preparation_id') for it in (b.get('items') or [])} & meat)
print(f"   CONTRÔLE indépendant : casseroles carnées {len(meat)}/{len(preps)} · boîtes à un nom citant de la viande {sm}/{st}")
if code!="200": print("   ⛔", d.get('error'), str(d.get('detail'))[:120])
PY
  echo "   journal swap_presence (filtré sur ce compte) :"; docker logs --since "$SINCE" supabase_edge_runtime_Sophia_2 2>&1 | grep -F "$U" | grep -F "swap_presence" | sed 's/.*{"tag"/   {"tag"/' | cut -c1-260 | head -3
}
tir C06 keen
tir C07 minimal
