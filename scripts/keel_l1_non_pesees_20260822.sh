#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L-1 — LE COMPTEUR #3 COUPÉ PAR LANE **ET PAR GÉNÉRATION DE PROMPT**
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-1`.
#
#     bash scripts/keel_l1_non_pesees_20260822.sh
#     bash scripts/keel_l1_non_pesees_20260822.sh > sortie.txt
#
# ── POURQUOI IL EXISTE À CÔTÉ DE `V0-E′` ──────────────────────────────────
# Le tableau de bord `V0-E′` reste la mesure de référence: on ne le touche
# pas. Celui-ci est son ARME pour `L-1`, et il ajoute exactement trois choses
# que `V0-E′` ne rend pas:
#   ① la coupe par GÉNÉRATION DE PROMPT (le corpus EN porte 15 générations,
#      dont 43 plans sans aucun `prompt_version`, et trois générations mortes
#      écrivent 100 % de leurs ingrédients sans `amount`);
#   ② « RÉSOLU+PESÉ **hors convention** », pour qu'aucun seuil ne se cale sur
#      un numérateur gonflé par `condimentMassFor` (réserve de `V0-E′`);
#   ③ la VENTILATION DES CAUSES de non-pesée — `unit_grams` n'en répare
#      qu'une, et c'est ce que ce lot doit prouver avant d'écrire une valeur.
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
TS_FILE="$ROOT/scripts/keel_l1_non_pesees_20260822.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-l1-XXXXXX")"
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

# ⚠️ `prompt_version` et `created_at` EN PLUS de ce que `V0-E′` extrait: ce
# sont les deux colonnes de la coupe qui arme ce lot.
psql_q -c "select row_to_json(t)::text from (
  select id, plan_kind, servings, content_locale, created_at,
         generated_from->>'prompt_version' as prompt_version,
         dishes, preparations
  from student_generated_meals order by id
) t" > "$TMP/plans.ndjson"

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf 'L-1 — LIGNES RÉSOLUES ET NON PESÉES · par lane et par génération de prompt\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n\n'

printf '── LE RÉFÉRENTIEL, EN DEUX NOMBRES ────────────────────────────────────────\n'
psql_q -c "select
  '     unit_grams       ' || count(*) filter (where unit_grams is not null) || ' / ' || count(*)
  || '   ·   condiment_grams ' || count(*) filter (where condiment_grams is not null) || ' / ' || count(*)
  || '   ·   alias ' || (select count(*) from food_composition_aliases)
from food_composition_refs"
printf '\n'

deno run --quiet --allow-read "$TS_FILE" "$TMP"

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
printf 'FIN\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
