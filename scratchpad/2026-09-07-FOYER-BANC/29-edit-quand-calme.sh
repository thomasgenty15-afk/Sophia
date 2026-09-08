#!/usr/bin/env bash
cd "$(dirname "$0")"; ROOT="$(cd ../.. && pwd)"
for attempt in 1 2 3 4; do
  while :; do
    n="$(find "$ROOT/supabase/functions" -name '*.ts' -mmin -2 | wc -l | tr -d ' ')"
    docker ps --format '{{.Status}}' --filter name=edge_runtime | grep -q "Up [0-9]* minutes\|Up [0-9]* hours" && [ "$n" = "0" ] && break
    sleep 15
  done
  echo "── tentative $attempt · $(date +%H:%M:%S)"
  bash 28-tir-edit.sh "${1:-duo}" "${2:-2}" 2>&1 | tee "edit-run-$1-$attempt.log"
  grep -q "hors case visée\|⛔ B refusé" "edit-run-$1-$attempt.log" && { echo "✓ run complet"; exit 0; }
  sleep 45
done
echo "⛔ quatre tentatives"
