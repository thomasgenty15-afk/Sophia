#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 2 — LA CLASSIFICATION DU BILAN DE PLAN
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : ~/.claude/plans/indexed-jumping-biscuit.md, lot 2.
#
# ── LA DIFFÉRENCE DE NATURE AVEC LE LOT 1, ET ELLE DÉCIDE DU BANC ─────────
# Le retour sur plan est classé PAR UN MODÈLE ; le bilan, par du CODE
# DÉTERMINISTE (`retainedItemsFromPlanFeedback`). Ses entrées sont des
# vocabulaires FERMÉS, tenus par des `CHECK` en base :
#
#   cooked           ∈ yes | partly | no
#   portions         ∈ way_too_much | too_much | right | not_enough | way_not_enough
#   portions_subject ∈ household | member:<uuid>
#   never_again / make_again = des TITRES DE PLATS DU PLAN, à l'exact
#
# Il n'y a donc pas de « mauvaise interprétation » possible. Ce qu'on cherche,
# c'est autre chose : des combinaisons non couvertes, et des refus SILENCIEUX.
#
# ⛔ UN BILAN PAR PLAN (`unique (meal_id)`). Chaque cas exige donc un plan
# NEUF — d'où une génération réelle par cas. Supprimer la ligne de bilan entre
# les cas serait moins cher et mesurerait autre chose : le produit ne le fait
# jamais, et le cas I existe précisément pour vérifier le refus du second.
#
# ⚠️ ON NE PURGE RIEN. L'état s'accumule d'un cas au suivant — c'est ce que
# vit une vraie personne, et c'est ce qui rend le cas E (l'index qui revient à
# zéro) mesurable.
#
# Usage : scripts/2026-09-01-banc-bilan-plan.sh <anon> [lettre du cas]

set -uo pipefail
ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [cas]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="qa-foyer-retours@keeltest.dev"
OUT="${BANC_OUT:-/tmp/banc-bilan-plan}"
mkdir -p "$OUT"

USER_ID=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select id from auth.users where email='$EMAIL';" | tr -d ' ')
LEA=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select member_id from household_members where first_name='Léa' and household_id=public.keel_household_of('$USER_ID');" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente" >&2; exit 1; }

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}

# ⚠️ LES CHAMPS RÉELS, PAS SEULEMENT LES ITEMS. Le bilan est la seule des deux
# sources qui écrit dans les RÉGLAGES (M5) et qui bouge l'INDEX (M3) : un banc
# qui ne relirait que `retained_items` manquerait tout ce qui le distingue.
snapshot() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "
    select json_build_object(
      'durable',       coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'field_changes', coalesce((select practical_constraints->'field_changes'  from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'cooking_time_min', (select practical_constraints->>'cooking_time_min' from student_goals where user_id='$USER_ID'),
      'recipe_difficulty',(select practical_constraints->>'recipe_difficulty' from student_goals where user_id='$USER_ID'),
      'variety',          (select practical_constraints->>'variety' from student_goals where user_id='$USER_ID')
    );" 2>/dev/null | tr -d '\n'
}

# ── UN PLAN NEUF, ET SES TITRES DE PLATS ──────────────────────────────────
# Les titres sont REQUIS pour `never_again`/`make_again` : l'appartenance est
# EXACTE, et un titre inventé sort en `refused.notInPlan` (c'est le cas G).
fresh_plan() {
  local jwt="$1" replaces="$2"
  local body
  body=$(python3 -c "
import json,sys
b={'operation':'compose','mode':'to_shop','intent':'replace_current' if sys.argv[1] else 'prepare_next',
   'window':{'kind':'days','count':2}}
if sys.argv[1]: b['replaces']=sys.argv[1]
print(json.dumps(b))" "$replaces")
  curl -s -o "$OUT/plan.out" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" \
    -d "$body" --max-time 600
}

last_meal() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
    "select id from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;" | tr -d ' '
}

dish_titles() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
    "select coalesce(json_agg(d->>'title'), '[]'::json) from student_generated_meals m,
     jsonb_array_elements(m.dishes) d where m.id='$1';" | tr -d '\n'
}

# ── LES NEUF CAS ──────────────────────────────────────────────────────────
# `TITRE1` / `FAUX` sont substitués au moment du tir : le premier par un vrai
# titre du plan, le second par un titre qui n'y est pas (cas G).
CASES=(
"A|cooked=partly, rien d'autre|{\"cooked\":\"partly\"}"
"B|cooked=no|{\"cooked\":\"no\"}"
"C|portions=too_much, sujet=foyer|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"household\"}"
"D|portions=way_too_much|{\"cooked\":\"yes\",\"portions\":\"way_too_much\",\"portions_subject\":\"household\"}"
"E|not_enough — l'index doit REMONTER|{\"cooked\":\"yes\",\"portions\":\"not_enough\",\"portions_subject\":\"household\"}"
"F|sujet = Léa (MINEURE)|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"member:LEA\"}"
"G|never_again = un titre ABSENT du plan|{\"cooked\":\"yes\",\"never_again\":[\"FAUX\"]}"
# ⛔ LES JETONS EXACTS, PAS LEUR NOM COURANT. L'axe fermé s'appelle
# `enough_variety` (`VARIETY_AXIS_QUESTION`) et ses réponses agissantes sont
# `no` et `sometimes` — « variety » / « too_repetitive » sont des jetons forgés,
# que `varietyPressureFor` ignore en silence. Un banc qui les enverrait
# mesurerait son propre vocabulaire, pas le produit.
"H|axe enough_variety = no|{\"cooked\":\"yes\",\"axis_question\":\"enough_variety\",\"axis_answer\":\"no\"}"
"I|second bilan sur LE MÊME plan|REPEAT"
)

