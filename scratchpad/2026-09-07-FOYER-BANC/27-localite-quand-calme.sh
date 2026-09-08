#!/usr/bin/env bash
# Lance 26-localite.sh quand l'arbre `supabase/functions/` est CALME (aucune
# édition depuis 3 min, runtime debout depuis 3 min), et recommence si un
# redémarrage voisin a tué le run (502 en série). 4 tentatives au plus.
cd "$(dirname "$0")"; ROOT="$(cd ../.. && pwd)"
for attempt in 1 2 3 4; do
  while :; do
    n="$(find "$ROOT/supabase/functions" -name '*.ts' -mmin -3 | wc -l | tr -d ' ')"
    up="$(docker inspect -f '{{.State.StartedAt}}' supabase_edge_runtime_Sophia_2 2>/dev/null)"
    age=$(( $(date +%s) - $(date -j -f '%Y-%m-%dT%H:%M:%S' "${up%%.*}" +%s 2>/dev/null || echo 0) ))
    [ "$n" = "0" ] && [ "$age" -gt 180 ] && break
    sleep 20
  done
  echo "── tentative $attempt · $(date +%H:%M:%S) · arbre calme, runtime debout depuis ${age}s"
  bash 26-localite.sh "${1:-duo}" "${2:-2}" 2>&1 | tee "loc-run-$1-$attempt.log"
  grep -q "A→B" "loc-run-$1-$attempt.log" && { echo "✓ run complet (tentative $attempt)"; exit 0; }
  echo "✗ run incomplet, on réessaie"; sleep 60
done
echo "⛔ quatre tentatives, jamais un run complet"
