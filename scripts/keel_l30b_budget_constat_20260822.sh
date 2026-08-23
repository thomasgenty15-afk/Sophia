#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L30b — LE BUDGET DEVIENT UN CONSTAT · le pilote
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L30b`.
#
#     bash scripts/keel_l30b_budget_constat_20260822.sh
#     bash scripts/keel_l30b_budget_constat_20260822.sh > sortie.txt
#
# La MÊME commande sert AVANT et APRÈS la promotion des prix: c'est ce qui
# rend le delta immunisé (§⑨ n° 55 — seul un delta calculé dans un même
# processus par la même fonction est comparable).
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle, aucune promotion. La
# promotion est un geste à part, à la main, après son dry-run.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des fichiers, jamais le réseau (114 faux rouges déjà
# payés par ce dépôt).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="${KEEL_L30B_TS:-$ROOT/scripts/keel_l30b_budget_constat_20260822.ts}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-l30b-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ⛔ `grams_raw` n'est PAS extrait: la colonne est FIGÉE à la génération. Le
# résolveur recalcule tout sur l'index d'aujourd'hui (cicatrice
# `coverage-must-be-measured-on-the-live-index`).
psql_q -c "select row_to_json(t)::text from (
  select slug, food_group_ref, label, source, energy_kcal, protein_g,
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

# ⛔ LA GRILLE QUE LE PRODUIT LIT VRAIMENT — `food_composition_refs`, et pas
# le sas. Tant qu'une ligne n'est pas promue, aucun lecteur n'en voit rien.
psql_q -c "select row_to_json(t)::text from (
  select slug,
         price_eur_per_100g_fr as price_fr, price_fr_source as source_fr,
         price_fr_observed_on as observed_fr,
         price_usd_per_100g_us as price_us, price_us_source as source_us,
         price_us_observed_on as observed_us
  from food_composition_refs order by slug
) t" > "$TMP/food_prices_refs.ndjson"

# LA GRILLE DU SAS — comparaison seule, jamais présentée comme un lecteur.
psql_q -c "select row_to_json(t)::text from (
  select slug,
         price_eur_per_100g_fr as price_fr, price_fr_source as source_fr,
         price_usd_per_100g_us as price_us, price_us_source as source_us,
         observed_on, price_basis, status
  from food_price_pending order by slug
) t" > "$TMP/food_prices_pending.ndjson"

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf 'EXTRACTION — %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
for f in food_composition_refs food_composition_aliases plans food_prices_refs food_prices_pending; do
  printf '   %-28s %s lignes\n' "$f" "$(wc -l < "$TMP/$f.ndjson" | tr -d ' ')"
done

# ── LA COHÉRENCE CRU/CUIT, MESURÉE EN SQL, PAS PROMISE ────────────────────
printf '\n── ⛔ LE PRIX ET LA MASSE PARLENT-ILS DU MÊME ÉTAT ? ───────────────────\n'
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
select p.price_basis, r.yield_class, count(*) as lignes,
       bool_or(true) filter (
         where (p.price_basis = 'cooked_label_dry_input' and r.yield_class <> 'neutral')
            or (p.price_basis = 'cooked_label_yield_absorbed' and r.yield_class = 'neutral')
       ) as base_perimee
from food_price_pending p
join food_composition_refs r on r.slug = p.slug
where p.price_basis in ('cooked_label_dry_input', 'cooked_label_yield_absorbed')
group by 1, 2 order by 1, 2;"

deno run --allow-read "$TS_FILE" "$TMP"
