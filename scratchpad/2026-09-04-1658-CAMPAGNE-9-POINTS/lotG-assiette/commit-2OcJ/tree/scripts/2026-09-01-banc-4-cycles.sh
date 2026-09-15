#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 3 — CE QUI S'APPREND D'UN CYCLE AU SUIVANT
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : ~/.claude/plans/indexed-jumping-biscuit.md, lot 3.
# Fixture   : `qa-cycles@keeltest.dev` — foyer NEUF, mémoire VIDE.
#
# ── UN CYCLE = UNE SEULE GÉNÉRATION, ET C'EST LE VRAI GESTE ───────────────
#
#   plan N  ←  porte le retour sur le plan N-1 (`draft_note`)
#   bilan N ←  le questionnaire de fin de fenêtre
#
# Composer le plan et écrire le retour dans DEUX appels serait plus lisible et
# moins fidèle : « refais-le avec ça » est un seul geste dans le produit, et
# c'est lui qui déclenche le classifieur (qui tourne APRÈS l'écriture du plan).
#
# ── CE QU'ON MESURE, ET CE QU'ON N'A PAS ─────────────────────────────────
#   · l'indice de portion         `keel.meal.portion_adjust` (position, facteur)
#   · ce qui sort du magasin      `keel.household_meal.retained_items`
#   · les champs et leur journal  `practical_constraints`
#   · les contraintes TENUES      les titres et ingrédients du plan
#   · la répétition               les titres d'un cycle à l'autre
#
# ⛔ PAS L'ENVELOPPE. `keel.meal.envelope` et son contrefactuel n'existent que
# sur la lane SOLO; la lane foyer calcule une enveloppe PAR BOUCHE et n'a pas
# ce compteur. L'effet sur l'assiette se lit donc ici sur les PLATS, pas sur la
# bande d'énergie. C'est nommé plutôt que contourné.
#
# Usage : scripts/2026-09-01-banc-4-cycles.sh <anon> [email] [cycle de départ]

set -uo pipefail
ANON="${1:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon>" >&2; exit 2; }

URL="http://127.0.0.1:54321"
# ⚠️ PARAMÉTRABLE: un lot 3 rejoué doit partir d'un compte NEUF. Rejouer sur le
# même écraserait la mémoire qu'on mesure — et « mémoire vide au cycle 1 » est
# la prémisse de tout le lot.
EMAIL="${2:-qa-cycles@keeltest.dev}"
# ⛔ REPRENDRE, JAMAIS REJOUER. Un run interrompu au cycle 3 ne se relance pas
# depuis le 1: la mémoire n'est plus vide, et « mémoire vide au cycle 1 » est la
# prémisse de tout le lot. Rejouer mesurerait un quatrième cycle déguisé en
# premier — exactement le genre de nombre faux que ce banc existe pour éviter.
FROM_CYCLE="${3:-1}"
OUT="${BANC_OUT:-/tmp/banc-4-cycles}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1"; }
USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente" >&2; exit 1; }

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}
last_meal() { psql "select id from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;" | tr -d ' '; }

snapshot() {
  psql "select json_build_object(
    'durable',   coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
    'next_plan', coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
    'fields',    json_build_object(
        'cooking_time_min', (select practical_constraints->>'cooking_time_min' from student_goals where user_id='$USER_ID'),
        'recipe_difficulty',(select practical_constraints->>'recipe_difficulty' from student_goals where user_id='$USER_ID'),
        'variety',          (select practical_constraints->>'variety' from student_goals where user_id='$USER_ID')),
    'journal',   coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
    'safety',    (select coalesce(json_agg(kind||'/'||coalesce(allergen_ref,diet_ref,'?')), '[]'::json) from student_safety_constraints where user_id='$USER_ID' and status='active')
  );" | tr -d '\n'
}

