#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# UN TIR — CAMPAGNE 9 POINTS
#   bash 20-run.sh <cas> <fixture> <jours> [style] [courses] [equip] [tz]
#     ex: bash 20-run.sh C03 quatre 7
#         bash 20-run.sh C04 quatre 7 balanced 1
#         bash 20-run.sh C07 cinq 7 minimal 3
#
# `intent: draft` — RIEN N'EST ÉCRIT, et toutes les gardes amont mordent à
# l'identique. Aucun `plan_overlaps_existing` entre deux tirs.
#
# ⚠️ L'EMPREINTE DU CODE encadre le tir: d'autres sessions écrivent sous
# `supabase/functions/`, et `functions serve` recrée le conteneur à chaque
# écriture. Deux runs séparés par une édition ne comparent pas deux décors, ils
# comparent deux codes.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

CAS="$1"; FIXTURE="$2"; JOURS="${3:-7}"
STYLE="${4:-}"; COURSES="${5:-}"; EQUIP="${6:-}"; TZ_CASE="${7:-}"

case "$FIXTURE" in
  solo) EMAIL="$SOLO_EMAIL"; FN="generate-meal-v1";;
  duo) EMAIL="$DUO_EMAIL"; FN="generate-household-meal-v1";;
  quatre) EMAIL="$QUATRE_EMAIL"; FN="generate-household-meal-v1";;
  cinq) EMAIL="$CINQ_EMAIL"; FN="generate-household-meal-v1";;
  *) echo "⛔ fixture inconnue: $FIXTURE"; exit 2;;
esac
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $EMAIL — lance 10-fixtures.sh"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$CAMP_DIR/plan-${CAS}-${STAMP}.json"
LOG="$CAMP_DIR/log-${CAS}-${STAMP}.txt"

# ── L'ÉTAT AVANT, LU ET RESTAURÉ ─────────────────────────────────────────
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
TZ0="$(psqlq -c "select timezone from profiles where id='$U'")"
restore() {
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null
  psqlq -c "update profiles set timezone='$TZ0' where id='$U';" >/dev/null
  local a b
  a="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  b="$(psqlq -c "select timezone from profiles where id='$U'")"
  [ "$a" = "$PC0" ] && [ "$b" = "$TZ0" ] \
    && echo "   ⤺ fixture restaurée ✓" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
trap restore EXIT INT TERM

[ -n "$STYLE" ]  && psqlq -c "update student_goals set practical_constraints=practical_constraints||jsonb_build_object('cooking_style','$STYLE') where user_id='$U';" >/dev/null
[ -n "$COURSES" ] && psqlq -c "update student_goals set practical_constraints=practical_constraints||jsonb_build_object('grocery_runs',$COURSES) where user_id='$U';" >/dev/null
[ -n "$EQUIP" ]  && psqlq -c "update student_goals set practical_constraints=practical_constraints||jsonb_build_object('kitchen_equipment','$EQUIP'::jsonb) where user_id='$U';" >/dev/null
[ -n "$TZ_CASE" ] && psqlq -c "update profiles set timezone='$TZ_CASE' where id='$U';" >/dev/null

TZ_NOW="$(psqlq -c "select timezone from profiles where id='$U'")"
HEURE="$(psqlq -c "select to_char(now() at time zone '$TZ_NOW','YYYY-MM-DD HH24:MI')")"
echo "══ $CAS · $FIXTURE · $JOURS j · $(psqlq -c "select practical_constraints->>'cooking_style'||' / '||(practical_constraints->>'grocery_runs')||' courses' from student_goals where user_id='$U'") · $TZ_NOW il est $HEURE"

if [ "$FN" = "generate-meal-v1" ]; then
  BODY="{\"mode\":\"to_shop\",\"window\":{\"kind\":\"days\",\"count\":$JOURS},\"intent\":\"draft\",\"replaces\":null,\"meal_slot\":null,\"servings\":1,\"context\":null,\"preferences\":null,\"pantry\":[]}"
else
  BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"days\",\"count\":$JOURS},\"intent\":\"draft\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"
fi

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint "$FN")"
BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%S)"
echo "   empreinte AVANT=$CP0 · llm_usage AVANT=$BEFORE · début $(date -u +%H:%M:%SZ)"

TRY=0
while :; do
  TRY=$((TRY+1))
  R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
    -X POST "$API_URL/functions/v1/$FN" \
    -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
  CODE="${R%% *}"
  # ⚠️ 546 / WORKER_LIMIT N'EST PAS UN DÉFAUT DU PLAN. C'est le worker edge qui
  # saute quand deux générations lourdes tournent en même temps — mesuré le
  # 2026-09-04, une session voisine composait un foyer de 5 bouches pendant C02.
  # On attend plus longtemps, et on relit le compteur avant de rejouer.
  if [ "$CODE" = "546" ] && grep -q WORKER_LIMIT "$OUT" 2>/dev/null; then
    NOW="$(psqlq -c 'select count(*) from llm_usage_events')"
    echo "   ⚠️ WORKER_LIMIT à l'essai $TRY (${R##* } s) · llm_usage=$NOW — worker saturé, j'attends"
    [ "$TRY" -ge 3 ] && { echo "   ⛔ trois WORKER_LIMIT, j'abandonne"; break; }
    sleep 90; continue
  fi
  [ "$CODE" != "502" ] && [ "$CODE" != "000" ] && break
  # 502/000 = le conteneur est mort en vol. On RELIT le compteur avant de
  # rejouer: Kong coupe la RÉPONSE, pas la fonction — insister écrit un 2e plan.
  NOW="$(psqlq -c 'select count(*) from llm_usage_events')"
  echo "   ⚠️ $CODE à l'essai $TRY (${R##* } s) · llm_usage=$NOW (delta $((NOW-BEFORE)))"
  [ "$TRY" -ge 3 ] && { echo "   ⛔ trois échecs, j'abandonne"; break; }
  sleep 25
done
AFTER="$(psqlq -c 'select count(*) from llm_usage_events')"
CP1="$(codeprint "$FN")"
# ⛔ LE JOURNAL DU RUNTIME EST PARTAGÉ. Une session voisine génère sur la même
# pile: sans filtre sur MON `user_id`, on lit ses compteurs en croyant lire les
# siens. Mesuré le 2026-09-04 — les 30 premières lignes d'un run appartenaient à
# un foyer de 5 bouches qui n'est pas le mien.
docker logs "supabase_edge_runtime_Sophia_2" --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" > "$LOG" || true
echo "   http=$CODE · ${R##* } s · essais=$TRY · llm_usage delta=$((AFTER-BEFORE))"
echo "   empreinte APRÈS=$CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   → $OUT ($(wc -c < "$OUT" | tr -d ' ') octets) · journal $(wc -l < "$LOG" | tr -d ' ') lignes"
