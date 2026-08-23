#!/usr/bin/env bash
# LA SÉRIE — les trois modes, plusieurs runs chacun, ALTERNÉS.
#
# ⚠️ ALTERNÉS ET PAS GROUPÉS: le poste varie (conteneur recréé, modèle de repli
# qui expire une fois sur deux). Trois runs `one_dish` d'affilée puis trois
# `one_session` compareraient deux modes ET deux états de poste.
# ⚠️ PLUSIEURS RUNS PAR MODE: le modèle VARIE sur des entrées identiques; un
# seul run ne distingue pas une règle d'un tirage.
# ⚠️ UN request_id PAR RUN *ET* PAR TENTATIVE: `<mode>…0000000<run>000<essai>`.
set -uo pipefail
cd "$(dirname "$0")"
FROM="${FROM:-2}"; TO="${TO:-3}"
for n in $(seq "$FROM" "$TO"); do
  for spec in "one_dish 3a010001" "one_session 3a020001" "separate_sessions 3a030001"; do
    set -- $spec
    mode="$1"; pfx="$2"
    DAYS=1 ./retry-run.sh "$mode" "${pfx}-0000-4000-8000-0000000${n}000" "$mode/run-$n" 4 100000 >/dev/null 2>&1
    printf '%-26s ' "$mode/run-$n"
    head -c 70 "$mode/run-$n/http-response.json" 2>/dev/null; echo
  done
done
echo BATCH-DONE
