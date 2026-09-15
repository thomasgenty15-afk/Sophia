#!/usr/bin/env bash
# LES RUNS DE MODE ET DE DELTA — mêmes trois fichiers, dossiers nommés.
#   ./batch-shape.sh <shape|none> <préfixe> <n>
# Variables: DAYS, STARTS
set -uo pipefail
HERE="/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/05-qualite-foyer"
SHAPE="$1"; PREFIX="$2"; N="$3"
for i in $(seq 1 "$N"); do
  RID=$(printf '5a0000%s%d-0000-4000-8000-0000000000%02d' "${PREFIX:0:1}" "$i" "$i")
  # ⚠️ un `request_id` doit être un UUID valide: on le fabrique à partir d'un
  # compteur, jamais du nom du dossier.
  RID=$(python3 -c "import uuid;print(uuid.uuid5(uuid.NAMESPACE_DNS,'$PREFIX-$i-'+__import__('time').strftime('%H%M%S')))")
  OUT="$HERE/$PREFIX-$i"
  echo "########## $PREFIX-$i  rid=$RID  shape=$SHAPE  days=${DAYS:-1}"
  ( cd "$HERE" && DAYS="${DAYS:-1}" STARTS="${STARTS:-2026-08-19}" ./run.sh "$SHAPE" "$RID" "$OUT" )
  ST=$(cat "$OUT/http-status.txt" 2>/dev/null || echo "000")
  if [ "$ST" != "200" ]; then
    cp "$OUT/http-response.json" "$OUT/FAILED-$ST.json" 2>/dev/null
    rm -f "$OUT/plan-payload.json" "$OUT/plan-written.json"
    RID2=$(python3 -c "import uuid;print(uuid.uuid5(uuid.NAMESPACE_DNS,'$PREFIX-$i-retry-'+__import__('time').strftime('%H%M%S')))")
    echo "---- $PREFIX-$i a rendu $ST, relance avec $RID2"
    ( cd "$HERE" && DAYS="${DAYS:-1}" STARTS="${STARTS:-2026-08-19}" ./run.sh "$SHAPE" "$RID2" "$OUT" )
  fi
  sleep 3
done
echo "########## FINI"
