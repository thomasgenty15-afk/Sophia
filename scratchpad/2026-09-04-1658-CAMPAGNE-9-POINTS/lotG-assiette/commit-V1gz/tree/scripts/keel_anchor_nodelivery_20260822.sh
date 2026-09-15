#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L-anchor-nodelivery — CE QUE `no_delivery` RECOUVRE, CAUSE PAR CAUSE.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche
# `L-anchor-nodelivery`.
#
#   bash scripts/keel_anchor_nodelivery_20260822.sh
#
# ── ⛔ CE PILOTE NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle, aucune migration.
#
# ── ⛔ IL REND DEUX LECTURES QUI NE SONT PAS LA MÊME, ET LE DIT ────────────
# ① `generated_from->'household'->'box_sizing'->'anchor'` — les dix seaux
#    **GELÉS À LA GÉNÉRATION**. C'est le chiffre que la fiche cite.
# ② la recomposition de `mouthDayEnergy` sur le référentiel D'AUJOURD'HUI.
#    Les migrations `L-C` (114 lignes cuites) et `L-1-b` (+860 lignes pesées)
#    ont atterri APRÈS neuf de ces douze plans: les deux lectures ne peuvent
#    pas coïncider, et la différence est un FAIT, pas une erreur de mesure.
#
# ⛔ CE QUI RESTE COMPARABLE À L'IDENTIQUE, ET C'EST LA GARDE DE COHÉRENCE:
# le NOMBRE de lignes. `dishSlices` ne lit pas le référentiel — une ligne
# existe parce qu'un contenant porte un nom, et pour aucune autre raison. Le
# script vérifie donc « somme des dix seaux == lignes recomposées » plan par
# plan, et sort en `rc=1` si un plan ne se recompose pas.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau (§⑨ — « l'env QA
# empoisonne la suite », 114 faux rouges).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_anchor_nodelivery_20260822.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_ANCHOR_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-anchor-XXXXXX")}"
if [ -z "${KEEL_ANCHOR_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
mkdir -p "$TMP"

# ⚠️ `row_to_json` en `-tA`, jamais `\copy … to stdout`: le format TEXT de COPY
# échappe les antislashs et corrompt tout JSON qui porte une séquence
# d'échappement. La cicatrice est celle de `L17`.
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

# ⛔ `anchor` ET `presence` SONT EXTRAITS AVEC LE PLAN. Sans `presence`, la
# question « ce silence est-il JUSTE ? » n'a aucune réponse mesurable: c'est la
# déclaration d'absence qui distingue « Yanis n'est pas là » de « le plan n'a
# rien composé pour Yanis ».
psql_q -c "select row_to_json(t)::text from (
  select id, plan_kind, servings, content_locale,
         generated_from->>'prompt_version' as prompt_version,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') || 'Z' as created_at,
         generated_from->'household'->'box_sizing'->'anchor' as anchor,
         generated_from->'household'->'box_sizing'->>'anchor_applied' as anchor_applied,
         generated_from->'household'->'presence' as presence,
         dishes, preparations
  from student_generated_meals order by created_at, id
) t" > "$TMP/plans.ndjson"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
