#!/usr/bin/env bash
# Relance jusqu'à ce qu'un plan NEUF soit écrit. Le conteneur edge est recréé
# toutes les 2-3 min par une session voisine ⇒ 502 Kong en plein vol; on ne
# conclut rien d'un 502, on relance.
set -uo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
PREFIX="$1"; OUT="$2"; MAX="${3:-8}"
Q="select id from student_generated_meals where household_id=(select household_id from household_members where user_id='1e000000-0000-4000-8000-000000000002') order by created_at desc limit 1;"
BEFORE=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "$Q")
for i in $(seq 1 "$MAX"); do
  RID="${PREFIX}-0000-4000-8000-00000000000$i"
  echo "### tentative $i  ($RID)"
  "$ROOT/scratchpad/qa-generation/2026-08-19-lot-porte-moteur/run.sh" "$RID" "$OUT" 2>&1 | grep -E "^HTTP|^\{|attempt_start|success" | head -5
  AFTER=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "$Q")
  if [ "$AFTER" != "$BEFORE" ]; then echo "### PLAN NEUF: $AFTER (tentative $i)"; exit 0; fi
  sleep 5
done
echo "### aucun plan neuf après $MAX tentatives"; exit 1
