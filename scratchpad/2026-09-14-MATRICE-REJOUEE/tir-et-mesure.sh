#!/usr/bin/env bash
# tir.sh puis mesurer.sh sur la sortie que le tir vient d'écrire.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=scratchpad/2026-09-14-MATRICE-REJOUEE
NOM="${1:?}"; shift
"$D/tir.sh" "$NOM" "$@" 2>&1 | tail -30
SORTIE=$(grep -m1 "fixture écrite" "$D/journaux/$NOM.log" | sed 's/.*fixture écrite : //')
if [ -z "$SORTIE" ] || [ ! -f "$SORTIE" ]; then
  echo "── PAS DE FIXTURE ÉCRITE pour $NOM (refus attendu ?)"
  exit 0
fi
echo "── sortie : $SORTIE"
"$D/mesurer.sh" "$NOM" "$SORTIE"
grep -E "TOTAL |SANS OBJET |livraison :" "$D/journaux/$NOM.grille.txt" | tail -6
