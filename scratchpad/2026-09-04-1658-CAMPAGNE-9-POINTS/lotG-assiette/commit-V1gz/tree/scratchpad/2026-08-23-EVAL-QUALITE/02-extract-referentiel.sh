#!/usr/bin/env bash
# Le référentiel de composition, extrait UNE FOIS pour toute l'évaluation.
# ⛔ LECTURE SEULE. Aucune variable SUPABASE_* n'est exportée.
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
mkdir -p "$EVAL_DIR/ref"
psqlq -c "select row_to_json(t)::text from (
  select slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g,
         fat_g, fiber_g, omega3_marine, iron_source, calcium_source,
         iodine_source, zinc_source, b12_source, folate_source, yield_class,
         atwater_discount, energy_dense, unit_grams, condiment_grams
  from food_composition_refs order by slug) t" > "$EVAL_DIR/ref/food_composition_refs.ndjson"
psqlq -c "select row_to_json(t)::text from (
  select alias, slug from food_composition_aliases order by alias, slug) t" > "$EVAL_DIR/ref/food_composition_aliases.ndjson"
echo "refs   : $(wc -l < "$EVAL_DIR/ref/food_composition_refs.ndjson") lignes"
echo "alias  : $(wc -l < "$EVAL_DIR/ref/food_composition_aliases.ndjson") lignes"
