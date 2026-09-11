#!/usr/bin/env bash
# LOT F — LE SCÉNARIO DE LA DÉCISION, SUR LE VRAI PRODUIT.
# Julie (maîtresse, maintenance, n'a rien choisi) regarde ; Marc (perte de poids,
# sans compte) doit voir ses boîtes chiffrées SUR L'ÉCRAN DE JULIE.
# ① une génération ÉCRITE (`prepare_next`) pour le duo  ② `meal-energy-v1` comme Julie.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
OUT_DIR="$CAMP_DIR/lotF-tir"; mkdir -p "$OUT_DIR"; TS=$(date +%H%M%S)
JWT=$(login "$DUO_EMAIL"); [ -n "$JWT" ] || { echo "login KO"; exit 1; }
echo "① génération (prepare_next, 7 j) — empreinte foyer $(codeprint generate-household-meal-v1)"
curl -s --max-time 900 -X POST "$API_URL/functions/v1/generate-household-meal-v1" \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d '{"operation":"compose","window":{"kind":"days","count":7},"intent":"prepare_next","replaces":null,"context":null,"cooking_shape":null,"preferences":null}' \
  -o "$OUT_DIR/gen-$TS.json" -w "   http=%{http_code} en %{time_total}s\n"
PLAN_ID=$(python3 - "$OUT_DIR/gen-$TS.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
for k in ("meal_id","plan_id","id","written_plan_id"):
    if isinstance(d.get(k),str) and d[k]: print(d[k]); break
else:
    m=d.get("meal") or {}
    print(m.get("id") or m.get("plan_id") or "")
PY
)
if [ -z "$PLAN_ID" ]; then echo "   pas d'identifiant dans la réponse — clés: $(python3 -c 'import json,sys;print(sorted(json.load(open(sys.argv[1])).keys())[:16])' "$OUT_DIR/gen-$TS.json")"; exit 1; fi
echo "   plan écrit: $PLAN_ID"
echo "② meal-energy-v1 comme Julie"
curl -s --max-time 120 -X POST "$API_URL/functions/v1/meal-energy-v1" \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d "{\"plan_ids\":[\"$PLAN_ID\"]}" -o "$OUT_DIR/energy-$TS.json" -w "   http=%{http_code} en %{time_total}s\n"
python3 - "$OUT_DIR/energy-$TS.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print(f"   show={d.get('show')} reason={d.get('reason')} switch_offerable={d.get('switch_offerable')}")
for p in (d.get('plans') or []):
    g=p.get('boxes_gate') or {}
    print(f"   plan {str(p.get('plan_id'))[:8]} · boîtes à un nom={g.get('single')} rendues={g.get('emitted')} illisibles={g.get('unreadable')} bouche inconnue={g.get('unknown_mouth')} refusées={g.get('refused')}")
    for b in (p.get('boxes') or [])[:6]:
        print(f"      ❄ {b.get('box_id')}  bouche {str(b.get('member_id'))[:8]}  {b.get('kcal')} kcal  ({b.get('basis')})")
PY
echo "   fichiers: $OUT_DIR/gen-$TS.json · $OUT_DIR/energy-$TS.json"
