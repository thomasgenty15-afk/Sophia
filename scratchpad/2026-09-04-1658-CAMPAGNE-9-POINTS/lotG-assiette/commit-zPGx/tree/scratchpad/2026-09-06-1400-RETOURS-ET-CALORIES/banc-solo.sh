#!/usr/bin/env bash
# Tir SOLO : pose une exclusion sur qa-9pts-solo, tire un brouillon 7 j, lit la ceinture solo.
set -uo pipefail
CAS="$1"; ITEMS="${2:-}"
REPO="/Users/ahmedamara/Dev/Sophia 2"; C9="$REPO/scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS"
FB=/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/f112d7c6-5b04-419f-95a4-51a5b6f6c7f9/scratchpad/FB
psql() { docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1"; }
U=$(psql "select id from auth.users where email='qa-9pts-solo@keeltest.dev';")
PC0=$(psql "select practical_constraints::text from student_goals where user_id='$U';")
restore() { psql "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null; }
trap restore EXIT
[ -n "$ITEMS" ] && psql "update student_goals set practical_constraints = practical_constraints || jsonb_build_object('retained_items', '$(printf '%s' "$ITEMS" | sed "s/'/''/g")'::jsonb) where user_id='$U';" >/dev/null
echo "═══════ $CAS — $(date +%H:%M:%S) · retenu: ${ITEMS:-∅}"
( cd "$C9" && bash 20-run.sh "$CAS" solo 7 balanced 2 2>&1 | sed 's/^/   /' | tail -5 )
restore
PLAN=$(ls -t "$C9"/plan-"$CAS"-*.json | head -1); LOG=$(ls -t "$C9"/log-"$CAS"-*.txt | head -1); cp "$PLAN" "$LOG" "$FB/"
echo "── ceinture solo (journal)"; grep -o '{"tag":"keel.meal.exclusion_belt".*' "$LOG" | tail -1
grep -o '{"tag":"keel.meal.empty_slots_retry".*' "$LOG" | tail -1 | cut -c1-200
python3 - "$PLAN" "$ITEMS" <<'PY'
import json,sys,unicodedata
d=json.load(open(sys.argv[1])); items=json.loads(sys.argv[2]) if sys.argv[2].strip() else []
n=lambda s: unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode().lower()
preps={p.get("id"):p for p in d.get("preparations",[])}
def surf(x):
    t=[x.get("title","")]+[i.get("term","") for i in x.get("ingredients") or []]
    for u in x.get("uses") or []:
        p=preps.get(u.get("preparation_id") if isinstance(u,dict) else u) or {}
        t+=[p.get("title","")]+[i.get("term","") for i in p.get("ingredients") or p.get("items") or []]
    return n(" ".join(map(str,t)))
for it in items:
    if it.get("kind")!="food.exclude": continue
    words=[w for w in n(it["text"]).split() if len(w)>=3]
    hits=[(x.get("day"),x.get("slot"),x.get("title")) for x in d.get("dishes",[]) if all(w in surf(x) for w in words)]
    print(f"   « {it['text']} » : {len(hits)} plat(s) servis qui le portent", hits[:4])
print("   plats:", len(d.get("dishes",[])), "· empty_slots:", [i for i in d.get("issues",[]) if i.startswith("empty_slots")][:1], "· issues avoid:", len([i for i in d.get("issues",[]) if "asked to avoid" in i]))
PY
echo "FIN $CAS $(date +%H:%M:%S)"
