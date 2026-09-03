#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LE BANC DU BILAN DE FIN DE PLAN — LOT B (2026-09-03)
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : `docs/keel/NOMENCLATURE-MEMOIRE.md` §8.2 — c'est LUI que ce banc
# teste, cas par cas. L'attendu est écrit ICI, et il est celui du doc.
#
# ⛔ UN BILAN PAR PLAN (`unique (meal_id)`). Chaque cas exige donc un plan
# NEUF — d'où une génération réelle par cas. Supprimer la ligne de bilan entre
# les cas serait moins cher et mesurerait autre chose : le produit ne le fait
# jamais, et le cas I existe précisément pour vérifier le refus du second.
#
# ⚠️ ON NE PURGE RIEN. L'état s'accumule d'un cas au suivant — c'est ce que
# vit une vraie personne, et c'est ce qui rend le cas E (l'indice qui revient à
# zéro) mesurable.
#
# Usage : scripts/2026-09-03-1700-banc-bilan-v2.sh <anon> [lettre du cas]
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [cas]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${BANC_EMAIL:-qa-3portes@keeltest.dev}"
OUT="${BANC_OUT:-/tmp/banc-bilan-v2}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
CLAIRE=$(psql "select member_id from household_members where household_id='$HH' and first_name='Claire';" | tr -d ' ')
LEA=$(psql "select member_id from household_members where household_id='$HH' and first_name='Léa';" | tr -d ' ')
TOM=$(psql "select member_id from household_members where household_id='$HH' and first_name='Tom';" | tr -d ' ')
TODAY=$(date +%F)
echo "foyer $HH · Claire=$CLAIRE · Léa=$LEA · Tom=$TOM"

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}