echo "════════ BANC · bilan de plan · foyer $USER_ID ════════"
JWT=$(login)

for entry in "${CASES[@]}"; do
  C="${entry%%|*}"; rest="${entry#*|}"
  LABEL="${rest%%|*}"; PAYLOAD="${rest#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$C" ] && continue

  if [ "$PAYLOAD" = "REPEAT" ]; then
    MEAL=$(last_meal)   # ⛔ PAS de plan neuf : c'est le point du cas.
    PAYLOAD='{"cooked":"yes"}'
  else
    # ⛔ ON REPREND, ET ON REFUSE DE TOURNER SUR UN PLAN DÉJÀ NOTÉ. Sans ça, une
    # génération qui échoue fait retomber le cas sur le plan PRÉCÉDENT: le
    # premier passe (il n'avait pas de bilan), les suivants rendent
    # `already_answered` — et on lirait un refus de la base comme un résultat
    # du cas. Mesuré: le cas A a tourné sur un plan qui n'était pas le sien.
    T0=$(date +%s); BEFORE_MEAL=$(last_meal)
    for gtry in 1 2 3 4; do
      CODE=$(fresh_plan "$JWT" "$(last_meal)")
      [ "$CODE" = "401" ] && { JWT=$(login); continue; }
      [ "$CODE" = "200" ] && break
      echo "     plan HTTP $CODE, reprise ($gtry/4)"; sleep 12
    done
    MEAL=$(last_meal)
    if [ "$MEAL" = "$BEFORE_MEAL" ]; then
      echo "  ⚠️ cas $C SAUTÉ — aucun plan neuf (dernier HTTP $CODE)"
      continue
    fi
    echo "  plan neuf ($CODE, $(( $(date +%s) - T0 ))s) → $MEAL"
  fi

  TITLES=$(dish_titles "$MEAL")
  BODY=$(python3 -c "
import json,sys
p=json.loads(sys.argv[1]); titles=json.loads(sys.argv[2]); lea=sys.argv[4]
p['meal_id']=sys.argv[3]
if p.get('portions_subject')=='member:LEA': p['portions_subject']='member:'+lea
if p.get('never_again')==['FAUX']: p['never_again']=['Un plat que ce plan ne contient pas']
print(json.dumps(p))" "$PAYLOAD" "$TITLES" "$MEAL" "$LEA")

  BEFORE=$(snapshot); echo "$BEFORE" > "$OUT/$C.before.json"
  : > "$OUT/$C.log"
  docker logs --since 1s -f supabase_edge_runtime_Sophia_2 > "$OUT/$C.log" 2>&1 & LP=$!
  curl -s -o "$OUT/$C.out" -X POST "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "$BODY" --max-time 120
  kill $LP 2>/dev/null; wait $LP 2>/dev/null
  snapshot > "$OUT/$C.after.json"
  echo "$BODY" > "$OUT/$C.body.json"
  grep -o '{"tag":"keel/safety_fallback".*' "$OUT/$C.log" | tail -1 > "$OUT/$C.safety.json"
  echo "  cas $C · $LABEL"
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
LABELS = {
 "A":"cooked=partly → le champ temps de cuisson descend, avec sa cause",
 "B":"cooked=no → descente plus forte, ou plancher",
 "C":"portions=too_much → index −1",
 "D":"portions=way_too_much → magnitude clear, index −2",
 "E":"not_enough → l'index REMONTE",
 "F":"sujet = Léa (MINEURE) → exclusion AVEC MOTIF, jamais un échec muet",
 "G":"titre absent du plan → refused.notInPlan, rien écrit",
 "H":"axe variety → un seul axe est retenu",
 "I":"second bilan sur le même plan → already_answered, aucun double effet"}
for c in "ABCDEFGHI":
    a = f"{out}/{c}.after.json"
    if not os.path.exists(a): continue
    B, A = json.load(open(f"{out}/{c}.before.json")), json.load(open(a))
    resp = json.load(open(f"{out}/{c}.out")) if os.path.getsize(f"{out}/{c}.out") else {}
    print(f"\n── cas {c} · {LABELS[c]}")
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
        v = it.get("value")
        print(f"   écrit      {it.get('kind')} · sujet={it.get('subject')} · valeur={v}")
        print(f"              texte « {it.get('text')} »")
        print(f"              cause « {it.get('quote')} »")
    if not new and r:
        print("   écrit      RIEN dans le magasin durable")
    nf = [x for x in A["field_changes"] if x not in B["field_changes"]]
    for j in nf:
        print(f"   journal    {j.get('field')} : {j.get('previous')} → {j.get('next')} "
              f"| cause « {j.get('quote')} »")
PY
