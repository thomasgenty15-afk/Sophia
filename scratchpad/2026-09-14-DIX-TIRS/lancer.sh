#!/usr/bin/env bash
# Dix tirs réels, un processus Deno par tir. Aucune relance silencieuse.
# Compte neuf : --compte=b10 (lotf.camp<N>.b10@keeltest.dev).
set -u
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
OUT="$ROOT/scratchpad/2026-09-14-DIX-TIRS"
COMPTE=b10
mkdir -p "$OUT/journaux" "$OUT/sorties"
RESUME="$OUT/journaux/campagne.log"
echo "CAMPAGNE DIX TIRS · $(date -Iseconds) · compte=$COMPTE" | tee "$RESUME"

for n in 1 2 3 4 5 6 7 8 9 10; do
  echo "" | tee -a "$RESUME"
  echo "===== TIR $n DEBUT $(date -Iseconds) =====" | tee -a "$RESUME"
  set +e
  deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
    scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts "$n" --compte="$COMPTE" \
    > "$OUT/journaux/tir$n.lancer.log" 2>&1
  EXIT=$?
  set -e
  SORTIE=$(ls -t scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir${n}-${COMPTE}-*.json 2>/dev/null | head -1 || true)
  if [ -n "${SORTIE:-}" ] && [ -f "$SORTIE" ]; then
    cp "$SORTIE" "$OUT/sorties/"
    echo "sortie=$SORTIE exit=$EXIT" | tee -a "$RESUME"
    set +e
    deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
      scratchpad/2026-09-11-CLOTURE/figer-demande.ts "$SORTIE" --nom="dix-tir$n" \
      > "$OUT/journaux/tir$n.gel.log" 2>&1
    GEL=$?
    deno run --allow-read \
      scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
      "scratchpad/2026-09-11-CLOTURE/fixtures/dix-tir$n.json" \
      > "$OUT/journaux/tir$n.grille.txt" 2>&1
    GRILLE=$?
    set -e
    echo "gel=$GEL grille=$GRILLE fixture=scratchpad/2026-09-11-CLOTURE/fixtures/dix-tir$n.json" | tee -a "$RESUME"
  else
    echo "⛔ aucune sortie écrite · exit=$EXIT" | tee -a "$RESUME"
  fi
  echo "===== TIR $n TERMINE $(date -Iseconds) exit=$EXIT =====" | tee -a "$RESUME"
done

echo "CAMPAGNE DIX TIRS FINIE $(date -Iseconds)" | tee -a "$RESUME"
