#!/usr/bin/env bash
# LA SUITE, ENCHAÎNÉE : ① le mode « une seule casserole », ② le delta de cible.
# Chaque étape attend la précédente — deux runs simultanés se voleraient la
# fenêtre du plan (409 `plan_overlaps_existing`).
set -uo pipefail
HERE="/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/05-qualite-foyer"
cd "$HERE"

echo "===== ① one_dish, 2 runs, fenêtre 2 jours ====="
DAYS=2 STARTS=2026-08-19 ./batch-shape.sh one_dish onedish 2

echo "===== ② DELTA: la cible d'Ivar ====="
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
  < "$HERE/2026-08-19-0400-5a-delta-cible-ivar.sql"

echo "===== ③ 2 runs APRÈS le delta, mode calculé ====="
DAYS=2 STARTS=2026-08-19 ./batch-shape.sh none plandelta 2

echo "===== SUITE FINIE ====="
