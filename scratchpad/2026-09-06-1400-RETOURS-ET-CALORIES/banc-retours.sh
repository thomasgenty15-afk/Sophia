#!/usr/bin/env bash
# BANC « UN RETOUR ET LES CALORIES » — 2026-09-06
# Usage : banc-retours.sh <cas> '<retained_items json>' ['<retained_next_plan json>']
# Pose l'état retenu sur qa-9pts-quatre, tire UN brouillon de 7 jours via 20-run.sh
# (fixture restaurée par lui), lit les kcal par bouche (lecture-74.sh), cherche les
# fuites (terme exclu présent dans une boîte de la bouche exclue), remet l'état.
set -uo pipefail
CAS="$1"; ITEMS="${2:-}"; NEXT="${3:-}"
REPO="/Users/ahmedamara/Dev/Sophia 2"; C9="$REPO/scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS"
CM="$REPO/scratchpad/2026-09-05-2020-CAMPAGNE-MESURE"
FB=/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/f112d7c6-5b04-419f-95a4-51a5b6f6c7f9/scratchpad/FB
psql() { docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1"; }
U=$(psql "select id from auth.users where email='qa-9pts-quatre@keeltest.dev';")
PC0=$(psql "select practical_constraints::text from student_goals where user_id='$U';")
restore() { psql "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null; }
trap restore EXIT
if [ -n "$ITEMS" ]; then
  psql "update student_goals set practical_constraints = practical_constraints || jsonb_build_object('retained_items', '$(printf '%s' "$ITEMS" | sed "s/'/''/g")'::jsonb) where user_id='$U';" >/dev/null
fi
if [ -n "$NEXT" ]; then
  psql "update student_goals set practical_constraints = practical_constraints || jsonb_build_object('retained_next_plan', '$(printf '%s' "$NEXT" | sed "s/'/''/g")'::jsonb) where user_id='$U';" >/dev/null
fi
echo "═══════ $CAS — $(date +%H:%M:%S)"
echo "   retenu: ${ITEMS:-∅} ${NEXT:+· encart: $NEXT}"
psql "select count(*) from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) i where g.user_id='$U';" | sed 's/^/   items en base: /'
( cd "$C9" && bash 20-run.sh "$CAS" quatre 7 balanced 2 2>&1 | sed 's/^/   /' | tail -6 )
restore
PLAN=$(ls -t "$C9"/plan-"$CAS"-*.json | head -1); LOG=$(ls -t "$C9"/log-"$CAS"-*.txt | head -1)
cp "$PLAN" "$FB/"; cp "$LOG" "$FB/"
echo "── énergie par bouche"
bash "$CM/lecture-74.sh" "$PLAN" quatre 2>&1 | sed 's/^/   /'
echo "── ceinture d'exclusion (journal)"
grep -o '{"tag":"keel.household_meal.exclusion_belt".*' "$LOG" | tail -1 | python3 -c "
import json,sys
try:
  d=json.loads(sys.stdin.read()); print('  ', {k:d.get(k) for k in ('terms','terms_unallocated','mouths','checked','kept','refused','bites','separated','not_separated','box_scoped','bites_before','bites_after','retried')})
except Exception: print('   (aucune ligne exclusion_belt)')"
grep -o '{"tag":"keel.household_meal.retained_items".*' "$LOG" | tail -1 | python3 -c "
import json,sys
try:
  d=json.loads(sys.stdin.read()); print('   retained_items:', {k:d.get(k) for k in ('composition','served','unrouted','refused','other_subjects','craving')})
except Exception: print('   (aucune ligne retained_items)')"
grep -o '{"tag":"keel.household_meal.composition\b.*' "$LOG" | tail -1 | cut -c1-300 | sed 's/^/   /'
echo "── fuites : terme exclu dans une boîte de la bouche exclue (heuristique de banc, sous-chaîne normalisée)"
python3 - "$PLAN" "$C9/roster-quatre.json" "$ITEMS" <<'PY'
import json,sys,unicodedata,re
plan=json.load(open(sys.argv[1])); roster={r["member_id"]:r["first_name"] for r in json.load(open(sys.argv[2]))}
items=json.loads(sys.argv[3]) if sys.argv[3].strip() else []
def norm(s): return re.sub(r"\s+"," ",unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode().lower())
preps={p.get("id"):p for p in plan.get("preparations",[])}
def dish_text(d):
    t=[d.get("title","")]+[i.get("term","") for i in d.get("ingredients") or d.get("items") or []]
    for pid in d.get("preparation_ids") or ([d.get("preparation_id")] if d.get("preparation_id") else []):
        p=preps.get(pid) or {}; t+= [p.get("title","")]+[i.get("term","") for i in p.get("items") or p.get("ingredients") or []]
    return norm(" ".join(map(str,t)))
leaks=0; checked=0
for it in items:
    if it.get("kind")!="food.exclude": continue
    term=norm(it["text"]); subj=it.get("subject","household")
    for d in plan.get("dishes",[]):
        for b in d.get("boxes") or []:
            mids=b.get("member_ids") or []
            hit = subj=="household" or any(f"member:{m}"==subj for m in mids)
            if not hit: continue
            checked+=1
            btxt=norm(" ".join(str(i.get("term","")) for i in b.get("items") or []))+" "+dish_text(d)
            if term in btxt:
                leaks+=1; print(f"   ⛔ fuite: « {it['text']} » ({subj[:14]}) dans {d.get('day')}/{d.get('slot')} « {d.get('title')} » boîte {[roster.get(m,m[:6]) for m in mids]}")
print(f"   boîtes vérifiées {checked} · fuites {leaks}")
PY
echo "FIN $CAS $(date +%H:%M:%S)"
