#!/usr/bin/env bash
# ── UNE GÉNÉRATION PAR EXÉCUTION ─────────────────────────────────────────
#   bash run.sh S1 solo      → generate-meal-v1,           fenêtre 3 jours
#   bash run.sh F1 household → generate-household-meal-v1, fenêtre 3 jours
# `intent: draft` : les gardes amont mordent à l'identique, la réponse porte
# le plan entier (dishes, shopping_list, cooking_sessions, member_portions),
# et RIEN n'est écrit — donc aucun `plan_overlaps_existing` entre les runs.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
CASE="$1"; LANE="$2"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$EVAL_DIR/plan-${CASE}-${STAMP}.json"

if [ "$LANE" = "household" ]; then
  EMAIL="$HH_EMAIL"; FN="generate-household-meal-v1"
  BODY='{"operation":"compose","window":{"kind":"days","count":3},"intent":"draft","replaces":null,"context":null,"cooking_shape":null,"preferences":null}'
else
  EMAIL="$SOLO_EMAIL"; FN="generate-meal-v1"
  BODY='{"mode":"to_shop","window":{"kind":"days","count":3},"intent":"draft","replaces":null,"meal_slot":null,"servings":1,"context":null,"preferences":null,"pantry":[]}'
fi

# ⚠️ L'EMPREINTE DU CODE MESURÉ. Une autre session édite `supabase/functions/**`
# pendant cette évaluation: le watcher de `functions serve` recrée le conteneur à
# chaque édition (502 en vol), et surtout deux runs séparés par une édition ne
# comparent pas deux profils, ils comparent deux codes.
codeprint() {
  find "$REPO/supabase/functions/_shared/keel" "$REPO/supabase/functions/$FN" \
    -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort | md5 | cut -c1-12
}

TOK="$(login "$EMAIL")"
[ -z "$TOK" ] && { echo "⛔ pas de jeton pour $EMAIL"; exit 1; }
echo "── $CASE · $FN · $EMAIL"
CP0="$(codeprint)"
BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
echo "   empreinte code AVANT = $CP0 · llm_usage_events AVANT = $BEFORE · début $(date -u +%H:%M:%SZ)"
TRY=0
while :; do
  TRY=$((TRY+1))
  R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
    -X POST "$API_URL/functions/v1/$FN" \
    -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
    -d "$BODY")"
  CODE="${R%% *}"
  [ "$CODE" != "502" ] && break
  # 502 = le conteneur est mort en vol (édition concurrente). PANNE
  # D'INFRASTRUCTURE: on répare et on relance, ça ne compte pas comme un plan.
  echo "   ⚠️ 502 à l'essai $TRY (${R##* } s) — le runtime a été recréé sous le run."
  [ "$TRY" -ge 4 ] && { echo "   ⛔ quatre 502 d'affilée, j'abandonne ce run."; break; }
  sleep 20
done
AFTER="$(psqlq -c 'select count(*) from llm_usage_events')"
CP1="$(codeprint)"
echo "   http=$CODE · ${R##* } s · essais=$TRY"
echo "   empreinte code APRÈS = $CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   llm_usage_events APRÈS = $AFTER (delta $((AFTER-BEFORE)))"
echo "   → $OUT ($(wc -c < "$OUT" | tr -d ' ') octets)"
head -c 300 "$OUT"; echo
