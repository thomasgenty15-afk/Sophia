#!/usr/bin/env bash
# Relance un run jusqu'à obtenir une réponse du PRODUIT (pas un 502 Kong).
#
# ⚠️ POSTE PARTAGÉ, MESURÉ: le conteneur edge est recréé toutes les ~2 min 10 s
# par le `functions serve` d'une session voisine, et un run de cette lane dure
# ~50 s. Partir au milieu de la vie d'un conteneur, c'est perdre le run en vol
# sur un 502 Kong — qui n'apprend rien et ne se conclut pas.
# On attend donc un conteneur JEUNE (moins de MAXAGE secondes) avant de partir.
set -uo pipefail
RID="$1"; OUT="$2"; MAX="${3:-6}"; MAXAGE="${4:-35}"
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
    sleep 5
  done
  sleep 3
  ./run.sh "$RID" "$OUT" 2>&1 | tail -12
  if ! grep -q "invalid response was received" "$OUT/http-response.json" 2>/dev/null; then
    echo "== réponse produit obtenue à la tentative $i =="; exit 0
  fi
  echo "== 502 Kong, tentative $i/$MAX, on relance =="
done
echo "== abandon après $MAX tentatives =="; exit 1
