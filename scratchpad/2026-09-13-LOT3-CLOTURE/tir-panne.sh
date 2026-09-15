#!/usr/bin/env bash
#   LOT3_PANNE=<""|controle|journal> ./tir-panne.sh <nom> <perte|gain> [options]
# ⛔ La carte d'import ne remplace QUE la fonction `validate` passée à
# `decidePlanPublication`. Aucun fichier de production n'est modifié.
set -uo pipefail
cd "$(dirname "$0")/../.."
NOM="${1:?}"; CAS="${2:?}"; shift 2
DOSSIER=scratchpad/2026-09-13-LOT3-CLOTURE
BANC=scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts
LOG="$DOSSIER/journaux/$NOM.log"
{
  echo "COMMANDE : LOT3_PANNE=${LOT3_PANNE:-} deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \\"
  echo "  --import-map=$DOSSIER/carte-import.json $BANC $CAS $*"
  echo "LANCÉE LE : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "───────────────────────────────────────────────────────────────────────"
} > "$LOG"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  --import-map="$DOSSIER/carte-import.json" "$BANC" "$CAS" "$@" >> "$LOG" 2>&1
CODE=$?
echo "EXIT=$CODE" >> "$LOG"
echo "── $NOM (LOT3_PANNE=${LOT3_PANNE:-∅}) → EXIT=$CODE"
grep -E "SHIM|^   statut|^   corps|lignes (AJOUTÉES|RETIRÉES|RÉÉCRITES)|REFUS SANS ÉCRITURE|^   plan |output_lock_journal_failed" "$LOG" | cut -c1-300 | head -12
