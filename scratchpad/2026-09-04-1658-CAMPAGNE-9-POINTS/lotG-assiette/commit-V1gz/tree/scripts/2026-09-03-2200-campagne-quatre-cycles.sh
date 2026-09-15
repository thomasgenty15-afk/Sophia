#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LA CAMPAGNE DES QUATRE CYCLES — chantier « la mémoire à trois destinations »
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : le prompt maître §8. Ce banc ne mesure pas un lot, il mesure la
# BOUCLE : est-ce que ce qu'on écrit à un cycle change le plan du suivant, et
# est-ce qu'aucun magasin n'en double un autre ?
#
# ── LA RÈGLE QUI DÉCIDE DE LA QUALITÉ DE CE BANC ──────────────────────────
# Chaque écriture passe par LA PORTE QUE L'ÉCRAN APPELLE — le `draft_note` du
# corps de génération, la fonction `keel-plan-feedback-v1`. Jamais un `insert`.
# Un banc qui écrit en SQL mesure la base, pas le produit.
#
# ── LES QUATRE CYCLES ─────────────────────────────────────────────────────
#   1  plan → « mon fils n'aime pas le poisson »   → bilan portions=too_much,
#                                                     difficulty=too_hard
#   2  plan → « ma fille a danse le mardi soir »    → bilan speed=too_long,
#                                                     never_again=[<aliment du plan>]
#   3  plan → « j'ai envie de fajitas »             → bilan portions=not_enough,
#                                                     anything_else=« on mange tard le vendredi »
#   4  plan, puis VALIDÉ                            → l'encart du cycle 3 doit MOURIR
#
# ⚠️ `validated_at` EST L'HORLOGE DE L'ENCART DEPUIS LE LOT A, pas le
# calendrier. Le cycle 4 pose donc la validation et relit — c'est la seule
# façon de prouver la §2.5 autrement qu'en lisant le code.
#
# ⛔ AUCUNE PURGE ENTRE LES CYCLES. L'état s'accumule: c'est ce que vit une
# vraie personne, et c'est ce qui rend l'indice de portion mesurable
# (−1 au cycle 1, revenu à 0 au cycle 3).
#
# Usage : scripts/2026-09-03-2200-campagne-quatre-cycles.sh <anon> [cycle]
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [numéro de cycle]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${CAMPAGNE_EMAIL:-qa-3dest-20260903@keeltest.dev}"
OUT="${CAMPAGNE_OUT:-/tmp/campagne-3dest}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente: $EMAIL" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
CLAIRE=$(psql "select member_id from household_members where household_id='$HH' and first_name='Claire';" | tr -d ' ')
LEA=$(psql "select member_id from household_members where household_id='$HH' and first_name='Léa';" | tr -d ' ')
TOM=$(psql "select member_id from household_members where household_id='$HH' and first_name='Tom';" | tr -d ' ')
TODAY=$(date +%F)
echo "compte $USER_ID · foyer $HH · Claire=$CLAIRE Léa=$LEA Tom=$TOM"

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))"
}

last_meal() {
  psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' '
}

