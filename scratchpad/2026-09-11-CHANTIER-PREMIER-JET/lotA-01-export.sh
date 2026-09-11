#!/usr/bin/env bash
# LOT A — L'EXPORT DU RÉFÉRENTIEL ET DES DEUX PLANS DE PREUVE.
#
# Lecture seule. Aucun `update`, aucun `delete`. Le fichier produit est le
# matériau de `lotA-02-audit.ts` et de `lotA-03-impact.ts`, qui tournent
# ensuite HORS LIGNE — donc rejouables sans base.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -t -A)

"${PSQL[@]}" -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
  select slug, food_group_ref, label, source, ciqual_code, ciqual_name,
         energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
         omega3_marine, iron_source, calcium_source, iodine_source,
         zinc_source, b12_source, folate_source,
         yield_class, yield_factor, atwater_discount, energy_dense,
         unit_grams, condiment_grams
  from food_composition_refs order by slug) t" > "$DIR/lotA-refs.json"

"${PSQL[@]}" -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
  select alias, slug, note from food_composition_aliases order by alias) t" \
  > "$DIR/lotA-aliases.json"

# Les faux amis (table posée par la migration 20260911040000). Avant elle, la
# table n'existe pas: on rend `[]` plutôt que d'échouer, pour que le script
# tourne aussi sur une base d'avant le lot A.
"${PSQL[@]}" -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
  select term, lang, slug from public.food_composition_false_friends order by term) t" \
  > "$DIR/lotA-false-friends.json" 2>/dev/null || echo '[]' > "$DIR/lotA-false-friends.json"
[ -s "$DIR/lotA-false-friends.json" ] || echo '[]' > "$DIR/lotA-false-friends.json"

# Les deux plans de preuve du socle (§5). La table s'appelle
# `student_generated_meals` — `student_meal_plans` n'existe pas dans cette base.
"${PSQL[@]}" -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
  select id, content_locale, dishes, preparations
  from student_generated_meals
  where id in ('5fad22ce-d181-4a0c-b0b5-77caf65092b5',
               'a18f522e-41f9-469e-9c50-1d693d892ce6')) t" \
  > "$DIR/lotA-plans.json"

wc -c "$DIR/lotA-refs.json" "$DIR/lotA-aliases.json" "$DIR/lotA-plans.json"
