#!/usr/bin/env bash
# LECTURE SEULE d'un plan tiré par la campagne (session 74) — aucune génération, aucune écriture
# sous supabase/functions/. Usage : bash lecture-74.sh <plan.json> <solo|duo|quatre|cinq>
# Rend : cible par bouche (fonctions de production), kcal/protéine livrés dans les boîtes par
# bouche et par jour, termes non résolus (= sous-mesure), compteurs d'ancre, explication IA.
set -uo pipefail
PLAN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; FIX="$2"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
C9="$REPO/scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS"
REF="$REPO/scratchpad/2026-08-23-EVAL-QUALITE/ref"
echo "════ $(basename "$PLAN") · $FIX"
if [ "$FIX" = "solo" ]; then
  ( cd "$REPO" && deno run --allow-read --allow-env --allow-net scratchpad/2026-08-23-EVAL-QUALITE/analyse.ts "$REF" "$PLAN" "$C9/corps-solo.json" 2>/dev/null ) > "${PLAN%.json}.analyse74"
  python3 - "${PLAN%.json}.analyse74" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); e=d["envelope"]["energy"]
full=[x for x in d["days"] if x["complete"]]
for x in d["days"]:
    print(f"  {x['day']}  {x['kcal']:5d} kcal  {x['protein_g']:4d} g  {'complet' if x['complete'] else x['counted']}")
if full:
    m=sum(x["kcal"] for x in full)/len(full); p=sum(x["protein_g"] for x in full)/len(full)
    print(f"  jours complets ({len(full)}) : {m:.0f} kcal/j = {100*m/e['low']:.0f} % de {e['low']}–{e['high']} · protéine {p:.0f} g = {100*p/d['envelope']['proteinFloorG']:.0f} %")
r=d["verdict"]["resolution"]
print(f"  verdict: {d['verdict']['energy']} {d['verdict']['protein']} {d['verdict']['density']} · résolution {r['resolved']}/{r['total']} · non résolus: {d.get('unresolved_terms')}")
PY
else
  ROSTER="$C9/roster-$FIX.json"
  echo "── cibles (production)"; ( cd "$REPO" && deno run --allow-read "$C9/41-cibles-quatre.ts" "$ROSTER" 2>/dev/null )
  echo "── livré dans les boîtes (bac divisé par ses mangeurs)"
  ( cd "$REPO" && deno run --allow-read --allow-env --allow-net "$C9/40-boites.ts" "$REF" "$PLAN" "$ROSTER" 2>&1 | grep -E "^[A-Z][A-Za-zé]+( +[0-9]+){4,5}$|termes non résolus|^MOYENNE|^MASSE NON" | head -12 )
  python3 - "$PLAN" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); h=d.get("household") or {}; bs=h.get("box_sizing") or {}
print("── compteurs")
for k in ("anchor","unmet","unmet_band"): print(f"  {k}: {json.dumps(bs.get(k))}")
dz=bs.get("densify") or {}; print(f"  densify: moved {dz.get('moved_g')} g · closed {dz.get('closed_kcal')} kcal · remaining_gte_200 {dz.get('remaining_gte_200')} · stopped {json.dumps(dz.get('stopped'))}")
md=h.get("meals_delivered") or {}; print(f"  meals_delivered: missing {md.get('missing')} · retry_attempts {md.get('retry_attempts')} · merged {md.get('retry_merged_cells')}")
rb=h.get("regime_belt") or {}; print(f"  regime_belt: bites {rb.get('bites')} separated {rb.get('separated')} refused {rb.get('refused')} citation_repaired {rb.get('citation_repaired')} item_repaired {rb.get('item_repaired')}")
boxes=[b for dsh in d.get("dishes",[]) for b in (dsh.get("boxes") or [])]
tot=[sum((i.get("grams") or 0) for i in b.get("items",[])) for b in boxes if len(b.get("member_ids") or [])==1]
if tot: print(f"  boîtes à un nom: {len(tot)} · g moyens {sum(tot)/len(tot):.0f} · min {min(tot)} · max {max(tot)}")
PY
fi
python3 - "$PLAN" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ex=d.get("explanation")
print("── explication IA:", "ABSENTE" if ex is None else json.dumps(ex,ensure_ascii=False)[:700])
titles=[x["title"] for x in d.get("dishes",[])]
days=sorted({x.get("day") for x in d.get("dishes",[])}); w=d.get("window") or {}
print(f"── plats: {len(titles)} · titres distincts {len(set(titles))} · jours composés {len(days)} (fenêtre {w.get('days') or w.get('count') or w}) · sessions {len(d.get('cooking_sessions') or [])} · issues {len(d.get('issues',[]))}")
PY
