#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LA CHIRURGIE LOCALE, MESURÉE — 2026-09-09
#
#   bash 28-tir-edit.sh <fixture> [jours] ["<phrase pour la case>"]
#
# A = composer (draft, N jours) → draft_id + plan A.
# B = `operation: "edit_cells"` sur ce brouillon, UNE case (le dîner du
#     dernier jour de A) avec la phrase donnée (défaut: « plutôt du poulet »).
# Attendu: la case nommée change, TOUTES les autres sont identiques (plat,
# ingrédients, quantités), casseroles et courses comprises.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
FIXTURE="${1:?duo|quatre|cinq}"; DAYS="${2:-2}"; PHRASE="${3:-Plutôt du poulet, et quelque chose de plus léger.}"
EMAIL="$(foyer_email "$FIXTURE")" || exit 2
FN="generate-household-meal-v1"
TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
TOMORROW="$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)"
STAMP="$(date +%Y%m%d-%H%M%S)"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
call() { # <label> <body> → fichier
  local out="$BANC_DIR/edit-$1-$FIXTURE-$STAMP.json" try=0 r code
  while :; do
    try=$((try+1))
    r="$(curl -s -o "$out" -w '%{http_code} %{time_total}' --max-time 900 -X POST "$API_URL/functions/v1/$FN" \
      -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$2")"
    code="${r%% *}"
    [ -n "$code" ] && [ "$code" != "502" ] && [ "$code" != "000" ] && break
    echo "   ⚠️ $1: http=$code à l'essai $try (${r##* } s)" >&2
    [ "$try" -ge 3 ] && break
    sleep 30
  done
  echo "   $1: http=$code · ${r##* } s · essais=$try" >&2
  echo "$out"
}
# ⛔ UN BROUILLON RESTÉ `running` (tir tué par un redémarrage) tient l'index
# « un seul en vol par personne » et rend 409 `draft_in_flight` avant tout
# appel modèle. On le ferme en `failed`, comme la balayeuse le ferait à 7 min.
psqlq -c "update student_meal_drafts set status='failed', error_code='bench_reset', finished_at=now() where user_id='$U' and status in ('pending','running');" >/dev/null </dev/null
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "══ CHIRURGIE LOCALE · $FIXTURE · $DAYS jours dès $TOMORROW"
BODY_A="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":$DAYS},\"intent\":\"draft\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"
A="$(call A "$BODY_A")"
DRAFT="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("draft_id") or "")' "$A")"
[ -z "$DRAFT" ] && { echo "⛔ A sans draft_id"; head -c 300 "$A"; exit 1; }
echo "   A: draft_id=$DRAFT · source_text=$(psqlq -c "select coalesce(length(source_text),0) from student_meal_drafts where id='$DRAFT'") car."
CELL="$(python3 - "$A" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ds=d.get("dishes") or []
days=[]
for x in ds:
    if x.get("day") not in days: days.append(x.get("day"))
t=[x for x in ds if x.get("slot")=="dinner" and x.get("day")==days[-1]] or [x for x in ds if x.get("slot")=="dinner"]
if not t: sys.exit("pas de dîner dans A")
print(json.dumps({"day":t[0]["day"],"slot":"dinner"}))
PY
)" || { echo "⛔ $CELL"; exit 1; }
BODY_B="$(python3 -c '
import json,sys
a=json.loads(sys.argv[1]); c=json.loads(sys.argv[2])
a["operation"]="edit_cells"; a["draft_id"]=sys.argv[3]; a["cells"]=[{"day":c["day"],"slot":c["slot"],"text":sys.argv[4]}]
print(json.dumps(a))' "$BODY_A" "$CELL" "$DRAFT" "$PHRASE")"
echo "   case visée: $CELL · phrase: « $PHRASE »"
B="$(call B "$BODY_B")"
python3 - "$A" "$B" "$CELL" <<'PY'
import json,sys
A=json.load(open(sys.argv[1])); B=json.load(open(sys.argv[2])); cell=json.loads(sys.argv[3])
if "error" in B: print("   ⛔ B refusé:", B.get("error"), B.get("detail"), json.dumps(B.get("edit")) ); sys.exit(0)
print("   edit:", json.dumps(B.get("edit"), ensure_ascii=False))
def cells(d):
    out={}
    for x in d.get("dishes") or []:
        k=(x.get("day"),x.get("slot"),x.get("member_id") or "table")
        # CE QUE LA PERSONNE LIT: le plat et les quantités ÉCRITES. Les grammes
        # calculés (facteur d'assiette, répartition des casseroles) sont
        # re-dérivés par les ceintures sur tout le plan — comparés à part.
        out[k]=(x.get("title") or x.get("name"), [(i.get("term"),i.get("quantity")) for i in (x.get("ingredients") or [])])
    return out
ca,cb=cells(A),cells(B)
target=(cell["day"],cell["slot"])
ident=changed=0
for k in sorted(set(ca)|set(cb), key=lambda k:(str(k[0]),str(k[1]),str(k[2]))):
    a=ca.get(k); b=cb.get(k)
    same = a==b
    mark = "=" if same else "≠"
    tag = "◀ visée" if (k[0],k[1])==target else ""
    if (k[0],k[1])!=target:
        ident+=same; changed+= (not same)
    print(f"      {mark} {k[0]:>3} {k[1]:<9} {str(k[2])[:5]:<5} | {(a or ('—',))[0][:34]:<34} | {(b or ('—',))[0][:34]:<34} {tag}")
print(f"   hors case visée (plat + quantités écrites): identiques={ident} · changées={changed}")
def grams(d): return {(x.get("day"),x.get("slot"),x.get("member_id") or "table",i.get("term")):round(i.get("grams_raw") or 0) for x in (d.get("dishes") or []) for i in (x.get("ingredients") or [])}
ga,gb=grams(A),grams(B); drift=[(k,ga[k],gb[k]) for k in ga if k in gb and (k[0],k[1])!=target and ga[k]!=gb[k]]
big=[d for d in drift if abs(d[1]-d[2])>max(2,0.05*max(d[1],d[2]))]
print(f"   grammes calculés hors case visée: {len(drift)} lignes re-dérivées, dont {len(big)} au-delà de 5 % : {[(k[3],a,b) for k,a,b in big][:6]}")
def preps(d): return sorted((p.get("id"),p.get("title")) for p in (d.get("preparations") or []))
def shop(d): return sorted((s.get("term"),s.get("quantity")) for s in (d.get("shopping_list") or []))
pa,pb=preps(A),preps(B); sa,sb=shop(A),shop(B)
print(f"   casseroles: A={len(pa)} B={len(pb)} communes={len(set(pa)&set(pb))} · courses: A={len(sa)} B={len(sb)} communes={len(set(sa)&set(sb))}")
PY
docker logs supabase_edge_runtime_Sophia_2 --since "$SINCE" 2>&1 | grep -o '{"tag":"keel.household_meal.cell_edit"[^}]*}' | head -2
echo "   → $A · $B"
