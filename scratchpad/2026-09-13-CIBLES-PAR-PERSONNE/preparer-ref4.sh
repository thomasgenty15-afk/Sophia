#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 2 — PRÉPARER UN COMPTE NEUF POUR LA RÉFÉRENCE N=4
# ═══════════════════════════════════════════════════════════════════════════
#
#   ./preparer-ref4.sh <suffixe-de-compte>
#
# ⛔ POURQUOI CE SCRIPT EXISTE, ET C'EST UNE CONTRAINTE DU PRODUIT, PAS DU BANC.
# Un plat DÉDIÉ porte `for_member_id`, c'est-à-dire l'identifiant d'une bouche
# de CE foyer. Un compte neuf a de nouveaux identifiants : la même référence
# servie ailleurs rend « for_member_id … is not a mouth that gets its own dish,
# dropped » — mesuré le 2026-09-13, six plats jetés et 86 défauts.
#
# La référence est donc TOUJOURS rebâtie contre la demande figée du compte qui
# va la recevoir. Trois pas, dans cet ordre :
#   ① un tir de provisionnement (réponse en conserve, 422 attendu, AUCUNE
#     écriture en base) qui pose objectifs, régime, allergie et corps ;
#   ② `figer-demande.ts` → `lot2-ref4-contrats.json` ;
#   ③ `batir-ref4.ts` → `references/ref4.json`, avec les bons identifiants.
set -euo pipefail
cd "$(dirname "$0")/../.."
SUFFIXE="${1:?usage: preparer-ref4.sh <suffixe-de-compte>}"
HORLOGE="${HORLOGE:-2026-09-13T19:00:00+02:00}"
COMMUN=(perte --bouches=4 --objectifs=fat_loss,fat_loss,muscle_gain,muscle_gain
        --rythmes=0.5,0.5,0.25,0.25 --regimes=,vegan --allergies=,arachide
        --horloge="$HORLOGE" --compte="$SUFFIXE")

echo "── ① provisionnement (422 attendu, aucune écriture) ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts "${COMMUN[@]}" \
  > "/tmp/lot2-prep-$SUFFIXE.log" 2>&1 || true
grep -E "statut|fixture écrite" "/tmp/lot2-prep-$SUFFIXE.log" || true

SORTIE=$(ls -t scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-"$SUFFIXE"-*.json | head -1)
echo "── ② gel de la demande ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-CLOTURE/figer-demande.ts "$SORTIE" --nom=lot2-ref4-contrats \
  | tail -4

echo "── ③ reconstruction de la référence ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/batir-ref4.ts | tail -3
