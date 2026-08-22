#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L-1-b — LA QUANTITÉ ÉCRITE EN CLAIR · L'ARME DU LOT
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-1-b`.
#
#     bash scripts/keel_l1b_quantite_en_prose_20260822.sh
#     bash scripts/keel_l1b_quantite_en_prose_20260822.sh > sortie.txt
#
# ── POURQUOI IL EXISTE À CÔTÉ DE `V0-E′` ET DE `L-1` ──────────────────────
# Le tableau de bord `V0-E′` reste la mesure de référence: on ne le touche pas.
# `keel_l1_non_pesees_20260822.sh` est l'arme de `L-1` et coupe par génération.
# Celui-ci ajoute exactement ce que ni l'un ni l'autre ne rend:
#   ① la `mesure AVANT` et la `mesure APRÈS` dans LE MÊME RUN, sur le même
#      corpus à la même seconde — une seule variable change, la copie en prose
#      est passée au résolveur ou elle ne l'est pas;
#   ② les DEUX POPULATIONS (`ecrit_structure` / `recupere_en_prose`), qui sont
#      la moitié négative du lot: sans elles, un modèle qui cesserait d'obéir à
#      FF-038 serait indiscernable d'un lecteur réparé;
#   ③ ⛔ les DEUX DÉNOMINATEURS, toujours (§⑨ n° 50), avec la population exclue
#      NOMMÉE et COMPTÉE à côté de chaque chiffre.
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau (114 faux rouges déjà
# payés par ce dépôt).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_l1b_quantite_en_prose_20260822.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-l1b-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ⛔ `grams_raw` n'est PAS extrait: la colonne est FIGÉE à la génération. Le
# résolveur recalcule tout sur l'index d'aujourd'hui.
psql_q -c "select row_to_json(t)::text from (
  select slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g,
         fat_g, fiber_g, omega3_marine, iron_source, calcium_source,
         iodine_source, zinc_source, b12_source, folate_source, yield_class,
         atwater_discount, energy_dense, unit_grams, condiment_grams
  from food_composition_refs order by slug
) t" > "$TMP/food_composition_refs.ndjson"

psql_q -c "select row_to_json(t)::text from (
  select alias, slug from food_composition_aliases order by alias, slug
) t" > "$TMP/food_composition_aliases.ndjson"

psql_q -c "select row_to_json(t)::text from (
  select id, plan_kind, servings, content_locale, created_at,
         generated_from->>'prompt_version' as prompt_version,
         dishes, preparations
  from student_generated_meals order by id
) t" > "$TMP/plans.ndjson"

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf 'L-1-b — LA QUANTITÉ ÉCRITE EN CLAIR · AVANT et APRÈS dans le même run\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n'

printf '\n── LE RÉFÉRENTIEL, EN DEUX NOMBRES ────────────────────────────────────────\n'
psql_q -c "select
  '     unit_grams       ' || count(*) filter (where unit_grams is not null) || ' / ' || count(*)
  || '   ·   condiment_grams ' || count(*) filter (where condiment_grams is not null) || ' / ' || count(*)
  || '   ·   alias ' || (select count(*) from food_composition_aliases)
from food_composition_refs"

deno run --quiet --allow-read "$TS_FILE" "$TMP"

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
printf 'FIN\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
