#!/usr/bin/env bash
# ── LE REFUS `cook_day` EN RUN RÉEL ──────────────────────────────────────
#
# ⛔ POURQUOI CE CAS EST DIFFICILE À ATTEINDRE, ET POURQUOI ÇA COMPTE.
# La garde ne CHANGE le résultat que si, sans elle, le retrait aurait mordu —
# donc si tous les moments déclarés sont passés. Or:
#   · la veille de cuisine est REFUSÉE après 18 h (`SHOPPING_CUTOFF_HOUR`);
#   · le dîner ne « passe » qu'à 21 h (`SLOT_PASSED_HOUR`).
# Avec les trois repas par défaut, les deux conditions s'excluent. Il faut donc
# un rythme SANS repas tardif — quelqu'un qui ne dîne pas — et une heure locale
# entre 14 h et 17 h. Vérifié par simulation avant de dépenser un appel modèle.
#
# ⚠️ DEUX ÉCRITURES DE FIXTURE, LUES AVANT ET RESTAURÉES APRÈS: le fuseau et le
# rythme. Les deux vérifiées dans les deux sens.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

TZ_CASE="Pacific/Kiritimati"           # UTC+14 → milieu d'après-midi
RYTHME_CASE='[{"size":"medium","slot":"breakfast"},{"size":"medium","slot":"lunch"}]'

UID_SOLO="$(psqlq -c "select p.id from profiles p join auth.users u on u.id=p.id where u.email='$SOLO_EMAIL';")"
GID="$(psqlq -c "select id from student_goals where user_id='$UID_SOLO' order by created_at desc limit 1;")"
TZ0="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
RY0="$(psqlq -c "select coalesce((practical_constraints->'eating_rhythm')::text,'null') from student_goals where id='$GID';")"
[ -z "$TZ0" ] || [ -z "$GID" ] && { echo "⛔ fixture illisible — j'arrête plutôt que d'écrire à l'aveugle"; exit 1; }
echo "════ origine · fuseau=$TZ0 · rythme=$RY0"

restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$UID_SOLO';" >/dev/null
  psqlq -c "update student_goals set practical_constraints = jsonb_set(practical_constraints,'{eating_rhythm}','$RY0'::jsonb) where id='$GID';" >/dev/null
  B1="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
  B2="$(psqlq -c "select (practical_constraints->'eating_rhythm')::text from student_goals where id='$GID';")"
  echo "════ restauré · fuseau=$B1 $([ "$B1" = "$TZ0" ] && echo ✓ || echo '⛔')· rythme=$B2 $([ "$B2" = "$RY0" ] && echo ✓ || echo '⛔')"
}
trap restore EXIT INT TERM

psqlq -c "update profiles set timezone='$TZ_CASE' where id='$UID_SOLO';" >/dev/null
psqlq -c "update student_goals set practical_constraints = jsonb_set(practical_constraints,'{eating_rhythm}','$RYTHME_CASE'::jsonb) where id='$GID';" >/dev/null

AUJ="$(psqlq -c "select to_char(now() at time zone '$TZ_CASE','YYYY-MM-DD');")"
DEMAIN="$(psqlq -c "select to_char((now() at time zone '$TZ_CASE') + interval '1 day','YYYY-MM-DD');")"
HEURE="$(psqlq -c "select to_char(now() at time zone '$TZ_CASE','HH24:MI');")"
echo "══════ CAS cook_day — $TZ_CASE, il y est $HEURE le $AUJ"
echo "   demande: départ DEMAIN ($DEMAIN) + 3 jours, rythme sans dîner"
echo "   attendu: veille accordée (avant 18 h) → la fenêtre recule sur $AUJ,"
echo "            tous les moments déclarés sont passés, ET LE RETRAIT SE REFUSE:"
echo "            issues porte 'spent_first_day_kept: cook_day', la veille est INTACTE"

STAMP="$(date +%Y%m%d-%H%M%S)"; OUT="$EVAL_DIR/plan-COOKDAY-${STAMP}.json"
codeprint() { find "$REPO/supabase/functions/_shared/keel" "$REPO/supabase/functions/generate-meal-v1" \
  -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null | sort | md5 | cut -c1-12; }
TOK="$(login "$SOLO_EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint)"; echo "   empreinte code AVANT = $CP0"
BODY="{\"mode\":\"to_shop\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$DEMAIN\",\"duration_days\":3},\"intent\":\"draft\",\"replaces\":null,\"meal_slot\":null,\"servings\":1,\"context\":null,\"preferences\":null,\"pantry\":[]}"
R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
  -X POST "$API_URL/functions/v1/generate-meal-v1" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
CP1="$(codeprint)"
echo "   http=${R%% *} · ${R##* } s"
echo "   empreinte code APRÈS = $CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   → $OUT"
