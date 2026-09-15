#!/usr/bin/env bash
# ⚠️ EN BASH, ET C'EST LE SUJET: sous zsh, `set -- $spec` ne découpe PAS le mot
# (pas de word splitting sur une expansion non quotée), et le mode part alors
# comme « one_dish 3a010001 » — c'est-à-dire un jeton inconnu, donc `null`,
# donc « rien n'a été demandé ». Un run muet qui ressemble à un run.
set -uo pipefail
cd "$(dirname "$0")"
DAYS=1 ./retry-run.sh one_dish    3a010001-0000-4000-8000-000000F0000 one_dish/run-D1    3 100000 >/dev/null 2>&1
printf '%-22s ' one_dish/run-D1;    head -c 90 one_dish/run-D1/http-response.json 2>/dev/null; echo
DAYS=1 ./retry-run.sh one_session 3a020001-0000-4000-8000-000000F0000 one_session/run-D1 3 100000 >/dev/null 2>&1
printf '%-22s ' one_session/run-D1; head -c 90 one_session/run-D1/http-response.json 2>/dev/null; echo
echo DELTA2-DONE
