#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# V0-E′ — LE TABLEAU DE BORD, AVANT LE RUN. Les dix compteurs, une commande.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ V0-E′`.
#
#     bash scripts/keel_v0e_tableau_de_bord_20260821.sh
#     bash scripts/keel_v0e_tableau_de_bord_20260821.sh > sortie.txt
#
# ── POURQUOI UN PILOTE, ET PAS UN SEUL FICHIER SQL ────────────────────────
# Huit compteurs sont du SQL (`keel_v0e_tableau_de_bord_20260821.sql`). Deux —
# #3 (lignes résolues ET pesées) et #4 (motifs d'abstention) — exigent le
# RÉSOLVEUR DE PRODUCTION sous Deno: normalisation des termes, alias, classes
# de rendement, masses conventionnelles de condiment, et le pliage des
# préparations dans les plats. Les réécrire en SQL serait un second moteur de
# résolution, et ce dépôt a déjà payé ce genre de doublon.
#
# Le pilote extrait donc trois NDJSON de la base, lance le script Deno, puis le
# SQL, et FUSIONNE les deux sorties en un seul tableau trié sur le numéro de
# compteur. Une commande, dix lignes, de bout en bout.
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base. Aucun appel de modèle — ni `generate-meal-v1`, ni
# `generate-household-meal-v1`: ils dépenseraient le plafond de `V0-D`.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau. Exporter `SUPABASE_URL`
# ou `SUPABASE_SERVICE_ROLE_KEY` avant du Deno de ce dépôt vaut 114 faux
# rouges — la cicatrice est écrite dans l'ANNEXE du plan.
#
# ── REJOUABILITÉ ──────────────────────────────────────────────────────────
# Deux exécutions consécutives rendent la MÊME sortie (le corps du tableau; la
# ligne d'horodatage change, par construction). C'est ce qui permet de relancer
# ce fichier à la fin de chaque vague et de comparer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
SQL_FILE="$ROOT/scripts/keel_v0e_tableau_de_bord_20260821.sql"
TS_FILE="$ROOT/scripts/keel_v0e_resolveur_20260821.ts"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-v0e-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ── L'EXTRACTION — trois NDJSON, une ligne JSON par ligne de table ─────────
# NDJSON et pas un `jsonb_agg` géant: une ligne par enregistrement se lit, se
# `wc -l`, et ne dépend pas d'une limite de tampon.
#
# ⚠️ `select … row_to_json` en `-tA`, et surtout PAS `\copy … to stdout`: le
# format TEXT de COPY échappe les antislashs, donc il corrompt tout JSON qui
# porte une séquence d'échappement. Mesuré: le premier `\n` d'un libellé casse
# `JSON.parse`. Le mode non aligné rend la ligne telle quelle.
#
# ⛔ `grams_raw` n'est PAS extrait, et ce n'est pas un oubli: la colonne est
# FIGÉE à la génération. Le résolveur recalcule tout sur l'index d'aujourd'hui.
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
  select id, plan_kind, servings, content_locale, dishes, preparations
  from student_generated_meals order by id
) t" > "$TMP/plans.ndjson"

# ── LES DEUX SORTIES, PUIS LA FUSION ──────────────────────────────────────
RAW="$TMP/raw.txt"
: > "$RAW"
psql_q -f - < "$SQL_FILE" >> "$RAW"
deno run --quiet --allow-read "$TS_FILE" "$TMP" >> "$RAW"

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf 'V0-E′ — LE TABLEAU DE BORD, AVANT LE RUN\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n\n'

grep -E '^[0-9]+\|' "$RAW" | sort -t'|' -k1,1n | awk -F'|' '
  { printf "  #%-3s %-46s %s\n", $1, $2, $3 }
'

printf '\n  source: sql = requête de lecture · deno = résolveur DE PRODUCTION importé\n'
printf '          (food_composition.ts, meal_verdict.ts, plan_energy.ts — jamais une copie)\n'

grep -E '^DETAIL\|' "$RAW" | sed 's/^DETAIL|//'

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
printf 'FIN — dix lignes rendues, dont #2 explicitement marqué inexistant.\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