# ── LES QUATRE CYCLES ─────────────────────────────────────────────────────
# La note du cycle N est le retour sur le plan N-1. Le cycle 1 n'en a pas: on
# ne donne pas son avis sur un plan qui n'existe pas encore.
NOTES=("" "Mon fils n'aime pas le poisson" "Je n'aime pas le poulet, on en a trop mangé" "J'ai très envie de fajitas cette semaine")
# Le bilan du cycle N. `too_much` deux fois de suite: c'est le scénario du lot
# M3 — la personne redit « un peu trop » DU PLAN CORRIGÉ.
REVIEWS=(
'{"cooked":"partly"}'
'{"cooked":"yes","portions":"too_much","portions_subject":"household"}'
'{"cooked":"yes","portions":"too_much","portions_subject":"household"}'
'{"cooked":"yes","axis_question":"enough_variety","axis_answer":"no"}'
)
# ⛔ `make_again` EST LE SEUL MÉCANISME DE RÉPERTOIRE QUI EXISTE, et un banc qui
# ne l'exerce pas conclurait « rien ne s'apprend » en n'ayant pas essayé.
# Le design (`2026-08-20-0200-DESIGN-habitudes-et-signaux.md`) place le
# répertoire en ordre 5 et le dit non construit — mais `makeAgain` →
# `effect.keptDishes` → `food.prefer` DURABLE existe déjà, et ces lignes
# atteignent le prompt des deux générateurs.
#
# ⚠️ LES TITRES SONT CEUX DU PLAN, à l'exact: l'appartenance est vérifiée
# (`refused.notInPlan`), donc un titre inventé ne mesurerait que le refus.
KEEP_FIRST_DISH=(no yes yes yes)

JWT=$(login)
echo "════════ BANC · 4 CYCLES · $EMAIL ($USER_ID) ════════"

