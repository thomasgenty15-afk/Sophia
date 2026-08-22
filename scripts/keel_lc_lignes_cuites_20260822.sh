#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L-C — LES LIGNES CUITES LUES COMME DU CRU · le pilote
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-C`.
#
#     bash scripts/keel_lc_lignes_cuites_20260822.sh
#     bash scripts/keel_lc_lignes_cuites_20260822.sh > sortie.txt
#
# Il extrait le référentiel, les alias et le corpus de la base VIVANTE, puis
# lance la mesure. La même commande sert AVANT et APRÈS la migration: avant,
# la colonne « APRÈS » est une PRÉDICTION; après, les deux colonnes se
# rejoignent. Une prédiction qui ne se reproduit pas se voit tout de suite.
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
TS_FILE="${KEEL_LC_TS:-$ROOT/scripts/keel_lc_lignes_cuites_20260822.ts}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-lc-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ⛔ `grams_raw` n'est PAS extrait: la colonne est FIGÉE à la génération. Le
# résolveur recalcule tout sur l'index d'aujourd'hui.
# ⚠️ `ciqual_code` et `source` EN PLUS de ce que `V0-E′` extrait: c'est la
# section ⑤, celle qui dit ce qu'on NE PEUT PAS vérifier (lot `O9`).
psql_q -c "select row_to_json(t)::text from (
  select slug, food_group_ref, label, source, ciqual_code, energy_kcal, protein_g,
         carbs_g, fat_g, fiber_g, omega3_marine, iron_source, calcium_source,
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
printf 'L-C — LES LIGNES CUITES LUES COMME DU CRU\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n'

deno run --quiet --allow-read "$TS_FILE" "$TMP"

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
printf 'FIN\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
