#!/usr/bin/env bash
# LA SÉRIE DE LA PHASE 1 — un tir après l'autre, jamais en parallèle.
# ⛔ Deux générations simultanées se disputent le même runtime edge et
# l'écriture d'une session voisine les tue toutes les deux.
set -uo pipefail
cd "$(dirname "$0")"
run() { echo; bash 20-run.sh "$@" 2>&1; }
run C01 solo 7
run C02 duo 7
run C03 quatre 7 balanced 2
run C04 quatre 7 balanced 1
run C05 quatre 7 balanced 1 '["oven","stovetop","fridge"]'
run C06 cinq 7 keen 3
run C07 cinq 7 minimal 3
echo; echo "══ SÉRIE C TERMINÉE ══"
