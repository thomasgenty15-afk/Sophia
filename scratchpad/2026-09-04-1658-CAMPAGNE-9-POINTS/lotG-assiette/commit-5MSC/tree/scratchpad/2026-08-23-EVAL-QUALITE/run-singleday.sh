#!/usr/bin/env bash
# ── UN SEUL MOMENT RESTE À VENIR — la garde doit S'ABSTENIR ──────────────
#
# ⛔ LE CAS LE PLUS FIN DU LOT, et le dernier trou nommé. À 19 h le
# petit-déjeuner et le déjeuner sont passés (10 h et 14 h), le dîner non (21 h):
# UN moment reste, et le retrait ne doit rien retirer. Tard le soir, et pourtant
# la fenêtre est intacte — c'est la preuve que la garde ne mord pas par excès.
#
# ⚠️ LA FRONTIÈRE EST À 21 h, simulée avant de dépenser l'appel: h=19 et h=20
# s'abstiennent, h=21 retire. Une garde sans cas qui passe ressemble à une garde
# qui marche; celle-ci a maintenant les deux côtés.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
TZ_CASE="Australia/Sydney"
UID_SOLO="$(psqlq -c "select p.id from profiles p join auth.users u on u.id=p.id where u.email='$SOLO_EMAIL';")"
TZ0="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
[ -z "$TZ0" ] && { echo "⛔ fuseau d'origine illisible"; exit 1; }
echo "════ origine · fuseau=$TZ0"
restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$UID_SOLO';" >/dev/null
  B="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
  echo "════ restauré = $B $([ "$B" = "$TZ0" ] && echo ✓ || echo ⛔)"
}
trap restore EXIT INT TERM
psqlq -c "update profiles set timezone='$TZ_CASE' where id='$UID_SOLO';" >/dev/null
echo "══════ FENÊTRE D'UN JOUR, DÉPENSÉE — $TZ_CASE, il y est $(psqlq -c "select to_char(now() at time zone '$TZ_CASE','HH24:MI');")"
echo "   attendu: refus single_day — la fenêtre reste à 1 jour plutôt que de"
echo "            devenir vide, et 'spent_first_day_kept: single_day' est écrit"
codeprint() { find "$REPO/supabase/functions/_shared/keel" "$REPO/supabase/functions/generate-meal-v1" \
  -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null | sort | md5 | cut -c1-12; }
OUT="$EVAL_DIR/plan-SINGLEDAY-$(date +%Y%m%d-%H%M%S).json"
TOK="$(login "$SOLO_EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint)"
BODY='{"mode":"to_shop","window":{"kind":"days","count":1},"intent":"draft","replaces":null,"meal_slot":null,"servings":1,"context":null,"preferences":null,"pantry":[]}'
R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
  -X POST "$API_URL/functions/v1/generate-meal-v1" -H "apikey: $ANON" \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
CP1="$(codeprint)"
echo "   http=${R%% *} · ${R##* } s · empreinte $CP0 → $CP1 $([ "$CP0" = "$CP1" ] && echo ✓ || echo '⛔ CODE CHANGÉ')"
echo "   → $OUT"
