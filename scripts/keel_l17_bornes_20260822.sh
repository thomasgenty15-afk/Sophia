#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L17 — L'ABSTENTION SE PÈSE. Le compteur, en une commande.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L17`.
#
#   bash scripts/keel_l17_bornes_20260822.sh
#
# ⛔ UNE SEULE COMMANDE REND LES DEUX SEUILS. Le seuil MUTÉ (0 %) et le seuil de
# PRODUCTION sortent de la MÊME extraction, dans la MÊME passe. Ce n'est pas du
# confort: le 2026-08-22 à 13:17, deux lancements à cinq minutes d'écart ont
# rendu +1 journée — non pas à cause de la borne, mais parce que la migration
# `20260822133000` (lot `L-C`) venait de réécrire 114 lignes de référentiel sous
# la mesure. Deux extractions ne comparent pas deux règles: elles comparent deux
# référentiels.
#
# ── ⛔ CE PILOTE NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau. Exporter `SUPABASE_URL`
# ou `SUPABASE_SERVICE_ROLE_KEY` avant du Deno de ce dépôt vaut 114 faux
# rouges — la cicatrice est écrite dans l'ANNEXE du plan.
#
# ── POURQUOI UNE EXTRACTION À PART DE CELLE DE `V0-E′` ────────────────────
# Le résolveur de `V0-E′` est RÉUTILISÉ (ses adaptateurs sont importés, pas
# recopiés). Mais son `plans.ndjson` ne porte pas `prompt_version`, et ce
# compteur-ci ne PEUT PAS s'en passer: le registre §⑨ n° 50 exige que tout
# seuil de la vague 2 soit rendu sur DEUX dénominateurs — le corpus entier et
# la population que le produit peut encore produire. Ajouter la colonne à
# l'extraction de `V0-E′` changerait le md5 de son corps de sortie, qui est ce
# qui referme chaque vague.
#
# ⛔ ET SON ADAPTATEUR D'INGRÉDIENT NE LIT PAS `group`. Celui d'ici le lit, par
# `persistedGroupOf` (`food_group_write.ts`, lot `L17-0`) — jamais une seconde
# écriture du même nom de clé.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_l17_bornes_20260822.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_L17_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-l17-XXXXXX")}"
if [ -z "${KEEL_L17_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
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

psql_q -c "select row_to_json(t)::text from (
  select id, plan_kind, servings, content_locale,
         generated_from->>'prompt_version' as prompt_version,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') || 'Z' as created_at,
         dishes, preparations
  from student_generated_meals order by created_at, id
) t" > "$TMP/plans.ndjson"

# ⛔ LA CONTRE-LECTURE SQL DU MÊME PRÉDICAT. `ing ? 'group'` NE MESURE RIEN
# depuis `L17-0`: la clé est écrite même à `null`. Les DEUX sont imprimés pour
# qu'on ne reprenne jamais le premier par erreur (§⑨ n° 41).
psql_q -c "with lignes as (
  select ing from student_generated_meals m,
    lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) d,
    lateral jsonb_array_elements(coalesce(d->'ingredients', '[]'::jsonb)) ing
  union all
  select ing from student_generated_meals m,
    lateral jsonb_array_elements(coalesce(m.preparations, '[]'::jsonb)) p,
    lateral jsonb_array_elements(coalesce(p->'ingredients', '[]'::jsonb)) ing
)
select count(*) || '|' || count(*) filter (where ing ? 'group')
    || '|' || count(*) filter (where ing->>'group' is not null)
from lignes" > "$TMP/sql_group_counts.txt"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
