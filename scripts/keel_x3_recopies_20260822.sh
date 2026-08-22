#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# X3′ — LE RECENSEMENT DES RECOPIES DE CLÉS « À LA MAIN », EN UNE COMMANDE
#       ⛔ SUR LES **DEUX** ARBRES, TOUJOURS.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `X3′`.
#
#   bash scripts/keel_x3_recopies_20260822.sh
#
# ── ⛔ POURQUOI DEUX ARBRES, ET POURQUOI C'EST LA MOITIÉ DU LOT ───────────
# Le 2026-08-22, **89 fichiers de `supabase/functions` portent +16 550 / −3 103
# lignes NON COMMITÉES**, la plupart appartenant à d'autres sessions — dont
# `meal_generation.ts` (+2 660) et les deux `index.ts` des générateurs, c'est-
# à-dire DEUX des trois instances qui ouvrent cette fiche (§⑨ n° 15).
#
# L'arbre de TRAVAIL est ce que `functions serve` exécute: c'est lui, le chiffre
# vrai. Mais un chiffre pris sur un arbre que personne ne peut cloner n'est pas
# reproductible. Le pilote rend donc les DEUX, côte à côte, dans la MÊME passe:
#
#   ① l'arbre de travail — ce qui tourne;
#   ② `HEAD` — ce qu'un clone lirait demain.
#
# L'écart entre les deux N'EST PAS DU BRUIT: c'est la mesure de ce que le
# recensement doit à du travail non versionné.
#
# ── ⛔ CE PILOTE NE FAIT QUE LIRE ─────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle, aucun `git stash` (interdit:
# le dépôt est partagé, `stash` emporte 200+ fichiers d'autres sessions).
# `git archive` extrait `HEAD` dans un répertoire temporaire, sans jamais
# toucher l'index ni l'arbre de travail.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ───────────────────────
# Ce script lit des fichiers, jamais le réseau.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS="$ROOT/scripts/keel_x3_recopies_20260822.mjs"

if [ ! -d "$ROOT/frontend/node_modules/typescript" ]; then
  echo "⛔ frontend/node_modules/typescript absent — lancer \`npm ci\` dans frontend/." >&2
  exit 2
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-x3-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "######################################################################"
echo "# ① ARBRE DE TRAVAIL — ce que \`functions serve\` exécute"
echo "######################################################################"
echo
rc_work=0
node "$JS" --tree="$ROOT" --repo="$ROOT" --label="arbre de travail" "$@" || rc_work=$?
echo
echo "rc(arbre de travail) = $rc_work"
echo

echo "######################################################################"
echo "# ② HEAD — ce qu'un clone lirait, sans le travail non commité"
echo "######################################################################"
echo
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
mkdir -p "$TMP/head"
git -C "$ROOT" archive HEAD supabase/functions frontend/src \
  | tar -x -C "$TMP/head"
echo "HEAD = $HEAD_SHA"
echo
rc_head=0
node "$JS" --tree="$TMP/head" --repo="$ROOT" --label="HEAD $HEAD_SHA" "$@" || rc_head=$?
echo
echo "rc(HEAD) = $rc_head"
echo

echo "######################################################################"
echo "# ③ CE QUI DIFFÈRE ENTRE LES DEUX — le mur du §⑨ n° 15, chiffré"
echo "######################################################################"
echo
echo "-- fichiers de supabase/functions modifiés et NON COMMITÉS:"
git -C "$ROOT" diff --numstat HEAD -- supabase/functions \
  | awk '{a+=$1;b+=$2;n++} END {printf "   %d fichiers, +%d / -%d lignes\n", n, a, b}'
echo "-- fichiers de frontend/src modifiés et NON COMMITÉS:"
git -C "$ROOT" diff --numstat HEAD -- frontend/src \
  | awk '{a+=$1;b+=$2;n++} END {printf "   %d fichiers, +%d / -%d lignes\n", n, a, b}'
echo
echo "-- les porteurs des instances de la fiche, un par un:"
for f in \
  supabase/functions/_shared/keel/meal_generation.ts \
  supabase/functions/meal-energy-v1/index.ts \
  supabase/functions/generate-meal-v1/index.ts \
  supabase/functions/generate-household-meal-v1/index.ts \
  frontend/src/keel/api/mealGeneration.ts
do
  line="$(git -C "$ROOT" diff --numstat HEAD -- "$f" | head -1)"
  if [ -z "$line" ]; then
    echo "   $f : identique à HEAD"
  else
    echo "   $f : $(echo "$line" | awk '{printf "+%s / -%s NON COMMITÉES", $1, $2}')"
  fi
done
echo
echo "######################################################################"
echo "# ④ CE QUE LES DEUX PERTES COÛTENT EN BASE — lecture seule"
echo "######################################################################"
echo
# ⛔ CES DEUX CHIFFRES SONT CITÉS DANS LES VERDICTS ③. Un verdict qui cite un
# nombre que personne ne peut rejouer est une affirmation, pas une mesure.
# `select` uniquement, aucune écriture, aucune migration.
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
if docker exec -i "$DB_CONTAINER" true >/dev/null 2>&1; then
  echo "-- \`dishes[].name\` : ce que le modèle a écrit et qu'aucun écran ne lit"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -c "
    with plats as (
      select m.id, d from student_generated_meals m,
        lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) d
    )
    select '   ' || count(*) || ' plats | ' ||
           count(*) filter (where d ? 'name') || ' portent la cle | ' ||
           count(*) filter (where d->>'name' is not null) || ' avec un nom NON NUL | ' ||
           count(distinct id) filter (where d->>'name' is not null) || ' plans concernes'
    from plats;"
  echo
  echo "-- \`ingredients[].group\` : par lane, ce que le lecteur d'energie ne voit pas"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -c "
    with lignes as (
      select m.id, m.plan_kind, ing from student_generated_meals m,
        lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) d,
        lateral jsonb_array_elements(coalesce(d->'ingredients','[]'::jsonb)) ing
      union all
      select m.id, m.plan_kind, ing from student_generated_meals m,
        lateral jsonb_array_elements(coalesce(m.preparations,'[]'::jsonb)) p,
        lateral jsonb_array_elements(coalesce(p->'ingredients','[]'::jsonb)) ing
    )
    select '   ' || coalesce(plan_kind,'(null)') || ' | ' || count(*) || ' lignes | ' ||
           count(*) filter (where ing->>'group' is not null) || ' avec groupe NON NUL | ' ||
           count(distinct id) filter (where ing->>'group' is not null) || ' plans'
    from lignes group by plan_kind order by 1;"
else
  echo "   (base locale absente — les deux chiffres cites dans les verdicts ne"
  echo "    sont pas rejoues. Ce n'est pas un echec du recensement statique.)"
fi
echo
echo "FIN — deux arbres, un écart nommé, et deux pertes chiffrées."
