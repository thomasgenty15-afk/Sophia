#!/usr/bin/env bash
# LA REPRISE SEULE — sur un brouillon déjà rangé (pas de nouveau plan A).
#   bash 30-tir-edit-seul.sh <fixture> <draft_id> [day] [slot] ["<phrase>"]
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
FIXTURE="${1:?}"; DRAFT="${2:?draft_id}"; DAY="${3:-fri}"; SLOT="${4:-dinner}"; PHRASE="${5:-Plutôt du poulet, et quelque chose de plus léger.}"
EMAIL="$(foyer_email "$FIXTURE")" || exit 2
TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
psqlq -c "update student_meal_drafts set status='failed', error_code='bench_reset', finished_at=now() where user_id='$U' and status in ('pending','running');" >/dev/null </dev/null
ROW="$(psqlq -c "select starts_on||'|'||duration_days from student_meal_drafts where id='$DRAFT' and user_id='$U'")"
[ -z "$ROW" ] && { echo "⛔ brouillon introuvable"; exit 1; }
STARTS="${ROW%%|*}"; DAYS="${ROW#*|}"
STAMP="$(date +%Y%m%d-%H%M%S)"
A="$BANC_DIR/editonly-A-$FIXTURE-$STAMP.json"; B="$BANC_DIR/editonly-B-$FIXTURE-$STAMP.json"
psqlq -c "select response::text from student_meal_drafts where id='$DRAFT'" > "$A" </dev/null
BODY="$(python3 -c '
import json,sys
print(json.dumps({"operation":"edit_cells","draft_id":sys.argv[1],"cells":[{"day":sys.argv[2],"slot":sys.argv[3],"text":sys.argv[4]}],"window":{"kind":"exact","starts_on":sys.argv[5],"duration_days":int(sys.argv[6])},"intent":"draft","replaces":None,"context":None,"cooking_shape":None,"preferences":None}))' "$DRAFT" "$DAY" "$SLOT" "$PHRASE" "$STARTS" "$DAYS")"
echo "══ REPRISE SEULE · $FIXTURE · brouillon $DRAFT · $DAY $SLOT · « $PHRASE »"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
try=0; while :; do try=$((try+1))
  r="$(curl -s -o "$B" -w '%{http_code} %{time_total}' --max-time 900 -X POST "$API_URL/functions/v1/generate-household-meal-v1" \
    -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
  code="${r%% *}"; [ -n "$code" ] && [ "$code" != "502" ] && [ "$code" != "000" ] && break
  echo "   ⚠️ http=$code essai $try (${r##* } s)"; [ "$try" -ge 3 ] && break; sleep 40
done
echo "   B: http=$code · ${r##* } s · essais=$try"
python3 - "$A" "$B" "$DAY" "$SLOT" <<'PY'
import json,sys
A=json.load(open(sys.argv[1])); B=json.load(open(sys.argv[2])); target=(sys.argv[3],sys.argv[4])
if "error" in B: print("   ⛔ B refusé:", B.get("error"), B.get("detail"), json.dumps(B.get("edit"))); sys.exit(0)
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
ca,cb=cells(A),cells(B); ident=changed=0
for k in sorted(set(ca)|set(cb), key=lambda k:(str(k[0]),str(k[1]),str(k[2]))):
    a=ca.get(k); b=cb.get(k); same=a==b
    if (k[0],k[1])!=target: ident+=same; changed+=(not same)
    print(f"      {'=' if same else '≠'} {k[0]:>3} {k[1]:<9} {str(k[2])[:5]:<5} | {(a or ('—',))[0][:34]:<34} | {(b or ('—',))[0][:34]:<34} {'◀ visée' if (k[0],k[1])==target else ''}")
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
docker logs supabase_edge_runtime_Sophia_2 --since "$SINCE" 2>&1 | grep -o '{"tag":"keel.household_meal.cell_edit"[^}]*}' | head -1
echo "   → $B"
