#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LA CHIRURGIE LOCALE DE BOUT EN BOUT — 2026-09-09 (pièce 5)
#
#   bash 31-bout-en-bout.sh <fixture> [jours] ["<phrase>"]
#
# Le chemin que le front suit (PlanDraftDialog) :
#   A  composer (draft)                          → draft_id + plan A
#   ①  keel-read-note-v1 avec la phrase           → cells[] (rien d'écrit)
#   B  generate-household-meal-v1 edit_cells      → plan B, `edit`
#   diff A/B : la case visée change, le reste garde plat + quantités écrites.
# La phrase ne nomme PAS la case en dur : c'est le classifieur qui la lit.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
FIXTURE="${1:?duo|quatre|cinq}"; DAYS="${2:-2}"; PHRASE="${3:-}"
EMAIL="$(foyer_email "$FIXTURE")" || exit 2
FN="generate-household-meal-v1"
TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
T_SQL="$(psqlq -c "select to_char(now(),'YYYY-MM-DD HH24:MI:SS')")"
restore() {
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null </dev/null
  psqlq -c "delete from chat_messages where user_id='$U' and role='assistant' and created_at >= timestamp '$T_SQL' and content like 'J''ai %';" >/dev/null </dev/null
  echo "   ⤺ fixture restaurée"
}
trap restore EXIT INT TERM
psqlq -c "update student_meal_drafts set status='failed', error_code='bench_reset', finished_at=now() where user_id='$U' and status in ('pending','running');" >/dev/null </dev/null
TOMORROW="$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)"
STAMP="$(date +%Y%m%d-%H%M%S)"
FR=(x lundi mardi mercredi jeudi vendredi samedi dimanche)
call() { local out="$BANC_DIR/e2e-$1-$FIXTURE-$STAMP.json" try=0 r code
  while :; do try=$((try+1))
    r="$(curl -s -o "$out" -w '%{http_code} %{time_total}' --max-time 900 -X POST "$API_URL/functions/v1/$2" \
      -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$3")"
    code="${r%% *}"; [ -n "$code" ] && [ "$code" != "502" ] && [ "$code" != "000" ] && break
    echo "   ⚠️ $1: http=$code essai $try (${r##* } s)" >&2; [ "$try" -ge 3 ] && break; sleep 30
  done
  echo "   $1: http=$code · ${r##* } s · essais=$try" >&2; echo "$out"; }
echo "══ BOUT EN BOUT · $FIXTURE · $DAYS jours dès $TOMORROW"
BODY_A="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":$DAYS},\"intent\":\"draft\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"
A="$(call A "$FN" "$BODY_A")"
DRAFT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("draft_id") or "")' "$A")"
[ -z "$DRAFT" ] && { echo "⛔ A sans draft_id"; head -c 300 "$A"; exit 1; }
# La phrase, en français NATUREL, sur le dîner du dernier jour de A.
if [ -z "$PHRASE" ]; then
  DAYTOK="$(python3 -c '
import json,sys; d=json.load(open(sys.argv[1])); days=[]
for x in d.get("dishes") or []:
    if x.get("day") not in days: days.append(x.get("day"))
print(days[-1] if days else "")' "$A")"
  N=$(( $(printf '%s\n' mon tue wed thu fri sat sun | grep -n "^$DAYTOK$" | cut -d: -f1) ))
  PHRASE="${FR[$N]^} soir, plutôt du poulet et quelque chose de plus léger."
fi
echo "   A: draft_id=$DRAFT · phrase: « $PHRASE »"
R="$(call read keel-read-note-v1 "$(python3 -c 'import json,sys;print(json.dumps({"draft_note":sys.argv[1],"today":sys.argv[2],"starts_on":sys.argv[2]}))' "$PHRASE" "$TOMORROW")")"
CELLS="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(json.dumps(d.get("cells") or []))' "$R")"
echo "   ① lecture: cells=$CELLS · announced=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1])).get("announced") or []))' "$R")"
[ "$CELLS" = "[]" ] && { echo "⛔ aucune case lue — le front aurait recomposé"; exit 0; }
BODY_B="$(python3 -c 'import json,sys;a=json.loads(sys.argv[1]);a.update({"operation":"edit_cells","draft_id":sys.argv[2],"cells":json.loads(sys.argv[3])});print(json.dumps(a))' "$BODY_A" "$DRAFT" "$CELLS")"
B="$(call B "$FN" "$BODY_B")"
python3 - "$A" "$B" "$CELLS" <<'PY'
import json,sys
A=json.load(open(sys.argv[1])); B=json.load(open(sys.argv[2])); targets={(c["day"],c["slot"]) for c in json.loads(sys.argv[3])}
if "error" in B: print("   ⛔ B refusé:", B.get("error"), B.get("detail")); sys.exit(0)
print("   edit:", json.dumps(B.get("edit"), ensure_ascii=False))
def cells(d):
    return {(x.get("day"),x.get("slot"),x.get("member_id") or "table"):(x.get("title") or x.get("name"), [(i.get("term"),i.get("quantity")) for i in (x.get("ingredients") or [])]) for x in (d.get("dishes") or [])}
ca,cb=cells(A),cells(B); ident=changed=0
for k in sorted(set(ca)|set(cb), key=lambda k:(str(k[0]),str(k[1]),str(k[2]))):
    a=ca.get(k); b=cb.get(k); same=a==b; tgt=(k[0],k[1]) in targets
    if not tgt: ident+=same; changed+=(not same)
    print(f"      {'=' if same else '≠'} {k[0]:>3} {k[1]:<9} {str(k[2])[:5]:<5} | {(a or ('—',))[0][:34]:<34} | {(b or ('—',))[0][:34]:<34} {'◀ visée' if tgt else ''}")
print(f"   hors case visée (plat + quantités écrites): identiques={ident} · changées={changed}")
PY
echo "   → $A · $R · $B"
