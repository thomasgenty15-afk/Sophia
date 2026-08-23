#!/usr/bin/env bash
# ===========================================================================
# AGENT 2A — un LOT de runs réels, SÉQUENTIEL, avec reprise.
#   ./batch.sh <iteration> <numero-de-run> <dossier> [scenarios...]
# ===========================================================================
# ⚠️ SÉQUENTIEL, ET C'EST UNE MESURE, PAS UNE PRUDENCE. La première version
# lançait les cinq scénarios EN PARALLÈLE. Résultat lu dans
# `llm_raw_response_events`: des dizaines de `retryable_status` puis des
# `breaker_skip` — le disjoncteur du fournisseur s'était ouvert. Un autre agent
# du chantier (`06-attribution-allergies`) tape le même point de passage au
# même moment. Deux agents en parallèle sur un poste local, ce n'est pas cinq
# fois plus vite, c'est zéro.
#
# ⚠️ Le conteneur edge est aussi recréé par la session voisine: un run meurt
# alors en 502 Kong. On ne conclut RIEN d'un 502 — on attend et on relance.
set -uo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
H="$ROOT/scratchpad/qa-generation/02-ponderation-solo/harness"
ITER="$1"; RUN="$2"; OUT="$3"; shift 3
SCEN=("$@"); [ ${#SCEN[@]} -eq 0 ] && SCEN=(1 2 3 4 5)

wait_edge() {
  for _ in $(seq 1 90); do
    if docker ps --format '{{.Names}}' | grep -q supabase_edge_runtime_Sophia_2; then
      code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \
        "http://127.0.0.1:54321/functions/v1/generate-meal-v1" --max-time 5)
      [ "$code" != "502" ] && [ "$code" != "000" ] && return 0
    fi
    sleep 5
  done
  return 1
}

# Le disjoncteur du fournisseur reste ouvert un moment: on le laisse se
# refermer plutôt que de le rouvrir à chaque tentative.
breaker_open() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -t -A -c \
    "select count(*) from llm_raw_response_events where status='breaker_skip' and created_at > now() - interval '90 seconds';" 2>/dev/null
}

for S in "${SCEN[@]}"; do
  ok=0
  for attempt in $(seq 1 10); do
    wait_edge || { echo "S$S: runtime edge absent"; break; }
    n=$(breaker_open); n=${n:-0}
    if [ "$n" -gt 0 ] 2>/dev/null; then
      echo "S$S: disjoncteur ouvert ($n), pause 120 s"
      sleep 120
      continue
    fi
    bash "$H/run.sh" "$S" "$ITER" "$RUN" "$OUT/scenario-$S/run-$RUN" \
      > "$OUT/scenario-$S-run$RUN.log" 2>&1
    line=$(grep -h "^S" "$OUT/scenario-$S-run$RUN.log" 2>/dev/null || true)
    echo "$line"
    case "$line" in
      *"HTTP=200"*|*"HTTP=4"*) ok=1 ;;
      *) sleep 45 ;;
    esac
    [ "$ok" = 1 ] && break
  done
  sleep 20
done