# ⚠️ L'ÉTAT COMPLET : les champs (les trois indices), le journal, les trois
# magasins. Un cas peut « réussir » dans la ligne de bilan et n'avoir déplacé
# aucun réglage — c'est très exactement ce que ce banc existe pour voir.
snapshot() {
  psql "
    select json_build_object(
      'fields', (select jsonb_build_object(
          'cooking_time_min', practical_constraints->'cooking_time_min',
          'recipe_difficulty', practical_constraints->'recipe_difficulty',
          'variety', practical_constraints->'variety')
        from student_goals where user_id='$USER_ID'),
      'journal', coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'durable', coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'memo', coalesce((select practical_constraints->'memo' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'next_plan', coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb)
    );" | tr -d '\n'
}

last_meal() {
  psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' '
}
# Le premier aliment du plan — la liste FERMÉE des deux questions de plat.
first_food() {
  psql "select i->>'term' from student_generated_meals m, jsonb_array_elements(m.dishes) d, jsonb_array_elements(d->'ingredients') i where m.id='$1' limit 1;" | tr -d '\n'
}

# ── LES CAS DU §8.2 ────────────────────────────────────────────────────────
# lettre|ce qu'on attend|le corps (FOOD est substitué au tir)
CASES=(
"A|cooked=partly seul → RIEN sur les indices, journal vide|{\"cooked\":\"partly\"}"
"B|cooked=no → difficulty/speed REFUSÉES par la base|{\"cooked\":\"no\",\"difficulty\":\"too_hard\"}"
"C|portions=too_much household → −1 Claire, mineurs exclus|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"household\"}"
"J|difficulty=too_hard → recipe_difficulty descend d'un cran + journal cité|{\"cooked\":\"yes\",\"difficulty\":\"too_hard\"}"
"K|speed=too_long → cooking_time_min descend d'un BARREAU|{\"cooked\":\"yes\",\"speed\":\"too_long\"}"
"H|enough_variety=no → variety monte d'un cran|{\"cooked\":\"yes\",\"variety\":\"no\"}"
"M|never_again_foods=[{FOOD, Tom}] → food.exclude sujet Tom|{\"cooked\":\"yes\",\"never_again_foods\":[{\"food\":\"FOOD\",\"subject\":\"member:TOM\"}]}"
"G|un aliment ABSENT du plan → refus nommé, rien écrit|{\"cooked\":\"yes\",\"never_again_foods\":[{\"food\":\"zzz-inexistant\",\"subject\":\"household\"}]}"
"L|anything_else → note ③ pour Léa, 0 préférence|{\"cooked\":\"yes\",\"anything_else\":\"Léa doit bien manger le mardi, elle a danse\"}"
"N|anything_else raconte un repas → RIEN|{\"cooked\":\"yes\",\"anything_else\":\"On a mangé des pizzas mardi soir\"}"
"I|second bilan sur LE MÊME plan → already_answered|REPEAT"
)

echo "════════ BANC · bilan de fin de plan · lot B · $EMAIL ════════"
JWT=$(login)

for entry in "${CASES[@]}"; do
  C="${entry%%|*}"; rest="${entry#*|}"
  LABEL="${rest%%|*}"; BODY="${rest#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$C" ] && continue

  if [ "$BODY" = "REPEAT" ]; then
    MEAL=$(last_meal)   # ⛔ PAS de plan neuf : c'est le point du cas.
    BODY="${LAST_BODY:-{\"cooked\":\"yes\"\}}"
  else
    # ⛔ UN PLAN NEUF PAR CAS. Une génération qui échoue ferait retomber le cas
    # sur le plan PRÉCÉDENT — qui a déjà sa ligne de bilan — et le cas
    # mesurerait `already_answered` en croyant mesurer son sujet.
    GEN=$(python3 -c "
import json,sys
last=sys.argv[1]
b={'operation':'compose','mode':'to_shop','window':{'kind':'days','count':2}}
if last: b['intent']='replace_current'; b['replaces']=last
else: b['intent']='prepare_next'
print(json.dumps(b))" "$(last_meal)")
    CODE=$(curl -s -o "$OUT/$C.gen.json" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "$GEN" --max-time 800)
    if [ "$CODE" = "401" ]; then JWT=$(login); CODE=$(curl -s -o "$OUT/$C.gen.json" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d "$GEN" --max-time 800); fi
    if [ "$CODE" != "200" ]; then
      echo "  ⚠️ cas $C SAUTÉ — aucun plan neuf (HTTP $CODE)"
      continue
    fi
    MEAL=$(last_meal)
  fi

  FOOD=$(first_food "$MEAL")
  BODY="${BODY//FOOD/$FOOD}"
  BODY="${BODY//TOM/$TOM}"
  LAST_BODY="$BODY"

  snapshot > "$OUT/$C.before.json"
  SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  : > "$OUT/$C.log"
  docker logs --since "$SINCE" -f supabase_edge_runtime_Sophia_2 > "$OUT/$C.log" 2>&1 &
  LP=$!
  FULL=$(python3 -c "
import json,sys
b=json.loads(sys.argv[1]); b['meal_id']=sys.argv[2]; b['today']=sys.argv[3]
print(json.dumps(b))" "$BODY" "$MEAL" "$TODAY")
  HTTP=$(curl -s -o "$OUT/$C.out" -w "%{http_code}" -X POST "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "$FULL" --max-time 600)
  sleep 2
  kill $LP 2>/dev/null; wait $LP 2>/dev/null
  snapshot > "$OUT/$C.after.json"
  grep -o '{"tag":"keel/plan_feedback_retained".*' "$OUT/$C.log" | tail -1 > "$OUT/$C.counter.json"
  grep -o '{"tag":"keel/plan_feedback_free_text".*' "$OUT/$C.log" | tail -1 > "$OUT/$C.free.json"
  grep -o '{"tag":"keel/draft_note_classify".*' "$OUT/$C.log" | tail -1 > "$OUT/$C.classify.json"
  echo "  cas $C · HTTP $HTTP · $(head -c 120 "$OUT/$C.out")"
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" "$CLAIRE" "$LEA" "$TOM" <<'PY'
import json, os, sys
out, CLAIRE, LEA, TOM = sys.argv[1:5]
NAMES = {CLAIRE: "Claire", LEA: "Léa", TOM: "Tom", "household": "table"}
EXPECT = {
 "A": "rien sur les indices, journal vide",
 "B": "difficulty REFUSÉE (cooked=no)",
 "C": "portion −1 Claire, mineurs exclus",
 "J": "recipe_difficulty −1 cran + journal cité",
 "K": "cooking_time_min −1 BARREAU",
 "H": "variety +1 cran",
 "M": "food.exclude sujet Tom",
 "G": "refus notInPlan, rien écrit",
 "L": "note ③ Léa, 0 préférence",
 "N": "rien (raconte un repas)",
 "I": "already_answered",
}
def load(p):
    if not os.path.exists(p) or os.path.getsize(p) == 0: return None
    try: return json.loads(open(p).read().strip())
    except Exception: return None
def subj(s):
    return NAMES.get(str(s or "").split(":")[-1], str(s or ""))
for c in ["A","B","C","J","K","H","M","G","L","N","I"]:
    a, b = load(f"{out}/{c}.after.json"), load(f"{out}/{c}.before.json")
    if a is None: continue
    resp = open(f"{out}/{c}.out").read().strip() if os.path.exists(f"{out}/{c}.out") else ""
    print(f"\n── cas {c} · attendu : {EXPECT[c]}")
    print(f"   réponse    {resp[:120]}")
    if (b or {}).get("fields") != a.get("fields"):
        print(f"   champs     {(b or {}).get('fields')} → {a.get('fields')}")
    else:
        print(f"   champs     INCHANGÉS {a.get('fields')}")
    nb = len((b or {}).get("journal", [])); na = len(a.get("journal", []))
    if na > nb:
        for entry in a["journal"][:na-nb]:
            print(f"   +journal   {entry.get('field')}: {entry.get('previous')} → {entry.get('next')}")
            print(f"              cause « {str(entry.get('quote'))[:90]} »")
    for key, label in (("durable","①"),("memo","③"),("next_plan","encart")):
        bef = {json.dumps(x, sort_keys=True) for x in (b or {}).get(key, [])}
        for x in a.get(key, []):
            if json.dumps(x, sort_keys=True) in bef: continue
            it = x.get("item", x) if isinstance(x.get("item"), dict) else x
            print(f"   +{label}  {it.get('kind','note')} · {subj(it.get('subject'))} · « {it.get('text')} » (when={x.get('when')})")
    cnt = load(f"{out}/{c}.counter.json")
    if cnt:
        print(f"   extraction produit={cnt.get('produced')} écrit={cnt.get('written')} champs={cnt.get('fields_produced')}/{cnt.get('fields_written')} refus={json.dumps(cnt.get('refused'), ensure_ascii=False)}")
    free = load(f"{out}/{c}.free.json")
    if free: print(f"   champ libre {json.dumps({k:v for k,v in free.items() if k not in ('tag','user_id','meal_id')}, ensure_ascii=False)}")
    cls = load(f"{out}/{c}.classify.json")
    if cls: print(f"   classif    event={cls.get('event')} ① {cls.get('pref_kept')} ③ {cls.get('notes_kept')} encart {cls.get('next_kept')} skipped={cls.get('skipped')} (degree={cls.get('skipped_degree')} story={cls.get('skipped_meal_story')})")
PY
