#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# `L6′-a` + `L6′-b` — le contenant attendu, et le nom du zéro. En une commande.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiches `L6′-a` et
# `L6′-b`.
#
#   bash scripts/keel_l6a_contenant_attendu_20260822.sh
#   KEEL_L6A_SINCE=2026-08-21T00:00:00Z bash scripts/…      # corpus élargi
#   KEEL_L6A_PLAN=3c781a71 bash scripts/…                   # le plan de `V0-D`
#
# ⛔ CE PILOTE NE FAIT QUE LIRE. Aucune écriture en base, AUCUN appel de modèle
# — le budget de la vague 3 est à zéro génération, et les plans sont DÉJÀ là.
#
# ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE — le Deno lancé ici lit des
# fichiers, jamais le réseau (§⑨: 114 faux rouges sinon).
#
# ⚠️ LE CHEMIN EN BASE EST `generated_from->'household'->'boxes'`. Il n'existe
# PAS de `box_counts` sous `generated_from` — la clé y est `boxes`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="$ROOT/scripts/keel_l6a_contenant_attendu_20260822.ts"
SINCE="${KEEL_L6A_SINCE:-2026-08-22T12:38:13Z}"
ONE_PLAN="${KEEL_L6A_PLAN:-}"
# ⛔ LE DÉNOMINATEUR RESTREINT, NOMMÉ (§⑨ n° 50): le millésime de prompt VIVANT.
# 181 plans sur 193 en sont dehors; les confondre ferait lire un taux sur un
# corpus que le produit ne sert plus.
PV="${KEEL_L6A_PV:-}"

if [ -n "$ONE_PLAN" ]; then
  WHERE="plan_kind = 'household' and id::text like '${ONE_PLAN}%'"
elif [ -n "$PV" ]; then
  WHERE="plan_kind = 'household' and generated_from->>'prompt_version' = '$PV'"
else
  WHERE="plan_kind = 'household' and created_at > '$SINCE'"
fi

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="${KEEL_L6A_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/keel-l6a-XXXXXX")}"
if [ -z "${KEEL_L6A_DIR:-}" ]; then trap 'rm -rf "$TMP"' EXIT; fi
mkdir -p "$TMP"

# ⚠️ `row_to_json` en `-tA`, jamais `\copy … to stdout`: le format TEXT de COPY
# échappe les antislashs et corrompt tout JSON qui en porte.
psql_q -c "select row_to_json(t)::text from (
  select left(id::text,8) as plan, content_locale as locale,
         generated_from->'household'->'boxes' as base,
         dishes, preparations
  from student_generated_meals
  where $WHERE
  order by created_at
) t" > "$TMP/plans.ndjson"

# Le roster: le foyer de ces plans, en entier. C'est le dénominateur, et il ne
# s'invente pas.
psql_q -c "select distinct hm.member_id
  from household_members hm
  where hm.household_id in (
    select household_id from student_generated_meals where $WHERE
  )" > "$TMP/roster.txt"

# ⛔ L'OBJECTIF ET LE RÉGIME VIENNENT DE LA TABLE, PAS D'UNE CONSTANTE. C'est
# `weighedPortionMembers` (`goal ∈ {fat_loss, muscle_gain}`) et la ceinture de
# régime que le pilote reconstitue; les coder en dur ferait passer une garde sur
# une fixture qui a changé.
psql_q -c "select distinct hm.member_id || E'\t' || coalesce(hm.goal,'') || E'\t' || coalesce(hm.diet,'')
  from household_members hm
  where hm.household_id in (
    select household_id from student_generated_meals where $WHERE
  )" > "$TMP/mouths.tsv"

deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@"