# ⚠️ L'ÉTAT COMPLET, EN BASE, À CHAQUE BORNE. Un cycle peut « réussir » côté
# HTTP et n'avoir déplacé aucun réglage — c'est très exactement ce que ce banc
# existe pour voir.
snapshot() {
  psql "
    select json_build_object(
      'items', coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'memo', coalesce((select practical_constraints->'memo' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'encart', coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'journal', coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'champs', (select jsonb_build_object(
          'cooking_time_min', practical_constraints->'cooking_time_min',
          'recipe_difficulty', practical_constraints->'recipe_difficulty',
          'variety', practical_constraints->'variety')
        from student_goals where user_id='$USER_ID'),
      'securite', (select count(*) from student_safety_constraints where user_id='$USER_ID'),
      'allergies', (select count(*) from household_member_allergies a join household_members m using (member_id) where m.household_id='$HH'),
      'restrictions', (select count(*) from household_food_restrictions r join household_members m using (member_id) where m.household_id='$HH')
    )::text"
}

# Un aliment RÉELLEMENT servi par un plan — le bilan refuse ce qui n'y est pas.
food_of() {
  psql "select i->>'term' from student_generated_meals m, jsonb_array_elements(m.dishes) d, jsonb_array_elements(d->'ingredients') i where m.id='$1' and i->>'term' is not null limit 1;" | tr -d '\n'
}

# ── LES QUATRE CYCLES, DÉCLARÉS ICI ET NULLE PART AILLEURS ────────────────
# numéro | la phrase du brouillon | le corps du bilan (FOOD substitué au tir)
CYCLES=(
"1|Mon fils n'aime pas le poisson.|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"household\",\"difficulty\":\"too_hard\"}"
"2|Ma fille a danse le mardi soir, il lui faut un vrai repas ce soir-là.|{\"cooked\":\"yes\",\"speed\":\"too_long\",\"never_again_foods\":[{\"food\":\"FOOD\",\"subject\":\"household\"}]}"
"3|J'ai très envie de fajitas cette semaine.|{\"cooked\":\"yes\",\"portions\":\"not_enough\",\"portions_subject\":\"household\",\"anything_else\":\"On mange tard le vendredi.\"}"
"4||"
# ── LE CYCLE 5, AJOUTÉ APRÈS COUP, ET LE MOTIF EST UNE FAUTE DU BANC ──────
# Les cycles 1 et 2 posaient `difficulty=too_hard` et `speed=too_long`, et
# n'ont RIEN bougé: `noBaseline`. Un compte NEUF n'a pas de base de cuisine —
# `recipe_difficulty`, `variety` et `cooking_time_min` sont des réglages que la
# personne remplit dans l'entonnoir, PAS de la mémoire. §8.1 exigeait « mémoire
# vide » et la fixture est nue par construction: les deux indices de cuisine
# étaient donc INMESURABLES par construction, et le banc l'aurait rendu comme
# « les indices ne bougent pas » — un faux négatif.
#
# La base est posée par L'ÉCRITURE DE L'ÉCRAN (`mergePracticalConstraints`,
# PATCH PostgREST avec le jeton de la personne), pas par un `update` SQL, puis
# ce cycle mesure les deux crans d'un coup.
"5|Rien de neuf ce soir.|{\"cooked\":\"yes\",\"difficulty\":\"too_hard\",\"speed\":\"too_long\",\"variety\":\"no\"}"
)

JWT=$(login)
[ -n "$JWT" ] || { echo "login KO" >&2; exit 1; }
echo "════════ CAMPAGNE · quatre cycles · $EMAIL ════════"

for entry in "${CYCLES[@]}"; do
  N="${entry%%|*}"; rest="${entry#*|}"
  NOTE="${rest%%|*}"; BILAN="${rest#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$N" ] && continue

  echo
  echo "── CYCLE $N ──────────────────────────────────────────────"
  snapshot > "$OUT/c$N.avant.json"

  # ── ① LE PLAN, AVEC SA PHRASE ──────────────────────────────────────────
  # ⚠️ `replaces` LU JUSTE AVANT L'APPEL: une génération lancée plus tôt a pu
  # retirer ce plan entre-temps, et la RPC refuse alors `plan_not_replaceable`.
  BODY=$(python3 -c "
import json,sys
last, text = sys.argv[1], sys.argv[2]
b = {'operation':'compose','mode':'to_shop','window':{'kind':'days','count':2}}
if last: b['intent']='replace_current'; b['replaces']=last
else: b['intent']='prepare_next'
if text: b['draft_note']=text
print(json.dumps(b))" "$(last_meal)" "$NOTE")

  CODE=""
  for try in 1 2 3; do
    : > "$OUT/c$N.gen.log"
    docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/c$N.gen.log" 2>&1 &
    LP=$!
    T0=$(date +%s)
    CODE=$(curl -s -o "$OUT/c$N.gen.json" -w "%{http_code}" -X POST \
      "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
      -H "Content-Type: application/json" -d "$BODY" --max-time 800)
    DT=$(( $(date +%s) - T0 ))
    sleep 2; kill $LP 2>/dev/null; wait $LP 2>/dev/null
    [ "$CODE" = "401" ] && { JWT=$(login); continue; }
    [ "$CODE" = "200" ] && break
    echo "   plan HTTP $CODE — reprise ($try/3)"
    sleep 10
  done
  echo "   plan · HTTP $CODE en ${DT}s"
  [ "$CODE" = "200" ] || { echo "   ⚠️ cycle $N ABANDONNÉ"; continue; }

  MEAL=$(last_meal)
  snapshot > "$OUT/c$N.apres-plan.json"

  # ── ② LE BILAN ─────────────────────────────────────────────────────────
  if [ -n "$BILAN" ]; then
    FOOD=$(food_of "$MEAL")
    BILAN="${BILAN//FOOD/$FOOD}"
    FULL=$(python3 -c "
import json,sys
b=json.loads(sys.argv[1]); b['meal_id']=sys.argv[2]; b['today']=sys.argv[3]
print(json.dumps(b))" "$BILAN" "$MEAL" "$TODAY")
    : > "$OUT/c$N.bilan.log"
    docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/c$N.bilan.log" 2>&1 &
    LP=$!
    HTTP=$(curl -s -o "$OUT/c$N.bilan.json" -w "%{http_code}" -X POST \
      "$URL/functions/v1/keel-plan-feedback-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
      -H "Content-Type: application/json" -d "$FULL" --max-time 600)
    sleep 2; kill $LP 2>/dev/null; wait $LP 2>/dev/null
    echo "   bilan · HTTP $HTTP · aliment refusé = « $FOOD »"
  fi

  # ── ③ LE CYCLE 4 VALIDE, ET C'EST L'HORLOGE DE L'ENCART ────────────────
  # ⚠️ ÉCRIT EN SQL, ET C'EST LA SEULE ÉCRITURE DE CE BANC QUI NE PASSE PAS
  # PAR UNE PORTE — assumé et nommé: la validation se fait à l'écran par un
  # geste (« j'adopte ce plan ») qui n'a pas de fonction edge à lui. Ce qu'on
  # mesure ici n'est pas la validation, c'est ce que l'encart en FAIT.
  if [ "$N" = "4" ]; then
    psql "update student_generated_meals set validated_at = now() where id='$MEAL';" >/dev/null
    echo "   plan $MEAL VALIDÉ (validated_at posé)"
  fi

  snapshot > "$OUT/c$N.apres.json"

  # ── ④ LES COMPTEURS DU CYCLE ───────────────────────────────────────────
  for tag in keel/draft_note_classify keel/plan_feedback_retained \
             keel.household_meal.exclusion_belt keel.household_meal.retained_items \
             keel.household_meal.notes keel.household_meal.member_voices; do
    for f in "$OUT/c$N.gen.log" "$OUT/c$N.bilan.log"; do
      [ -f "$f" ] || continue
      grep "\"tag\":\"$tag\"" "$f" 2>/dev/null | sed 's/.*{"tag"/{"tag"/' | tail -1
    done
  done > "$OUT/c$N.compteurs.json"
  sed 's/^/   /' "$OUT/c$N.compteurs.json" | cut -c1-200
done

# ═══════════════════════════════════════════════════════════════════════════
# LE TABLEAU DU §8.3 — relu EN BASE, jamais à l'œil
# ═══════════════════════════════════════════════════════════════════════════
echo
echo "════════ LE TABLEAU ════════"
python3 - "$OUT" "$TOM" "$LEA" "$CLAIRE" <<'PY'
import json, os, sys
out, tom, lea, claire = sys.argv[1:5]
def load(name):
    p = os.path.join(out, name)
    if not os.path.exists(p): return None
    raw = open(p).read().strip()
    return json.loads(raw) if raw else None

for n in ["1", "2", "3", "4"]:
    after = load(f"c{n}.apres.json")
    if after is None:
        print(f"cycle {n}: pas de relevé")
        continue
    items = after["items"]; memo = after["memo"]; encart = after["encart"]
    journal = after["journal"]; champs = after["champs"]
    prefs = [i for i in items if str(i.get("kind","")).startswith(("food.","method."))]
    portions = [i for i in items if i.get("kind") == "portion.adjust"]
    # L'indice de portion, comme la carte le calcule: −1/−2 par cran.
    NOTCH = {"slight": 1, "clear": 2}
    pos = 0
    for p in portions:
        v = p.get("value") or {}
        k = NOTCH.get(str(v.get("magnitude")), 0)
        pos += -k if v.get("direction") == "down" else k
    print(f"cycle {n}: préférences={len(prefs)} notes={len(memo)} encart={len(encart)} "
          f"journal={len(journal)} indice_portion={max(-2,min(2,pos))} "
          f"champs={json.dumps(champs, ensure_ascii=False)} "
          f"sécurité={after['securite']} allergies={after['allergies']} restrictions={after['restrictions']}")
    for p in prefs:
        who = "table" if p.get("subject") == "household" else (
            "Tom" if tom in str(p.get("subject")) else
            "Léa" if lea in str(p.get("subject")) else
            "Claire" if claire in str(p.get("subject")) else "?")
        print(f"    · {p.get('kind')} [{who}] {p.get('text')} ({p.get('source')})")
    for m in memo:
        print(f"    · note [{m.get('subject')}] {m.get('text')} when={json.dumps(m.get('when'))}")
    for e in encart:
        it = e.get("item") if isinstance(e.get("item"), dict) else e
        print(f"    · encart {it.get('kind')} {it.get('text')}")
PY

echo
echo "════════ DOUBLONS — attendu 0 ligne partout ════════"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
-- ① le même aliment pour la même bouche dans les DEUX magasins
with r as (select member_id, lower(label) f from household_food_restrictions),
     p as (select split_part(e->>'subject',':',2)::uuid member_id, lower(e->>'text') f
           from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e
           where e->>'kind'='food.exclude' and e->>'subject' like 'member:%')
select 'restriction × préférence' as quoi, * from r join p using (member_id, f);"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
-- ② le même texte en PRÉFÉRENCE et en NOTE, pour la même bouche
select 'préférence × note' as quoi, i.subject, i.text
from (select e->>'subject' subject, lower(trim(e->>'text')) text
      from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e) i
join (select m->>'subject' subject, lower(trim(m->>'text')) text
      from student_goals g, jsonb_array_elements(g.practical_constraints->'memo') m) n
  using (subject, text);"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
-- ③ deux fois la même préférence pour la même bouche
select 'préférence × préférence' as quoi, subject, text, count(*)
from (select e->>'subject' subject, lower(trim(e->>'text')) text
      from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e
      where e->>'kind' like 'food.%') x
group by 1,2,3 having count(*) > 1;"
