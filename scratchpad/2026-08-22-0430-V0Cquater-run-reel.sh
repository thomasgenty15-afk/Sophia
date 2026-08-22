#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# V0-C-quater — LE RUN RÉEL (vague 1, plan 2026-08-21)
#
# ⛔ UNE GÉNÉRATION, ET UNE SEULE. Elle est imputée au plafond de la VAGUE 1
# (9), pas au reliquat de la vague 0.
#
# ⛔ UN TIMEOUT NE SE RÉESSAIE PAS — IL SE MESURE. `PLAN_HTTP_TIMEOUT_MS` = 300 s
# est l'horloge en vigueur (médiane foyer mesurée 66 s, max 210 s). Si l'appel
# expire, la cause est AILLEURS : on lit les logs du runtime, on ne relance pas.
# ⚠️ `where status <> 'success'` rend zéro ligne, toujours : un appel qui expire
# n'écrit AUCUN événement.
#
# Jumeau littéral de `2026-08-21-2355-V0D-run-reel.sh`, deux différences près :
#   · la fixture porte désormais DEUX régimes déclarés (Malo `vegan`,
#     Yanis `vegetarian`) — c'est tout l'objet du lot ;
#   · un plan foyer VIT déjà (`3c781a71`, 2026-08-21, 7 j). La fenêtre
#     `{days,7}` part d'AUJOURD'HUI : elle commence APRÈS lui, donc
#     `write_student_meal_plan` le TRONQUE au lieu de refuser
#     (`plan_overlaps_existing` ne se lève que si le plan vivant commence LE
#     MÊME JOUR ou APRÈS). Ce script écrit sa durée AVANT et APRÈS, parce
#     qu'une troncature silencieuse du plan de référence de `V0-D` serait
#     découverte trois vagues plus tard.
#
# ⚠️ `intent` : `commit` N'EXISTE PAS (§⑨ n° 17). Les trois mots sont
# `replace_current`, `prepare_next`, `draft`; `replace_current` exige un
# `replaces`. Le mot qui écrit est `prepare_next`.
# ⚠️ `window` : sans elle, `window_required` (400) est levé AVANT
# `goal_required` (409). Un 400 ne veut PAS dire « objectif manquant ».
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="/Users/ahmedamara/Dev/Sophia 2"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${REPO}/scratchpad/2026-08-22-0430-V0Cquater-sortie-brute-${STAMP}.json"
PSQL=(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc)

API_URL="$(grep -m1 '^SUPABASE_URL=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"

MASTER_EMAIL="fixture.v0c.master@keeltest.dev"
MASTER_PASSWORD="1234567"
V0D_PLAN="3c781a71-da7c-4abe-8a99-4a6ed7445c99"

echo "── ⓪ l'état d'avant, écrit ────────────────────────────────────────"
echo "   horodatage du lancement (UTC) : $("${PSQL[@]}" "select now() at time zone 'utc';")"
echo "   roster : $("${PSQL[@]}" "select string_agg(first_name || ':' || coalesce(diet,'—'), ' ' order by first_name) from household_members where household_id='b1959752-92c8-4038-8c17-992a77d68d21';")"
echo "   plan V0-D ${V0D_PLAN} : durée=$("${PSQL[@]}" "select duration_days from student_generated_meals where id='${V0D_PLAN}';") j"

echo "── ① connexion du maître (mot de passe) ────────────────────────────"
LOGIN="$(curl -s -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON}" -H 'content-type: application/json' \
  -d "{\"email\":\"${MASTER_EMAIL}\",\"password\":\"${MASTER_PASSWORD}\"}")"
TOKEN="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')"
UID_="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("user") or {}).get("id",""))')"
if [ -z "${TOKEN}" ]; then
  echo "⛔ pas de jeton — réponse GoTrue :"; printf '%s\n' "${LOGIN}"; exit 1
fi
echo "   maître ✓ ${UID_}  (jeton ${#TOKEN} car.)"

BODY='{"operation":"compose","window":{"kind":"days","count":7},"intent":"prepare_next","replaces":null,"context":null,"cooking_shape":null,"preferences":null}'

echo "── ② LE RUN — une génération ──────────────────────────────────────"
echo "   corps : ${BODY}"
echo "   début : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
HTTP_AND_TIME="$(curl -s -o "${OUT}" -w '%{http_code} %{time_total}' \
  --max-time 900 \
  -X POST "${API_URL}/functions/v1/generate-household-meal-v1" \
  -H "apikey: ${ANON}" \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d "${BODY}")"
RC=$?
echo "   fin   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "   curl rc=${RC} · http=${HTTP_AND_TIME%% *} · durée=${HTTP_AND_TIME##* } s"
echo "   sortie brute → ${OUT}  ($(wc -c < "${OUT}" | tr -d ' ') octets)"
echo "── ③ le plan de V0-D, relu APRÈS ──────────────────────────────────"
echo "   ${V0D_PLAN} : durée=$("${PSQL[@]}" "select duration_days from student_generated_meals where id='${V0D_PLAN}';") j · tronqué_par=$("${PSQL[@]}" "select coalesce(generated_from->>'truncated_by','—') from student_generated_meals where id='${V0D_PLAN}';")"
echo "── ④ les 1500 premiers octets ─────────────────────────────────────"
head -c 1500 "${OUT}"; echo
