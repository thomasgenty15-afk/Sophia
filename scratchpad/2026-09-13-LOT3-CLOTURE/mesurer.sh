#!/usr/bin/env bash
#   ./mesurer.sh <nom-du-cas> <chemin-de-la-sortie-du-banc>
# ⛔ `analyse-lot-F.ts` sur la sortie BRUTE rend « 0 bouche(s) » : ce n'est pas
# « aucune conformité », c'est AUCUNE MESURE. On gèle donc la demande d'abord.
set -uo pipefail
cd "$(dirname "$0")/../.."
NOM="${1:?usage: mesurer.sh <nom> <sortie.json>}"
SORTIE="${2:?usage: mesurer.sh <nom> <sortie.json>}"
DOSSIER=scratchpad/2026-09-13-LOT3-CLOTURE
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-CLOTURE/figer-demande.ts "$SORTIE" --nom="lot3f-$NOM" \
  > "$DOSSIER/journaux/$NOM.gel.log" 2>&1
echo "gel EXIT=$? → scratchpad/2026-09-11-CLOTURE/fixtures/lot3f-$NOM.json"
deno run --allow-read --allow-env --allow-net \
  scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
  "scratchpad/2026-09-11-CLOTURE/fixtures/lot3f-$NOM.json" \
  > "$DOSSIER/journaux/$NOM.grille.txt" 2>&1
echo "grille EXIT=$? → $DOSSIER/journaux/$NOM.grille.txt"