for N in 1 2 3 4; do
  [ "$N" -lt "$FROM_CYCLE" ] && continue
  NOTE="${NOTES[$((N-1))]}"
  snapshot > "$OUT/c$N.before.json"
  PREV=$(last_meal)

  # ── ① LE PLAN, PORTANT LE RETOUR SUR LE PRÉCÉDENT ──────────────────────
  for gtry in 1 2 3 4 5; do
    SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ); : > "$OUT/c$N.log"
    docker logs --since "$SINCE" -f supabase_edge_runtime_Sophia_2 > "$OUT/c$N.log" 2>&1 & LP=$!
    BODY=$(python3 -c "
import json,sys
b={'operation':'compose','mode':'to_shop','window':{'kind':'days','count':2}}
if sys.argv[1]:
    b['intent']='replace_current'; b['replaces']=sys.argv[1]
else:
    b['intent']='prepare_next'
if sys.argv[2]: b['draft_note']=sys.argv[2]
print(json.dumps(b))" "$PREV" "$NOTE")
    CODE=$(curl -s -o "$OUT/c$N.plan.out" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "$BODY" --max-time 600)
    kill $LP 2>/dev/null; wait $LP 2>/dev/null
    [ "$CODE" = "401" ] && { JWT=$(login); continue; }
    [ "$CODE" = "200" ] && break
    echo "   cycle $N · plan HTTP $CODE, reprise ($gtry/5)"; sleep 15
  done
  MEAL=$(last_meal)
  echo "── cycle $N · plan $CODE${NOTE:+  ← « $NOTE »}"
  [ "$CODE" = "200" ] || { echo "   ⚠️ cycle $N INTERROMPU"; break; }

  # ── ② LE BILAN DE CE PLAN ──────────────────────────────────────────────
  # Les titres AVANT le bilan: `make_again` doit nommer un plat de CE plan.
  TITLES_NOW=$(psql "select coalesce(json_agg(d->>'title'), '[]'::json) from student_generated_meals m, jsonb_array_elements(m.dishes) d where m.id='$MEAL';" | tr -d '\n')
  RBODY=$(python3 -c "
import json,sys
p=json.loads(sys.argv[1]); p['meal_id']=sys.argv[2]
titles=json.loads(sys.argv[3])
if sys.argv[4]=='yes' and titles: p['make_again']=[titles[0]]
print(json.dumps(p))" \
    "${REVIEWS[$((N-1))]}" "$MEAL" "$TITLES_NOW" "${KEEP_FIRST_DISH[$((N-1))]}")
  curl -s -o "$OUT/c$N.review.out" -X POST "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "$RBODY" --max-time 120
  echo "   bilan: $(python3 -c "
import json;d=json.load(open('$OUT/c$N.review.out'));print('ok='+str(d.get('ok'))+' '+str(d.get('reason','')))" 2>/dev/null)"

  # ── ③ CE QUE LE PLAN A SERVI ──────────────────────────────────────────
  psql "select coalesce(json_agg(d->>'title'), '[]'::json) from student_generated_meals m, jsonb_array_elements(m.dishes) d where m.id='$MEAL';" | tr -d '\n' > "$OUT/c$N.titles.json"
  psql "select coalesce(m.dishes::text,'[]') from student_generated_meals m where m.id='$MEAL';" | tr -d '\n' > "$OUT/c$N.dishes.json"
  snapshot > "$OUT/c$N.after.json"
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" <<'PY'
import json, os, re, sys
out = sys.argv[1]
INTERDITS = {2: ("poisson|saumon|cabillaud|thon|colin|merlu", "poisson"),
             3: ("poulet|chicken|volaille|dinde", "poulet")}
prev_titles = set()
for n in (1, 2, 3, 4):
    a = f"{out}/c{n}.after.json"
    if not os.path.exists(a): continue
    A = json.load(open(a))
    titles = json.load(open(f"{out}/c{n}.titles.json"))
    dishes = open(f"{out}/c{n}.dishes.json").read().lower()
    log = open(f"{out}/c{n}.log", errors="ignore").read()

    print(f"\n────────── CYCLE {n} ──────────")
    # ⛔ LE TAG DE LA LANE FOYER, PAS CELUI DE LA SOLO. `keel.meal.portion_adjust`
    # (avec `position` et `factor`) n'est émis que par `generate-meal-v1`; la
    # lane foyer calcule une enveloppe PAR BOUCHE et rend `portion_applied`
    # dans sa trace de routage. Grepper le mauvais tag rendait « indice=0 »
    # sur un cycle où l'indice avait bougé — un banc qui rend un nombre FAUX
    # au lieu de rien, exactement le défaut déjà payé au lot 1.
    rt = re.findall(r'\{"tag":"keel\.household_meal\.retained_items".*', log)
    if rt:
        d = json.loads(rt[-1])
        print(f"  routage    composition={d.get('composition')} portion={d.get('portion')} "
              f"craving={d.get('craving')} autres_sujets={d.get('other_subjects')}")
        print(f"  portions   bouches servies={d.get('portion_applied')} "
              f"exclues={d.get('portion_excluded')}")
    dn = re.findall(r'\{"tag":"keel/draft_note_classify".*', log)
    if dn:
        d = json.loads(dn[-1])
        print(f"  classifié  proposé={d.get('proposed')} gardé={d.get('kept')} "
              f"refusé={d.get('refused')}")
    f = A["fields"]
    print(f"  champs     temps={f['cooking_time_min']} difficulté={f['recipe_difficulty']} "
          f"variété={f['variety']}  journal={len(A['journal'])}")
    print(f"  magasin    durable={len(A['durable'])}  next_plan={len(A['next_plan'])}")
    print(f"  plats      {' · '.join(titles) if titles else '(aucun)'}")

    # ── LES CONTRAINTES TENUES: le plan sert-il ce qu'on a exclu ? ────────
    for cycle, (pat, nom) in INTERDITS.items():
        if n > cycle:
            hit = re.search(pat, dishes)
            print(f"  ⚑ {nom:8s} {'⛔ PRÉSENT — la contrainte du cycle ' + str(cycle) + ' n a pas tenu' if hit else '✅ absent'}")
    # ── LA RÉPÉTITION: le répertoire se construit-il ? ────────────────────
    now = set(titles)
    if prev_titles:
        common = now & prev_titles
        print(f"  répétition {len(common)}/{len(now)} plats déjà vus au cycle précédent"
              + (f" — {' · '.join(sorted(common))}" if common else ""))
    prev_titles = now
PY
