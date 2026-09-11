#!/usr/bin/env bash
# LA SUITE DE LA SÉRIE C — copie FIGÉE, on n'édite jamais celle qui tourne.
# ⛔ Bash relit un script par OFFSET: éditer le fichier sous le processus décale
# les lignes et le tue en vol. Payé le 2026-09-04 sur C03.
set -uo pipefail
cd "$(dirname "$0")"
run() { echo; bash 20-run.sh "$@" 2>&1; sleep 20; }
run C02 duo 7
run C03 quatre 7 balanced 2
run C04 quatre 7 balanced 1
run C05 quatre 7 balanced 1 '["oven","stovetop","fridge"]'
run C06 cinq 7 keen 3
run C07 cinq 7 minimal 3
echo; echo "══ SÉRIE C TERMINÉE ══"
