#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# V0-D — LE RUN RÉEL (vague 0, plan 2026-08-21)
#
# ⛔ UNE GÉNÉRATION PAR EXÉCUTION. Le plafond de la vague 0 est de 3.
#
# Ce que ce fichier fait, et rien d'autre :
#   ① il se CONNECTE par mot de passe au maître de la fixture V0-C
#      (jamais `service_role`, jamais un JWT forgé — cicatrice
#      « ne jamais viser un compte sans mot de passe ») ;
#   ② il appelle `generate-household-meal-v1` avec le corps que le FRONT
#      envoie (`planDraft.ts :: callGenerator`, branche `household`) ;
#   ③ il écrit la réponse BRUTE à côté, horodatée.
#
# ⚠️ `intent` : le plan dit « commit, jamais draft ». Les trois mots que la
# lane accepte sont `replace_current`, `prepare_next`, `draft`
# (`index.ts:1076-1092`). `replace_current` EXIGE un `replaces`
# (`replaces_required`, 400) et la fixture n'a aucun plan vivant :
# le mot qui écrit ici est donc `prepare_next`.
#
# ⚠️ `window` : sans elle, `window_required` (400) est levé AVANT
# `goal_required` (409) — `index.ts:1453-1461`.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="/Users/ahmedamara/Dev/Sophia 2"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${REPO}/scratchpad/2026-08-21-2355-V0D-sortie-brute-${STAMP}.json"

API_URL="$(grep -m1 '^SUPABASE_URL=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"

MASTER_EMAIL="fixture.v0c.master@keeltest.dev"
MASTER_PASSWORD="1234567"

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
echo "── ③ les 2000 premiers octets ─────────────────────────────────────"
head -c 2000 "${OUT}"; echo
