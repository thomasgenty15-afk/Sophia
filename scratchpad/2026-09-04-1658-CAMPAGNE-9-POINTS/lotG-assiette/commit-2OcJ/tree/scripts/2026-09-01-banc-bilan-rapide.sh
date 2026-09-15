#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 2 — LA CLASSIFICATION DU BILAN, SUR UN SEUL PLAN
# ═══════════════════════════════════════════════════════════════════════════
#
# ── POURQUOI CE SECOND BANC EXISTE, ET CE QU'IL SACRIFIE ──────────────────
# `2026-09-01-banc-bilan-plan.sh` génère un plan RÉEL par cas, parce que la
# base n'accepte qu'un bilan par plan (`unique (meal_id)`). C'est fidèle, et
# c'est impraticable ici: le conteneur edge est recréé par son superviseur
# toutes les ~30 s (`policy = "per_worker"`), et huit générations de 90 s ne
# passent pas.
#
# ⛔ CE QUI EST SACRIFIÉ, ÉCRIT ICI POUR QUE PERSONNE NE LE DÉCOUVRE PLUS TARD:
# ce banc RETIRE la ligne de bilan entre deux cas. Le produit ne le fait
# JAMAIS. Il ne prouve donc rien sur « une seule fois par fenêtre » — c'est
# exactement ce que le cas I mesure, et le cas I est le seul à ne pas purger.
#
# ⚠️ CE QUI N'EST PAS SACRIFIÉ, ET C'EST LA RAISON D'ÊTRE DU RACCOURCI:
# `retainedItemsFromPlanFeedback` est du code DÉTERMINISTE qui lit les
# RÉPONSES et les RÉGLAGES COURANTS. Il ne lit du plan que les titres de plats
# (pour `never_again` / `make_again`). Rejouer sur le même plan mesure donc la
# même chose — à condition de garder les vrais titres, ce qu'on fait.
#
# ⚠️ ET L'ÉTAT S'ACCUMULE, comme dans la vraie vie: les champs et l'index
# gardent ce que le cas précédent a écrit. C'est ce qui rend le cas E (l'index
# qui remonte) mesurable.
#
# Usage : scripts/2026-09-01-banc-bilan-rapide.sh <anon>

set -uo pipefail
ANON="${1:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon>" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="qa-foyer-retours@keeltest.dev"
OUT="${BANC_OUT:-/tmp/banc-bilan-rapide}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1"; }
USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
LEA=$(psql "select member_id from household_members where first_name='Léa' and household_id=public.keel_household_of('$USER_ID');" | tr -d ' ')
MEAL=$(psql "select id from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;" | tr -d ' ')
[ -n "$MEAL" ] || { echo "aucun plan: lance d'abord une génération" >&2; exit 1; }

JWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

snapshot() {
  psql "select json_build_object(
      'durable',       coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'field_changes', coalesce((select practical_constraints->'field_changes'  from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'cooking_time_min', (select practical_constraints->>'cooking_time_min' from student_goals where user_id='$USER_ID'),
      'recipe_difficulty',(select practical_constraints->>'recipe_difficulty' from student_goals where user_id='$USER_ID'),
      'variety',          (select practical_constraints->>'variety' from student_goals where user_id='$USER_ID')
    );" | tr -d '\n'
}

TITLES=$(psql "select coalesce(json_agg(d->>'title'), '[]'::json) from student_generated_meals m, jsonb_array_elements(m.dishes) d where m.id='$MEAL';" | tr -d '\n')

# ⚠️ `PURGE` = « ce cas repart d'un plan non noté ». Seul I vaut `no`.
CASES=(
"B|yes|cooked=no → le temps descend plus fort, ou plancher|{\"cooked\":\"no\"}"
"C|yes|portions=too_much → index −1|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"household\"}"
"D|yes|portions=way_too_much → magnitude clear|{\"cooked\":\"yes\",\"portions\":\"way_too_much\",\"portions_subject\":\"household\"}"
"E|yes|not_enough → l'index REMONTE|{\"cooked\":\"yes\",\"portions\":\"not_enough\",\"portions_subject\":\"household\"}"
"F|yes|sujet = Léa (MINEURE) → exclusion AVEC motif|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"member:LEA\"}"
"G|yes|titre ABSENT du plan → notInPlan|{\"cooked\":\"yes\",\"never_again\":[\"FAUX\"]}"
"H|yes|axe enough_variety = no|{\"cooked\":\"yes\",\"axis_question\":\"enough_variety\",\"axis_answer\":\"no\"}"
"I|no|SECOND bilan sur le même plan → already_answered|{\"cooked\":\"yes\"}"
)

echo "════════ BANC RAPIDE · bilan · plan $MEAL ════════"
for entry in "${CASES[@]}"; do
  C="${entry%%|*}"; r1="${entry#*|}"
  PURGE="${r1%%|*}"; r2="${r1#*|}"
  LABEL="${r2%%|*}"; PAYLOAD="${r2#*|}"

  # ⛔ LE CAS I NE PURGE PAS: c'est LUI qui mesure « une seule fois ».
  [ "$PURGE" = "yes" ] && psql "delete from meal_plan_feedback where meal_id='$MEAL';" >/dev/null

  BODY=$(python3 -c "
import json,sys
p=json.loads(sys.argv[1]); lea=sys.argv[3]; titles=json.loads(sys.argv[4])
p['meal_id']=sys.argv[2]
if p.get('portions_subject')=='member:LEA': p['portions_subject']='member:'+lea
if p.get('never_again')==['FAUX']: p['never_again']=['Un plat que ce plan ne contient pas']
print(json.dumps(p))" "$PAYLOAD" "$MEAL" "$LEA" "$TITLES")

  snapshot > "$OUT/$C.before.json"
  curl -s -o "$OUT/$C.out" -X POST "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "$BODY" --max-time 120
  snapshot > "$OUT/$C.after.json"
  echo "  cas $C · $LABEL"
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
for c in "BCDEFGHI":
    a = f"{out}/{c}.after.json"
    if not os.path.exists(a): continue
    B, A = json.load(open(f"{out}/{c}.before.json")), json.load(open(a))
    resp = json.load(open(f"{out}/{c}.out")) if os.path.getsize(f"{out}/{c}.out") else {}
    print(f"\n── cas {c}")
    print(f"   réponse    ok={resp.get('ok')} motif={resp.get('reason','—')}")
    r = resp.get("retained") or {}
    if r:
        ref = r.get("refused") or {}
        nz = {k: v for k, v in ref.items() if v and k != "total"}
        print(f"   items      produits={r.get('produced')} écrits={r.get('written')} "
              f"refusés={ref.get('total')} {nz if nz else ''}")
    for field in ("cooking_time_min", "recipe_difficulty", "variety"):
        if A.get(field) != B.get(field):
            print(f"   ⚑ CHAMP    {field} : {B.get(field)} → {A.get(field)}")
    new = [x for x in A["durable"] if x not in B["durable"]]
    for it in new:
        print(f"   écrit      {it.get('kind')} · sujet={it.get('subject')} · valeur={it.get('value')}")
        print(f"              « {it.get('text')} »  ← {it.get('quote')}")
    nf = [x for x in A["field_changes"] if x not in B["field_changes"]]
    for j in nf:
        print(f"   journal    {j.get('field')} : {j.get('previous')} → {j.get('next')}")
PY
