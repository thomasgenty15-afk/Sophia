#!/usr/bin/env bash
# LA DISCIPLINE DU LOT : PLUSIEURS RUNS SUR LES **MÊMES** ENTRÉES.
# Un plan ne prouve rien — le modèle varie. On distingue le défaut
# SYSTÉMATIQUE du tirage malheureux en rejouant la même requête.
#
#   ./batch.sh <premier-index> <dernier-index>
# Variables: DAYS, STARTS, SHAPE (défaut none)
set -uo pipefail
HERE="/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/05-qualite-foyer"
FROM="$1"; TO="$2"
SHAPE="${SHAPE:-none}"
for i in $(seq "$FROM" "$TO"); do
  RID=$(printf '5a0000%02d-0000-4000-8000-0000000000%02d' "$i" "$i")
  OUT="$HERE/plan-$i"
  echo "########## plan-$i  rid=$RID  shape=$SHAPE  days=${DAYS:-1}"
  ( cd "$HERE" && DAYS="${DAYS:-1}" STARTS="${STARTS:-2026-08-19}" ./run.sh "$SHAPE" "$RID" "$OUT" )
  # ⚠️ 502 Kong / expiration : on relance UNE fois, avec un request_id NEUF
  # (rejouer le même id empile les événements et le vidage rend alors l'erreur
  # d'un run qu'on n'a pas mesuré).
  ST=$(cat "$OUT/http-status.txt" 2>/dev/null || echo "000")
  if [ "$ST" != "200" ]; then
    RID2="${RID%??}r$i"
    echo "---- plan-$i a rendu $ST, relance avec $RID2"
    ( cd "$HERE" && DAYS="${DAYS:-1}" STARTS="${STARTS:-2026-08-19}" ./run.sh "$SHAPE" "$RID2" "$OUT" )
  fi
  sleep 4
done
echo "########## FINI"
