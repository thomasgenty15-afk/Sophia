#!/usr/bin/env bash
# LA MESURE DES DIX (reprise corrigée) — fige chaque artefact (demande, roster, échanges, journal archivé),
# passe l'instrument, et range analyse + fixture sous des noms stables c30-NN-pP.
set -uo pipefail
cd "$(dirname "$0")/../.."
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export /')"
export SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
TABLE="${1:-/private/tmp/claude-502/campagne-10/campagne-10.tsv}"
M=scratchpad/2026-09-15-BETA-PREUVES/mesure-10; mkdir -p "$M"
tail -n +2 "$TABLE" | while IFS=$'\t' read -r n p compte http duree appels rep verrou sortie; do
  [ -f "$sortie" ] || { echo "tir $n : artefact absent"; continue; }
  nom="c41-$(printf '%02d' "$n")-p$p"
  deno run --allow-read --allow-env --allow-net --allow-write=scratchpad scratchpad/2026-09-11-CLOTURE/figer-demande.ts "$sortie" --journal=/private/tmp/claude-502/functions-serve.log --nom="$nom" > "$M/$nom.figer.txt" 2>&1
  deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts "scratchpad/2026-09-11-CLOTURE/fixtures/$nom.json" > "$M/$nom.txt" 2>&1
  echo "tir $n · profil $p · $(grep -E 'cases attendues' "$M/$nom.figer.txt" | head -1 | sed 's/ · FIGÉE.*//') · $(grep -A6 'BILAN DU FOYER' "$M/$nom.txt" | grep TOTAL | sed 's/TOTAL *//')"
done
