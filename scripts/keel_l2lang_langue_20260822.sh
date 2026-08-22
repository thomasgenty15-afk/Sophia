#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L2-lang — LE COMPTEUR #2, EN UNE COMMANDE. Par lane ET par langue.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ L2-lang`.
#
#   # ① l'ÉTAT DE DÉPART — sur le corpus tel qu'il est, sans banc
#   bash scripts/keel_l2lang_langue_20260822.sh
#
#   # ② la MESURE APRÈS — une fois les dix plans en base
#   bash scripts/keel_l2lang_langue_20260822.sh --since=2026-08-22T12:00:00+00
#
#   # ③ la même, verrouillée sur le millésime de prompt du banc
#   bash scripts/keel_l2lang_langue_20260822.sh \
#        --since=2026-08-22T12:00:00+00 \
#        --prompt-version='meal.en.v18_one_box_per_group+household.v21_one_box_per_group'
#
# ── ⛔ CE PILOTE NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle. Les dix générations que la
# `mesure APRÈS` exige sont tenues par l'orchestrateur.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau. Exporter `SUPABASE_URL`
# ou `SUPABASE_SERVICE_ROLE_KEY` avant du Deno de ce dépôt vaut 114 faux
# rouges — la cicatrice est écrite dans l'ANNEXE du plan.
#
# ── POURQUOI UNE EXTRACTION À PART DE CELLE DE `V0-E′` ────────────────────
# Le résolveur de `V0-E′` est RÉUTILISÉ (ses adaptateurs sont importés, pas
# recopiés), mais son `plans.ndjson` ne porte NI `content_locale` utilisable
# par langue, NI `prompt_version`, NI `created_at` — les trois colonnes dont ce
# compteur-ci a besoin pour séparer le banc du corpus et pour vérifier que les
# deux bras partagent bien un millésime. Ajouter ces colonnes à l'extraction de
# `V0-E′` changerait le md5 de son corps de sortie, qui est ce qui referme
# chaque vague. On extrait donc ici, et on importe là-bas.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_l2lang_langue_20260822.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_L2LANG_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-l2lang-XXXXXX")}"
if [ -z "${KEEL_L2LANG_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
mkdir -p "$TMP"

# ⚠️ `select … row_to_json` en `-tA`, et surtout PAS `\copy … to stdout`: le
# format TEXT de COPY échappe les antislashs, donc il corrompt tout JSON qui
# porte une séquence d'échappement.
#
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

# ⛔ `content_locale` EST EXTRAIT TEL QUEL, sans normalisation SQL. Le
# regroupement par sous-tag de langue se fait dans le script, sous garde: le
# faire en SQL le mettrait hors de portée de la garde qui le vérifie.
psql_q -c "select row_to_json(t)::text from (
  select id, plan_kind, servings, content_locale,
         generated_from->>'prompt_version' as prompt_version,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') || 'Z' as created_at,
         dishes, preparations
  from student_generated_meals order by created_at, id
) t" > "$TMP/plans.ndjson"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
