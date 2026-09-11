#!/usr/bin/env bash
# C04 est tombé en 546 WORKER_LIMIT (infra, pas produit) : on le rejoue seul.
set -uo pipefail
. "$(dirname "$0")/00-env.sh"
OUT="$CAMP_DIR/point7-relance"
set_pc() { psqlq -c "update student_goals sg set practical_constraints = practical_constraints || jsonb_build_object('cooking_style','$2','grocery_runs',$3,'kitchen_equipment','$4'::jsonb) from profiles p where p.id=sg.user_id and p.email='$1';" >/dev/null; }
trap 'set_pc "$QUATRE_EMAIL" balanced 2 "[\"oven\",\"stovetop\",\"fridge\",\"freezer\"]"; echo "fixture restaurée"' EXIT
set_pc "$QUATRE_EMAIL" balanced 1 '["oven","stovetop","fridge","freezer"]'
JWT=$(login "$QUATRE_EMAIL"); F="$OUT/C04-$(date +%H%M%S).json"
echo "── C04 (rejeu) · empreinte $(codeprint generate-household-meal-v1) · $(date +%H:%M:%S)"
CODE=$(curl -s --max-time 900 -X POST "$API_URL/functions/v1/generate-household-meal-v1" -H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d '{"operation":"compose","window":{"kind":"days","count":7},"intent":"draft","replaces":null,"context":null,"cooking_shape":null,"preferences":null}' -o "$F" -w "%{http_code}")
python3 - "$F" "$CODE" <<'PY'
import json,sys
f,code=sys.argv[1:3]
d=json.load(open(f,encoding='utf-8'))
h=d.get('household') or {}; md=h.get('meals_delivered') or {}; rb=h.get('regime_belt') or {}
print(f"   http={code}  missing={md.get('missing')}  retry_on={md.get('retry_on')}  merged_cells={md.get('retry_merged_cells')}  accepted={md.get('retry_accepted')}")
print(f"   regime_belt: bites={rb.get('bites')} separated={rb.get('separated')} not_separated={rb.get('not_separated')} refused={rb.get('refused')} group_excluded={rb.get('group_excluded')}")
if code!="200": print("   ⛔", d.get('error'), str(d.get('detail'))[:100])
PY
