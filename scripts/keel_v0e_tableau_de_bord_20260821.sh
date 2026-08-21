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

# ── ⛔ L'ASSERTION DE CARDINALITÉ — LE PILOTE COMPTE SES PROPRES LIGNES ────
# Lot `V0-E′-bis`. C'est le TROISIÈME VISAGE DU `null` de `V0-B-bis` — la
# sonde qui n'existe pas — appliqué ici.
#
# Avant ce lot, un compteur cassé pour ne rendre AUCUNE ligne (mesuré par
# mutation, `... from c6 where corps < 0`) donnait: `rc=0`, stderr VIDE, NEUF
# lignes — #1…#5 puis #7…#10, #6 simplement disparu — et un pied de page qui
# affirmait « dix lignes rendues ». Le total était une CONSTANTE DE CHAÎNE,
# jamais un compte: `grep | sort | awk` imprime ce qui arrive, pas ce qui
# manque. Une ligne qui s'évapore ne laisse aucune trace.
#
# Le danger est LATENT, pas vivant: les huit CTE du SQL sont aujourd'hui des
# agrégats nus qui rendent TOUJOURS exactement une ligne, et une erreur SQL
# dure arrête bien le pilote (`ON_ERROR_STOP=1` + `set -euo pipefail`). Il
# mordra au premier `where`, `group by` ou `join` ajouté à un compteur.
#
# ⚠️ SA LIMITE, ET ELLE EST RÉELLE — il faut l'écrire ici, pas la découvrir:
# la liste attendue est ÉCRITE EN DUR. Elle attrape la ligne qui S'ÉVAPORE;
# elle n'attrape JAMAIS celle qu'on retire en mettant `ATTENDUS` à jour dans
# le même geste. C'est exactement la limite que `V0-B-bis` a reconnue pour
# `expected_probes`, et aucune assertion de cardinalité ne la ferme.
ATTENDUS='1 2 3 4 5 6 7 8 9 10'
RENDUS="$(grep -E '^[0-9]+\|' "$RAW" | cut -d'|' -f1 | sort -n -u || true)"
N="$(printf '%s\n' "$RENDUS" | grep -c . || true)"
MANQUANTS=""
for numero in $ATTENDUS; do
  printf '%s\n' "$RENDUS" | grep -qx "$numero" || MANQUANTS="$MANQUANTS #$numero"
done
if [ -n "$MANQUANTS" ] || [ "$N" -ne 10 ]; then
  {
    printf '⛔ CARDINALITÉ: %s/10 lignes rendues — MANQUANT(S):%s\n' \
      "$N" "${MANQUANTS:- aucun numéro absent (doublon, ou numéro hors liste)}"
    printf '   rendus : %s\n' "$(printf '%s' "$RENDUS" | tr '\n' ' ')"
    printf '   ⇒ un compteur n'"'"'a rendu AUCUNE ligne. Le tableau est FAUX, pas incomplet:\n'
    printf '     une ligne absente ne se voit pas, et le pied de page ne la compte pas.\n'
  } >&2
  exit 1
fi

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
# ⚠️ « dix » n'est PLUS une affirmation non vérifiée: l'assertion de
#    cardinalité ci-dessus a COMPTÉ les lignes, et ce point du script est
#    INATTEIGNABLE si le compte n'est pas exactement 10 (`exit 1`).
#    ⛔ Le libellé reste écrit en toutes lettres, au bit près, POUR UNE RAISON
#    DE MESURE: le corps de cette sortie est comparé par `md5` à l'archive du
#    2026-08-21 23:11 (`dd6ea3420c25ec2b5120eee37f55a3be`, `tail -n +4`), et
#    c'est cette comparaison qui referme chaque vague. Interpoler « 10 » ici
#    casserait ce hash — le correctif se verrait comme une dérive de mesure.
printf 'FIN — dix lignes rendues, dont #2 explicitement marqué inexistant.\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
