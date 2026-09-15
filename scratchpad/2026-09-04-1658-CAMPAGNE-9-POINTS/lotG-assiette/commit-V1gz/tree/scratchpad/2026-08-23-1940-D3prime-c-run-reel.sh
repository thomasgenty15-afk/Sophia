#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# D3′-c — LA `mesure APRÈS` EN BASE. **UNE GÉNÉRATION, ET UNE SEULE.**
#
# Plan: scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md, fiche `D3′-c`.
# Direction écrite AVANT: scratchpad/2026-08-23-1938-D3prime-c-DIRECTION-avant-run.md
#
# ⛔ UN TIMEOUT NE SE RÉESSAIE PAS — IL SE MESURE (§⑩ du plan).
# ⛔ Si le run ABOUTIT et que le seuil est manqué, on s'arrête et on rapporte.
#
# Jumeau de `2026-08-22-0430-V0Cquater-run-reel.sh`. Une seule différence: la
# borne temporelle de la mesure est prise en base JUSTE AVANT l'appel, et elle
# est écrite dans un fichier pour que la requête de mesure ne l'invente pas.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="/Users/ahmedamara/Dev/Sophia 2"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${REPO}/scratchpad/2026-08-23-D3primec-sortie-brute-${STAMP}.json"
BORNE_FILE="${REPO}/scratchpad/2026-08-23-D3primec-borne.txt"
PSQL=(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc)

API_URL="$(grep -m1 '^SUPABASE_URL=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"

MASTER_EMAIL="fixture.v0c.master@keeltest.dev"
MASTER_PASSWORD="1234567"
HH="b1959752-92c8-4038-8c17-992a77d68d21"
LIVE_PLAN="5f078b7e-49c0-4f8d-9ab0-4c51e19beba2"

echo "── ⓪ l'état d'avant ───────────────────────────────────────────────"
echo "   roster : $("${PSQL[@]}" "select string_agg(first_name || ':' || coalesce(diet,'—') || '/' || coalesce(goal,'—'), ' ' order by first_name) from household_members where household_id='${HH}';")"
echo "   plan vivant ${LIVE_PLAN} : durée=$("${PSQL[@]}" "select duration_days from student_generated_meals where id='${LIVE_PLAN}';") j"
echo "   générations foyer déjà comptées : $("${PSQL[@]}" "select count(*) from llm_usage_events where source='generate-household-meal-v1';")"

echo "── ① connexion du maître (mot de passe, aucun JWT forgé) ───────────"
LOGIN="$(curl -s -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON}" -H 'content-type: application/json' \
  -d "{\"email\":\"${MASTER_EMAIL}\",\"password\":\"${MASTER_PASSWORD}\"}")"
TOKEN="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')"
UID_="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("user") or {}).get("id",""))')"
if [ -z "${TOKEN}" ]; then
  echo "⛔ pas de jeton — réponse GoTrue :"; printf '%s\n' "${LOGIN}"; exit 1
fi
echo "   maître ✓ ${UID_}  (jeton ${#TOKEN} car.)"

echo "── ② LA BORNE, prise EN BASE juste avant l'appel ───────────────────"
BORNE="$("${PSQL[@]}" "select (now() at time zone 'utc')::timestamptz;")"
BORNE_TZ="$("${PSQL[@]}" "select now();")"
printf '%s\n' "${BORNE}" > "${BORNE_FILE}"
echo "   borne (UTC)  : ${BORNE}"
echo "   borne (tz db): ${BORNE_TZ}"
echo "   horloge hôte : $(date '+%Y-%m-%d %H:%M:%S %Z') / $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

BODY='{"operation":"compose","window":{"kind":"days","count":7},"intent":"prepare_next","replaces":null,"context":null,"cooking_shape":null,"preferences":null}'

echo "── ③ LE RUN — UNE génération ──────────────────────────────────────"
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

echo "── ④ le plan vivant, relu APRÈS ───────────────────────────────────"
echo "   ${LIVE_PLAN} : durée=$("${PSQL[@]}" "select duration_days from student_generated_meals where id='${LIVE_PLAN}';") j"
echo "   générations foyer comptées APRÈS : $("${PSQL[@]}" "select count(*) from llm_usage_events where source='generate-household-meal-v1';")"

echo "── ⑤ les 2000 premiers octets de la réponse ───────────────────────"
head -c 2000 "${OUT}"; echo
