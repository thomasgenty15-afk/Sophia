#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 2026-09-14 — UN TIR = UN CAS, SA COMMANDE EXACTE EN TÊTE DE JOURNAL
# ═══════════════════════════════════════════════════════════════════════════
#
#   ./tir.sh <nom-du-cas> <perte|gain> [options du banc...]
#
# ⛔ AUCUN APPEL FOURNISSEUR PAYANT. Ni `--reparation-reelle` ni
# `--premier-jet-reel` n'est jamais passé : sans eux le banc remplace la clé
# par une sentinelle et toute sortie réseau hors pile locale jette.
# ⛔ LE BANC EST LA COPIE DU 2026-09-14, pas `banc-lot-F.ts` : une autre
# session rejoue des tirs sur l'original pendant ce chantier.
set -uo pipefail
cd "$(dirname "$0")/../.."
NOM="${1:?usage: tir.sh <nom> <perte|gain> [options]}"
CAS="${2:?usage: tir.sh <nom> <perte|gain> [options]}"
shift 2
DOSSIER=scratchpad/2026-09-14-TITULAIRE-SANS-AGE
BANC="$DOSSIER/banc-titulaire-sans-age.ts"
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
grep -E "^   (statut|corps|appels fournisseur RÉELS|fixture écrite|plan |lignes (AJOUTÉES|RETIRÉES|RÉÉCRITES)|fenêtre attendue|CASES ATTENDUES|bouche|compte)|SANS DATE|REFUS SANS ÉCRITURE|✅|⛔" "$LOG" | cut -c1-220 | head -24
