#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LA SONDE D'EXPIRATION — une ligne `next_plan` cesse-t-elle vraiment d'agir ?
# ═══════════════════════════════════════════════════════════════════════════
#
# ── POURQUOI UNE SONDE À PART, ET PAS UN CINQUIÈME CYCLE ─────────────────
# `retained_next_plan.ts` fait vivre une ligne « jusqu'à la fin de la semaine à
# laquelle elle est ancrée » (`jour <= ancre + 6`). Les quatre cycles du banc
# tombent le MÊME jour: toutes les ancres valent le même lundi, et l'expiration
# n'y est donc pas atteignable. Elle n'a jamais été mesurée.
#
# ⛔ ON NE PEUT PAS AVANCER L'HORLOGE. `at` et `anchor` sont calculés côté
# serveur depuis le jour LOCAL de la personne; aucun paramètre d'API ne les
# déplace. La seule façon honnête de sonder le LECTEUR est donc de reculer
# l'ancre d'une ligne existante, puis de regarder si elle atteint encore le
# prompt.
#
# ⚠️ CE QUE ÇA MESURE, ET CE QUE ÇA NE MESURE PAS. Ça mesure le LECTEUR
# (`nextPlanItemsFor` → `isNextPlanItemAlive`), c'est-à-dire la seule moitié qui
# décide. Ça ne mesure pas l'écrivain — personne ne recule jamais une ancre en
# production, et ce script le fait exprès pour créer un état que le temps
# mettrait sept jours à produire.
#
# Usage : scripts/2026-09-03-sonde-expiration-next-plan.sh <anon> <email>

set -uo pipefail
ANON="${1:-}"; EMAIL="${2:-}"
[ -n "$ANON" ] && [ -n "$EMAIL" ] || { echo "usage: $0 <anon> <email>" >&2; exit 2; }
URL="http://127.0.0.1:54321"
OUT="${SONDE_OUT:-/tmp/sonde-expiration}"; mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1"; }
USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "compte introuvable" >&2; exit 1; }

JWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

# `composition` de la trace de routage: combien d'items food.* atteignent le
# prompt. C'est LE nombre que l'expiration doit faire tomber.
composition() {
  local since; since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  : > "$OUT/$1.log"
  docker logs --since "$since" -f supabase_edge_runtime_Sophia_2 > "$OUT/$1.log" 2>&1 & local lp=$!
  local code last
  for t in 1 2 3 4 5; do
    last=$(psql "select id from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;" | tr -d ' ')
    code=$(curl -s -o "$OUT/$1.out" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "{\"operation\":\"compose\",\"mode\":\"to_shop\",\"intent\":\"replace_current\",\"replaces\":\"$last\",\"window\":{\"kind\":\"days\",\"count\":2}}" \
      --max-time 600)
    [ "$code" = "200" ] && break
    sleep 12
  done
  kill $lp 2>/dev/null; wait $lp 2>/dev/null
  grep -o '{"tag":"keel.household_meal.retained_items".*' "$OUT/$1.log" | tail -1 \
    | python3 -c "
import sys,json
try: print(json.loads(sys.stdin.read().strip()).get('composition'))
except Exception: print('?')"
}

# ⛔ LE PLANCHER DURABLE, ET C'EST LUI QUI A FAIT MENTIR LA PREMIÈRE VERSION.
# `composition` compte TOUS les `food.*` qui atteignent le prompt — les
# `next_plan` ET les `durable`. Attendre `0` après expiration revenait à
# attendre que les lignes DURABLES disparaissent aussi, ce qu'elles ne doivent
# jamais faire. Mesuré: 5 → 3 lisait « la ligne périmée agit encore » alors que
# les DEUX lignes périmées avaient bien disparu et que les TROIS durables
# restaient. Le banc rendait un verdict faux sur un produit correct.
#
# La bonne mesure est donc une DIFFÉRENCE, pas un zéro.
DURABLES=$(psql "select count(*)::text from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) e where g.user_id='$USER_ID' and (e->>'kind') like 'food.%';" | tr -d ' ')
PERISSABLES=$(psql "select count(*)::text from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_next_plan','[]'::jsonb)) e where g.user_id='$USER_ID' and (e->'item'->>'kind') like 'food.%';" | tr -d ' ')

echo "════════ SONDE · expiration next_plan · $EMAIL ════════"
echo "  magasin: $DURABLES durable(s) food.* (n'expirent JAMAIS) + $PERISSABLES périssable(s)"
psql "select '  ancres actuelles: '||coalesce(string_agg(distinct e->>'anchor',', '),'aucune')
      from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_next_plan','[]'::jsonb)) e
      where g.user_id='$USER_ID';"

AVANT=$(composition avant)
echo "  AVANT (ancre de cette semaine) : composition=$AVANT"

# ⛔ RECULER L'ANCRE DE SEPT JOURS, pas la date d'écriture. C'est l'ANCRE qui
# décide (`ancre + 6`), et c'est la seule chose qu'il faut bouger pour que la
# ligne soit hors de sa fenêtre — `at` reste le jour où la personne a parlé.
psql "update student_goals set practical_constraints = jsonb_set(
        practical_constraints, '{retained_next_plan}',
        (select jsonb_agg(jsonb_set(e, '{anchor}', to_jsonb(((e->>'anchor')::date - 7)::text)))
         from jsonb_array_elements(practical_constraints->'retained_next_plan') e))
      where user_id='$USER_ID';" >/dev/null
psql "select '  ancres reculées: '||coalesce(string_agg(distinct e->>'anchor',', '),'aucune')
      from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_next_plan','[]'::jsonb)) e
      where g.user_id='$USER_ID';"

APRES=$(composition apres)
echo "  APRÈS (ancre périmée)          : composition=$APRES"
echo
if [ "$AVANT" = "$((DURABLES + PERISSABLES))" ] && [ "$APRES" = "$DURABLES" ]; then
  echo "  ✅ LE LECTEUR MORD. Les $PERISSABLES ligne(s) hors de leur semaine ont"
  echo "     cessé d'atteindre le prompt ($AVANT → $APRES), et les $DURABLES durable(s)"
  echo "     sont restées — c'est exactement ce qu'on veut des deux côtés."
elif [ "$APRES" = "$AVANT" ]; then
  echo "  ⛔ RIEN N'A BOUGÉ ($AVANT → $APRES): une règle censée mourir dimanche"
  echo "     gouverne encore des assiettes."
else
  echo "  ⚠️ COMPTE INATTENDU: avant=$AVANT après=$APRES, pour $DURABLES durable(s)"
  echo "     et $PERISSABLES périssable(s). À instruire avant de conclure."
fi

# ⛔ ON REPOSE LES ANCRES. Les laisser en arrière empoisonnerait tout run
# ultérieur sur ce compte: les lignes seraient mortes sans que personne ne
# l'ait décidé, et on mesurerait un magasin vide en croyant mesurer un plein.
psql "update student_goals set practical_constraints = jsonb_set(
        practical_constraints, '{retained_next_plan}',
        (select jsonb_agg(jsonb_set(e, '{anchor}', to_jsonb(((e->>'anchor')::date + 7)::text)))
         from jsonb_array_elements(practical_constraints->'retained_next_plan') e))
      where user_id='$USER_ID';" >/dev/null
echo "  (ancres remises en place)"
