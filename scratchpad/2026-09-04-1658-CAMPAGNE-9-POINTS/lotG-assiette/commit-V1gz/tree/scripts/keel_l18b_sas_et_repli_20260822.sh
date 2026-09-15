#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L18b — LE SAS, ET LE REPLI QUI CESSE D'ÊTRE MORT. Le compteur, en une
#        commande, et sur les DEUX dénominateurs.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L18b`.
#
#   bash scripts/keel_l18b_sas_et_repli_20260822.sh
#
# ── ⛔ CE PILOTE NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle, aucune génération. La
# PROMOTION (`promote_pending_food_compositions`) est un geste à part, à la
# main, et elle n'est PAS dans ce fichier.
#
# ── ⛔ AVANT ET APRÈS DANS LE MÊME PROCESSUS ──────────────────────────────
# Registre §⑨ n° 55: deux exécutions du même compteur à dix minutes d'écart
# rendent 750 puis 764 plats calculables, parce que `food_composition_refs` et
# les modules du calcul bougent SOUS la mesure. Un niveau absolu cité seul n'est
# pas une mesure. Ici les deux passes lisent le MÊME instantané, dans la MÊME
# passe: le DELTA est immunisé, et le niveau est imprimé à côté avec son heure.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau (114 faux rouges
# mesurés — `qa-env-exports-poison-the-suite`).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="${KEEL_L18B_TS:-$ROOT/scripts/keel_l18b_sas_et_repli_20260822.ts}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_L18B_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-l18b-XXXXXX")}"
if [ -z "${KEEL_L18B_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
mkdir -p "$TMP"

# ⚠️ `row_to_json` en `-tA`, jamais `\copy … to stdout`: le format TEXT de COPY
# échappe les antislashs et corrompt tout JSON qui porte une séquence
# d'échappement.
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

# ⛔ LE SAS — TOUTES LES COLONNES QUI DÉCIDENT, ET LA LISTE LITTÉRALE DES
# TERMES. Un compte seul ne dit pas si le sas a GAGNÉ des termes: le seuil de ce
# lot se lit en DELTA, sur `first_seen_at`, pas en niveau (voir la fiche).
psql_q -c "select row_to_json(t)::text from (
  select term, food_group_ref, label, energy_kcal, fill_source, sightings,
         status, review_reason,
         to_char(first_seen_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') || 'Z' as first_seen_at,
         to_char(last_seen_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') || 'Z' as last_seen_at
  from food_composition_pending order by sightings desc, term
) t" > "$TMP/food_composition_pending.ndjson"

psql_q -c "select row_to_json(t)::text from (
  select week::text as week, plan_kind, plans, unknowns_median::text as unknowns_median,
         unknowns_max, share_table::text as share_table,
         share_promoted::text as share_promoted, share_model::text as share_model,
         share_group_bounds::text as share_group_bounds
  from composition_fill_weekly order by week desc, plan_kind
) t" > "$TMP/composition_fill_weekly.ndjson"

# ⛔ LE CRON — VÉRIFIÉ, JAMAIS CRU SUR PAROLE. La fiche affirme « 0 appelant sur
# les 22 crons »; le pilote le remesure à chaque exécution.
psql_q -c "select count(*) || '|' ||
  count(*) filter (where command ilike '%promote_pending_food_compositions%') || '|' ||
  count(*) filter (where command ilike '%composition%')
from cron.job" > "$TMP/cron_counts.txt"

# Les plans mesurés / non mesurés — `null` veut dire « personne n'a mesuré »
# depuis `V0-B`, et ce n'est pas zéro.
psql_q -c "select count(*) || '|' || count(composition_unknowns)
from student_generated_meals" > "$TMP/plan_measured_counts.txt"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
