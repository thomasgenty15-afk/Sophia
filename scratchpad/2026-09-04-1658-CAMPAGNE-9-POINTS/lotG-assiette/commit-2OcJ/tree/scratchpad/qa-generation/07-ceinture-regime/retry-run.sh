#!/usr/bin/env bash
# Relance un run jusqu'à obtenir une réponse du PRODUIT (pas un 502 / WORKER_LIMIT).
#
# ⚠️ POSTE PARTAGÉ, MESURÉ: le conteneur edge est recréé toutes les ~2 min par
# le `functions serve` d'une session voisine, et le modèle de repli
# (`gemini-3-flash-preview`) expire à 60 s une fois sur deux sur cette lane.
# Partir au milieu de la vie d'un conteneur, c'est perdre le run en vol.
#
# ⚠️ UN `request_id` PAR TENTATIVE. Rejouer le MÊME id empile les événements de
# plusieurs appels sous une seule ligne et le vidage rend alors le DERNIER —
# c'est-à-dire l'erreur d'un run qu'on n'a pas mesuré. Le suffixe est le numéro
# de tentative, et le dossier garde l'id réellement servi.
#   ./retry-run.sh <shape|none> <request-id-base> <dossier> [max] [maxage]
set -uo pipefail
cd "$(dirname "$0")"
SHAPE="$1"; BASE="$2"; OUT="$3"; MAX="${4:-8}"; MAXAGE="${5:-30}"
age() {
  local s; s=$(docker inspect -f '{{.State.StartedAt}}' supabase_edge_runtime_Sophia_2 2>/dev/null) || return 1
  python3 - "$s" <<'PY'
import sys,datetime
t=sys.argv[1][:19]
d=datetime.datetime.strptime(t,"%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)
print(int((datetime.datetime.now(datetime.timezone.utc)-d).total_seconds()))
PY
}
for i in $(seq 1 "$MAX"); do
  while :; do
    a=$(age) || { sleep 3; continue; }
    [ "$a" -le "$MAXAGE" ] && break
    sleep 4
  done
  sleep 2
  RID="${BASE:0:35}$i"
  ./run.sh "$SHAPE" "$RID" "$OUT" 2>&1 | tail -16
  if grep -qE "invalid response was received|WORKER_LIMIT|Worker failed" "$OUT/http-response.json" 2>/dev/null; then
    echo "== poste (502 / WORKER_LIMIT), tentative $i/$MAX, on relance =="
    continue
  fi
  echo "$RID" > "$OUT/request-id.txt"
  echo "== réponse produit obtenue à la tentative $i (rid=$RID) =="; exit 0
done
echo "== abandon après $MAX tentatives =="; exit 1
