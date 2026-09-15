#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L26-0 — UNE BOUCHE, UN CONTENANT PAR REPAS. Le delta, en une commande.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L26-0`.
#
#   bash scripts/keel_l26_0_un_contenant_par_bouche_20260822.sh
#
# ⛔ CE PILOTE NE FAIT QUE LIRE. Aucune écriture en base, AUCUN appel de modèle
# — le budget de la vague 3 est à zéro génération.
#
# ⛔ IL REJOUE LES PLANS DÉJÀ EN BASE À TRAVERS L'ARÊTE, DANS UN SEUL PROCESSUS.
# §⑨ n° 55: un niveau absolu de ce corpus n'est pas reproductible à la minute;
# un AVANT et un APRÈS calculés sur les mêmes lignes dans la même passe le sont.
#
# ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE — le Deno lancé ici lit des
# fichiers, jamais le réseau. Exporter `SUPABASE_URL` avant du Deno de ce dépôt
# vaut 114 faux rouges.
#
# ⚠️ LE CHEMIN EN BASE EST `generated_from->'household'->'boxes'`. Il n'existe
# PAS de `box_counts` sous `generated_from` — la clé y est `boxes`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_l26_0_un_contenant_par_bouche_20260822.ts"
# La population par défaut: les plans foyer du prompt vivant `v18+v21`.
SINCE="${KEEL_L26_SINCE:-2026-08-22T12:38:13Z}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_L26_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-l26-XXXXXX")}"
if [ -z "${KEEL_L26_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
mkdir -p "$TMP"

# ⚠️ `row_to_json` en `-tA`, jamais `\copy … to stdout`: le format TEXT de COPY
# échappe les antislashs et corrompt tout JSON qui en porte.
psql_q -c "select row_to_json(t)::text from (
  select left(id::text,8) as plan, content_locale as locale,
         generated_from->'household'->'boxes' as base,
         dishes
  from student_generated_meals
  where plan_kind = 'household' and created_at > '$SINCE'
  order by created_at
) t" > "$TMP/plans.ndjson"

# Le roster: le foyer de ces plans, en entier. C'est le dénominateur de
# `mouth_slots`, et il ne s'invente pas.
psql_q -c "select distinct hm.member_id
  from household_members hm
  where hm.household_id in (
    select household_id from student_generated_meals
    where plan_kind = 'household' and created_at > '$SINCE'
  )" > "$TMP/roster.txt"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
