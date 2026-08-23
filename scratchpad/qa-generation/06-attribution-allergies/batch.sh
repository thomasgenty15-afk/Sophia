#!/usr/bin/env bash
# Série AVANT/APRÈS sur le MÊME cas construit, avec la bascule au milieu.
# ⚠️ Un seul run vert ne prouve rien: 1V a mesuré que le modèle VARIE sur des
# entrées identiques (F1 réussit par chance là où F2 échoue).
set -uo pipefail
cd "$(dirname "$0")"
IDX="supabase/functions/generate-household-meal-v1/index.ts"
ROOT="/Users/ahmedamara/Dev/Sophia 2"
toggle() { # $1 = avant|apres
  if [ "$1" = "avant" ]; then
    perl -0pi -e 's/        mouths: composedMembers\.length,/        mouths: 1, \/\/ TEMP-AVANT\/APRES/' "$ROOT/$IDX"
  else
    perl -0pi -e 's/        mouths: 1, \/\/ TEMP-AVANT\/APRES/        mouths: composedMembers.length,/' "$ROOT/$IDX"
  fi
  grep -n "mouths:" "$ROOT/$IDX" | head -2
  docker restart supabase_edge_runtime_Sophia_2 >/dev/null 2>&1 || true
}
toggle avant
for n in 5 6 7; do ./retry-run.sh b000000$n-0000-4000-8000-00000000000$n runs/AVANT-$n 12 35 >/dev/null 2>&1; echo "AVANT-$n fait"; done
toggle apres
for n in 4 5 6 7; do ./retry-run.sh a100000$n-0000-4000-8000-00000000000$n runs/APRES-$n 12 35 >/dev/null 2>&1; echo "APRES-$n fait"; done
echo BATCH-DONE
