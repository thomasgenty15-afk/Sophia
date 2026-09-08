#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LOCALITÉ D'UNE REPRISE — 2026-09-09
#
#   bash 26-localite.sh <fixture> [jours]
#
# Question: quand la phrase vise UNE case (« mardi soir, pas de X, plutôt du
# poulet »), la recomposition ne touche-t-elle que cette case, ou tout le plan ?
#
# Protocole, un seul état par tir, rien d'autre changé:
#   A  compose (draft, N jours, sans phrase)          → plan A
#   C  compose à l'identique                           → plan C   (variance du modèle)
#   ①  keel-read-note-v1 avec une phrase construite SUR A (le dîner du 2e jour)
#   B  compose (sans phrase, le magasin porte l'effet) → plan B
#   diff cases A/C (bruit) et A/B (bruit + effet). Fixture restaurée à la fin.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
FIXTURE="${1:?duo|quatre|cinq}"; DAYS="${2:-2}"
EMAIL="$(foyer_email "$FIXTURE")" || exit 2
FN="generate-household-meal-v1"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
T_SQL="$(psqlq -c "select to_char(now(),'YYYY-MM-DD HH24:MI:SS')")"
restore() {
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null </dev/null
  psqlq -c "delete from chat_messages where user_id='$U' and role='assistant' and created_at >= timestamp '$T_SQL' and content like 'J''ai %';" >/dev/null </dev/null
  local b; b="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  [ "$b" = "$PC0" ] && echo "   ⤺ fixture restaurée ✓" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
trap restore EXIT INT TERM
TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
TOMORROW="$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":$DAYS},\"intent\":\"draft\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"

compose() { # <label> → fichier
  local out="$BANC_DIR/loc-$1-$FIXTURE-$STAMP.json" try=0 r code
  while :; do
    try=$((try+1))
    r="$(curl -s -o "$out" -w '%{http_code} %{time_total}' --max-time 900 -X POST "$API_URL/functions/v1/$FN" \
      -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
    code="${r%% *}"
    [ "$code" = "200" ] && break
    echo "   ⚠️ $1: http=$code à l'essai $try (${r##* } s)" >&2
    [ "$try" -ge 3 ] && break
    sleep 30
  done
  echo "   $1: http=$code · ${r##* } s · essais=$try · plats=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1])).get("dishes") or []))' "$out")" >&2
  echo "$out"
}
echo "══ LOCALITÉ · $FIXTURE · $DAYS jours dès $TOMORROW"
A="$(compose A)"
C="$(compose C)"
# ① la phrase, construite sur A: le dîner du dernier jour, son premier ingrédient
NOTE="$(python3 - "$A" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ds=d.get("dishes") or []
FR={"mon":"lundi","tue":"mardi","wed":"mercredi","thu":"jeudi","fri":"vendredi","sat":"samedi","sun":"dimanche"}
days=[]
for x in ds:
    if x.get("day") not in days: days.append(x.get("day"))
target=[x for x in ds if x.get("slot")=="dinner" and x.get("day")==days[-1] and x.get("member_id") in (None,"")]
if not target: target=[x for x in ds if x.get("slot")=="dinner"]
if not target: sys.exit("pas de dîner dans A")
t=target[0]; ing=(t.get("ingredients") or [{}])[0].get("term","")
print(f"{FR.get(t['day'],t['day']).capitalize()} soir, pas de {ing} — plutôt du poulet.")
PY
)" || { echo "⛔ $NOTE"; exit 1; }
echo "   ① phrase: « $NOTE »"
RN="$BANC_DIR/loc-readnote-$FIXTURE-$STAMP.json"
r="$(curl -s -o "$RN" -w '%{http_code} %{time_total}' --max-time 120 -X POST "$API_URL/functions/v1/keel-read-note-v1" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"draft_note":sys.argv[1],"today":sys.argv[2],"starts_on":sys.argv[2]}))' "$NOTE" "$TOMORROW")")"
echo "   ① lecture: http=${r%% *} · ${r##* } s"; python3 -c '
import json,sys; d=json.load(open(sys.argv[1]))
print("      ok=",d.get("ok"),"reason=",d.get("reason"))
for a in d.get("announced") or []: print("      · "+((a.get("who")+" : ") if a.get("who") else "")+a.get("text",""))
print("      questions=",len(d.get("questions") or []),"counters=",json.dumps(d.get("counters")))' "$RN"
echo "   magasin après ①: retained=$(psqlq -c "select coalesce(jsonb_array_length(case when jsonb_typeof(practical_constraints->'retained_items')='array' then practical_constraints->'retained_items' else '[]' end),0) from student_goals where user_id='$U'") next_plan=$(psqlq -c "select coalesce(jsonb_array_length(case when jsonb_typeof(practical_constraints->'retained_next_plan')='array' then practical_constraints->'retained_next_plan' else '[]' end),0) from student_goals where user_id='$U'")"
B="$(compose B)"
echo "   → $A · $C · $B"
python3 - "$A" "$C" "$B" "$NOTE" <<'PY'
import json,sys
A,C,B=[json.load(open(p)) for p in sys.argv[1:4]]; note=sys.argv[4]
def cells(d):
    out={}
    for x in d.get("dishes") or []:
        k=(x.get("day"),x.get("slot"),x.get("member_id") or "table")
        out[k]=(x.get("title") or x.get("name"), sorted(i.get("term","") for i in (x.get("ingredients") or [])))
    return out
def diff(a,b,label):
    ka,kb=set(a),set(b); same=[k for k in ka&kb if a[k][0]==b[k][0]]
    sameing=[k for k in ka&kb if a[k][1]==b[k][1]]
    changed=[k for k in ka&kb if a[k][0]!=b[k][0]]
    print(f"\n   {label}: cases A={len(ka)} · communes={len(ka&kb)} · même plat={len(same)} · mêmes ingrédients={len(sameing)} · plat changé={len(changed)} · absentes={len(ka-kb)} · nouvelles={len(kb-ka)}")
    for k in sorted(ka|kb, key=lambda k:(str(k[0]),str(k[1]),str(k[2]))):
        ta=a.get(k,("—",[]))[0]; tb=b.get(k,("—",[]))[0]
        mark="=" if ta==tb else "≠"
        print(f"      {mark} {k[0]:>3} {k[1]:<9} {str(k[2])[:5]:<5} | {ta[:38]:<38} | {tb[:38]}")
ca,cc,cb=cells(A),cells(C),cells(B)
print("   phrase: «",note,"»")
diff(ca,cc,"A→C (rien changé: le bruit)")
diff(ca,cb,"A→B (après la phrase)")
PY
