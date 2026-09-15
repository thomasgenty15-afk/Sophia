#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 3 — UN TIR = UN CAS DE LA MATRICE, SA COMMANDE EXACTE, SA SORTIE
# ═══════════════════════════════════════════════════════════════════════════
#
#   ./tir.sh <nom-du-cas> <cas perte|gain> [options du banc...]
#
# ⛔ AUCUN APPEL FOURNISSEUR. Ni `--reparation-reelle` ni `--premier-jet-reel`
# n'est jamais passé : le banc remplace alors la clé par une sentinelle.
# ⛔ LA COMMANDE EXACTE EST ÉCRITE EN TÊTE DU JOURNAL, avant la moindre sortie.
set -uo pipefail
cd "$(dirname "$0")/../.."
NOM="${1:?usage: tir.sh <nom> <perte|gain> [options]}"
CAS="${2:?usage: tir.sh <nom> <perte|gain> [options]}"
shift 2
DOSSIER=scratchpad/2026-09-14-MATRICE-REJOUEE
BANC=scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts
LOG="$DOSSIER/journaux/$NOM.log"

{
  echo "COMMANDE : deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \\"
  echo "  $BANC $CAS $*"
  echo "LANCÉE LE : $(date -u +%Y-%m-%dT%H:%M:%SZ) (horloge réelle de la machine)"
  echo "───────────────────────────────────────────────────────────────────────"
} > "$LOG"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  "$BANC" "$CAS" "$@" >> "$LOG" 2>&1
CODE=$?
echo "EXIT=$CODE" >> "$LOG"
echo "── $NOM → EXIT=$CODE"
grep -E "^   (statut|appels fournisseur RÉELS|fixture écrite|plan |lignes (AJOUTÉES|RETIRÉES|RÉÉCRITES)|fenêtre attendue|CASES ATTENDUES)|✅|⛔ LE REFUS" "$LOG" | head -20
