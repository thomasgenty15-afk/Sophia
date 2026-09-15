#!/usr/bin/env bash
# LA SÉRIE — même cas construit, même fenêtre, la bascule au milieu.
# ⚠️ Un seul run vert ne prouve rien: 1V a mesuré que le modèle VARIE sur des
# entrées identiques (F1 réussit par chance là où F2 échoue au pistachio).
set -uo pipefail
cd "$(dirname "$0")"
ROOT="/Users/ahmedamara/Dev/Sophia 2"
IDX="$ROOT/supabase/functions/generate-household-meal-v1/index.ts"
toggle() {
  if [ "$1" = "avant" ]; then
    perl -0pi -e 's/        mouths: composedMembers\.length,/        mouths: 1, \/\/ TEMP-AVANT\/APRES/' "$IDX"
  else
    perl -0pi -e 's/        mouths: 1, \/\/ TEMP-AVANT\/APRES/        mouths: composedMembers.length,/' "$IDX"
  fi
  echo "== bascule $1 =="; grep -n "TEMP-AVANT\|mouths: composedMembers" "$IDX"
  docker restart supabase_edge_runtime_Sophia_2 >/dev/null 2>&1 || true
}
ARM="$1"; shift
toggle "$ARM"
PREFIX=$([ "$ARM" = avant ] && echo b || echo a)
LABEL=$([ "$ARM" = avant ] && echo AVANT || echo APRES)
SER="${SER:-2}"
for n in "$@"; do
  ./retry-run.sh ${PREFIX}${SER}00000${n}-0000-4000-8000-00000000000${n} runs/${LABEL}-V${SER}-${n} 14 35 >/dev/null 2>&1
  printf '%s ' "${LABEL}-V${SER}-${n}"; head -c 90 runs/${LABEL}-V${SER}-${n}/http-response.json 2>/dev/null; echo
done
echo "SERIE-$ARM-DONE"
