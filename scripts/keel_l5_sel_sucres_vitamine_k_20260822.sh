#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L5 — LE SEL, LES SUCRES ET LA VITAMINE K · le pilote
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L5`.
#
#     bash scripts/keel_l5_sel_sucres_vitamine_k_20260822.sh
#     bash scripts/keel_l5_sel_sucres_vitamine_k_20260822.sh > sortie.txt
#
# La MÊME commande sert AVANT et APRÈS la migration. Avant, les trois
# colonnes n'existent pas et le script le DIT (il ne plante pas, et il ne
# fabrique pas de zéro): `to_jsonb` d'une table sans la colonne rend une clé
# absente, que le TS lit comme « la colonne n'existe pas », distinct de
# « la colonne existe et la ligne est vide ».
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle, aucune génération.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau (114 faux rouges déjà
# payés par ce dépôt).
#
# ── ⛔ IL SORT EN `rc=1` ───────────────────────────────────────────────────
# Cinq gardes, énumérées dans le TS. Un seuil manqué, une liste de K ouverte,
# un verdict de sodium capable de dire « il en manque »: le script rougit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="${KEEL_L5_TS:-$ROOT/scripts/keel_l5_sel_sucres_vitamine_k_20260822.ts}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-l5-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ⛔ `select *` ET PAS UNE LISTE DE COLONNES, et c'est le seul endroit du
# dépôt où c'est le bon geste: la mesure AVANT doit pouvoir tourner sur une
# table qui NE PORTE PAS les trois colonnes. Une liste nommée ferait planter
# `psql` avant la première ligne, et « le script ne tourne pas » n'est pas
# une mesure.
psql_q -c "select row_to_json(t)::text from (
  select * from food_composition_refs order by slug
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
printf 'L5 — LE SEL, LES SUCRES ET LA VITAMINE K\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n\n'

printf '── LES TROIS COLONNES EXISTENT-ELLES ? (information_schema) ───────────────\n'
psql_q -c "select '     ' || rpad(c.n, 16) || ' ' ||
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_composition_refs'
      and column_name = c.n
  ) then 'EXISTE' else 'N''EXISTE PAS' end
from (values ('sodium_mg'),('sugars_g'),('vitamin_k_ug'),('micronutrient_source')) as c(n)"
printf '\n'

printf '── CE QUI EST VÉRIFIABLE CONTRE SA SOURCE (lot `O9`) ─────────────────────\n'
psql_q -c "select '     source=' || rpad(source, 8) || ' total ' || lpad(count(*)::text, 4)
  || ' · avec ciqual_code ' || lpad(count(ciqual_code)::text, 4)
  || ' · SANS ' || lpad((count(*) - count(ciqual_code))::text, 4)
from food_composition_refs group by source order by source"
printf '\n'

# ⚠️ `set -e` tuerait le script AVANT d'imprimer le `rc`. Le rouge du TS est
# le PRODUIT de ce pilote, pas un accident: on le capture et on le rend.
RC=0
deno run --quiet --allow-read "$TS_FILE" "$TMP" "$@" || RC=$?

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
printf 'FIN · rc=%s\n' "$RC"
printf '═══════════════════════════════════════════════════════════════════════════\n'
exit "$RC"
