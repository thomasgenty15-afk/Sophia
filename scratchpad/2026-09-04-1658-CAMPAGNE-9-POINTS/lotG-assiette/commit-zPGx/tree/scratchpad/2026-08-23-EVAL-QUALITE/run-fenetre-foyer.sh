#!/usr/bin/env bash
# ── LE LOT FENÊTRE SUR LA LANE FOYER — témoin, cas, et cook_day ──────────
# Mêmes règles que la lane solo: fixture LUE avant, RESTAURÉE après, vérifiée.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
# ⚠️ FILTRE DE CAS: `bash run-fenetre-foyer.sh ctl cookday` rejoue ces deux-là.
# Un 502 est une panne d'infra (conteneur mort en vol); repayer un run DÉJÀ
# réussi pour l'accompagner serait un appel modèle jeté.
SEUL="${*:-ctl case cookday}"
veut() { [[ " $SEUL " == *" $1 "* ]]; }
FN="generate-household-meal-v1"
TZ_CASE="America/Sao_Paulo"      # UTC-3 → 22 h : les trois moments sont passés
TZ_COOK="Pacific/Kiritimati"     # UTC+14 → 15 h : veille possible (avant 18 h)
RYTHME_COOK='[{"size":"medium","slot":"breakfast"},{"size":"medium","slot":"lunch"}]'

UID_HH="$(psqlq -c "select p.id from profiles p join auth.users u on u.id=p.id where u.email='$HH_EMAIL';")"
GID="$(psqlq -c "select id from student_goals where user_id='$UID_HH' order by created_at desc limit 1;")"
TZ0="$(psqlq -c "select timezone from profiles where id='$UID_HH';")"
RY0="$(psqlq -c "select coalesce((practical_constraints->'eating_rhythm')::text,'null') from student_goals where id='$GID';")"
[ -z "$TZ0" ] || [ -z "$GID" ] && { echo "⛔ fixture illisible"; exit 1; }
echo "════ origine · fuseau=$TZ0 · rythme=$RY0"
restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$UID_HH';" >/dev/null
  psqlq -c "update student_goals set practical_constraints = jsonb_set(practical_constraints,'{eating_rhythm}','$RY0'::jsonb) where id='$GID';" >/dev/null
  B1="$(psqlq -c "select timezone from profiles where id='$UID_HH';")"
  B2="$(psqlq -c "select (practical_constraints->'eating_rhythm')::text from student_goals where id='$GID';")"
  echo "════ restauré · fuseau=$B1 $([ "$B1" = "$TZ0" ] && echo ✓ || echo ⛔)· rythme $([ "$B2" = "$RY0" ] && echo ✓ || echo ⛔)"
}
trap restore EXIT INT TERM
codeprint() { find "$REPO/supabase/functions/_shared/keel" "$REPO/supabase/functions/$FN" \
  -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null | sort | md5 | cut -c1-12; }
TOK="$(login "$HH_EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }

tirer() { # $1=nom  $2=window json
  local OUT="$EVAL_DIR/plan-$1-$(date +%Y%m%d-%H%M%S).json"
  local CP0="$(codeprint)"
  local BODY="{\"operation\":\"compose\",\"window\":$2,\"intent\":\"draft\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"
  local R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
    -X POST "$API_URL/functions/v1/$FN" -H "apikey: $ANON" \
    -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
  local CP1="$(codeprint)"
  echo "   http=${R%% *} · ${R##* } s · empreinte $CP0 → $CP1 $([ "$CP0" = "$CP1" ] && echo ✓ || echo '⛔ CODE CHANGÉ')"
  echo "   → $OUT"
}

echo; echo "══════ ① TÉMOIN — $TZ0, $(psqlq -c "select to_char(now() at time zone '$TZ0','HH24:MI');")"
echo "   attendu: AUCUN retrait, 3 jours"
veut ctl && tirer HHctl '{"kind":"days","count":3}'

psqlq -c "update profiles set timezone='$TZ_CASE' where id='$UID_HH';" >/dev/null
echo; echo "══════ ② CAS — $TZ_CASE, $(psqlq -c "select to_char(now() at time zone '$TZ_CASE','HH24:MI');")"
echo "   attendu: retrait — 2 jours, MÊME date de fin"
veut case && tirer HHcase '{"kind":"days","count":3}'

psqlq -c "update profiles set timezone='$TZ_COOK' where id='$UID_HH';" >/dev/null
psqlq -c "update student_goals set practical_constraints = jsonb_set(practical_constraints,'{eating_rhythm}','$RYTHME_COOK'::jsonb) where id='$GID';" >/dev/null
DEMAIN="$(psqlq -c "select to_char((now() at time zone '$TZ_COOK') + interval '1 day','YYYY-MM-DD');")"
echo; echo "══════ ③ COOK_DAY — $TZ_COOK, $(psqlq -c "select to_char(now() at time zone '$TZ_COOK','HH24:MI');") · départ $DEMAIN, sans dîner"
echo "   attendu: veille accordée, retrait REFUSÉ (cook_day), veille INTACTE"
veut cookday && tirer HHcookday "{\"kind\":\"exact\",\"starts_on\":\"$DEMAIN\",\"duration_days\":3}"
