#!/usr/bin/env bash
# LOT G — L'ASSIETTE PÈSE CE QU'ELLE NOURRIT : mesure AVANT/APRÈS sur les deux lanes.
#
# AVANT (prompt v26, « a palm of protein, a fist of starch ») :
#   C03 quatre/7j : table 3 192 kcal/j servis pour 8 571 demandés (37 %) ;
#                   Paul 740 kcal/j dans ses boîtes (déjeuner 652 g = plafond de masse → 386 kcal)
#   C01 solo/7j   : jours complets ~1 379 kcal/j pour 2 059–2 175 (67 %), protéine 93 g / 164
# APRÈS : un tirage chacun, `intent: draft`. ⚠️ UN TIRAGE NE FAIT PAS UN TAUX — ce qu'on lit,
# c'est si l'ordre de grandeur bouge (×2 attendu), pas un pourcentage au point près.
set -uo pipefail
. "$(dirname "$0")/00-env.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$CAMP_DIR/lotG-assiette"; mkdir -p "$OUT"
REF="$REPO/scratchpad/2026-08-23-EVAL-QUALITE/ref"
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong: 900 s" ) || echo "kong: extension KO"
echo "empreinte avant: tronc $(codeprint generate-household-meal-v1)"
grep -o 'MEAL_PROMPT_VERSION = "[^"]*"' "$REPO/supabase/functions/_shared/keel/meal_generation.ts"

for CAS in "C03 quatre" "C01 solo"; do
  set -- $CAS
  echo "══════ $1 ($2, 7 j) · $(date +%H:%M:%S)"
  bash "$HERE/20-run.sh" "$1" "$2" 7 2>&1 | tail -4
done

C03=$(ls -t "$CAMP_DIR"/plan-C03-*.json | head -1); C01=$(ls -t "$CAMP_DIR"/plan-C01-*.json | head -1)
cp "$C03" "$OUT/apres-C03.json"; cp "$C01" "$OUT/apres-C01.json"
echo "══════ C03 après — boîtes et journée entière"
( cd "$REPO" && deno run --allow-read --allow-env --allow-net "$HERE/40-boites.ts" "$REF" "$C03" "$HERE/roster-quatre.json" 2>&1 | grep -A6 "^bouche\|^jour\|MOYENNE" | head -30 )
python3 - "$C03" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); h=d.get("household",{})
for k in sorted(h):
    if any(t in k for t in ("box_sizing","anchor","unmet","densify","pot_demand","meals_delivered")):
        print(f"  {k}: {json.dumps(h[k],ensure_ascii=False)[:400]}")
print("  http ok:", d.get("ok"), "· issues:", len(d.get("issues",[])))
PY
echo "══════ C01 après — enveloppe solo"
( cd "$REPO" && deno run --allow-read --allow-env --allow-net scratchpad/2026-08-23-EVAL-QUALITE/analyse.ts "$REF" "$C01" "$HERE/corps-solo.json" 2>/dev/null > "$OUT/apres-C01-analyse.json" )
python3 - "$OUT/apres-C01-analyse.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
e=d["envelope"]["energy"]; print(f"  enveloppe {e['low']}–{e['high']} kcal/j · plancher protéine {d['envelope']['proteinFloorG']} g")
full=[x for x in d["days"] if x["complete"]]
for x in d["days"]: print(f"  {x['day']}  {x['kcal']:5d} kcal  {x['protein_g']:4d} g  {'complet' if x['complete'] else x['counted']}")
if full:
    m=sum(x["kcal"] for x in full)/len(full); p=sum(x["protein_g"] for x in full)/len(full)
    print(f"  jours complets ({len(full)}) : {m:.0f} kcal/j = {100*m/e['low']:.0f} % de la borne basse · protéine {p:.0f} g = {100*p/d['envelope']['proteinFloorG']:.0f} %")
print("  verdict:", json.dumps(d["verdict"]["energy"]), json.dumps(d["verdict"]["protein"]), json.dumps(d["verdict"]["density"]), "· résolution", d["verdict"]["resolution"]["resolved"], "/", d["verdict"]["resolution"]["total"])
PY
echo "empreinte après: tronc $(codeprint generate-household-meal-v1)"
