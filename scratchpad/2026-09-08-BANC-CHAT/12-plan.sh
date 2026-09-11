#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# COMPOSER UN VRAI PLAN QUI COUVRE AUJOURD'HUI — pour fermer le rouge du banc.
#
# ⚠️ POUR AUJOURD'HUI, PAS POUR DEMAIN. Le banc SOLO compose pour `TOMORROW`
# (il mesure la génération). Ici on mesure la QUESTION, et C1 se décide sur les
# plats du jour: un plan qui commence demain laisserait `plannedSlotsToday`
# rendre `nothing_today`, et on croirait avoir mesuré le cas `planned`.
#
# ⚠️ LE DELTA `llm_usage_events` EST LE COMPTEUR D'ÉCRITURE. Pas 0 (rien n'est
# parti), pas 2 (on a insisté et écrit deux plans). Un 502 Kong coupe la
# RÉPONSE, pas la fonction — rejouer sans relire ce compteur écrit un second
# plan, et `plan_overlaps_existing` refuserait alors le suivant.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/00-env.sh"

TOK="$(login "$PERTE_EMAIL")"; [ -n "$TOK" ] || { echo "⛔ pas de jeton"; exit 1; }
U="$(uid_of "$PERTE_EMAIL")"
TODAY="$(TZ="$FIX_TZ" date +%F)"
OUT="$BANC_DIR/plan-perte-$(date +%Y%m%d-%H%M%S).json"

BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
PRINT_BEFORE="$(codeprint)"
echo "══ composition · $PERTE_EMAIL · 1 jour · $TODAY · llm_usage avant=$BEFORE"

BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TODAY\",\"duration_days\":1},\"intent\":\"prepare_next\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"

R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
  -X POST "$API_URL/functions/v1/generate-household-meal-v1" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d "$BODY")"
CODE="${R%% *}"; SECS="${R##* }"
AFTER="$(psqlq -c 'select count(*) from llm_usage_events')"
DELTA=$((AFTER-BEFORE))
echo "   HTTP $CODE en ${SECS}s · llm_usage delta=$DELTA"

if [ "$PRINT_BEFORE" != "$(codeprint)" ]; then
  echo "⛔ LE CODE A CHANGÉ SOUS LA MESURE — RUN JETÉ"; exit 2
fi
# ⟳ LE COMPTEUR D'ÉCRITURE EST LE NOMBRE DE PLANS, PAS D'APPELS MODÈLE.
# Mesuré le 2026-09-08: delta=2 sur UNE composition, parce que le générateur
# fait une passe `…​.density_repair` en plus de la passe principale. Compter les
# appels ferait donc rougir chaque tir sain — et surtout, ça ne mesure pas ce
# qu'on craint: le risque est d'écrire DEUX PLANS après un 502 Kong, pas de
# consommer deux appels.
PLANS="$(psqlq -c "select count(*) from student_generated_meals where user_id='$U' and retired_at is null")"
echo "   appels modèle=$DELTA · PLANS VIVANTS=$PLANS"
if [ "$PLANS" != "1" ]; then
  echo "⚠️ $PLANS plans vivants — le cas est INCONCLUSIVE. Relire AVANT de rejouer."
fi
[ "$CODE" = "200" ] || { echo "⛔ corps:"; head -c 400 "$OUT"; echo; exit 1; }

echo
echo "── ce qui est en base ──"
psqlf -c "
select m.plan_kind, m.starts_on::text, m.ends_on::text, m.duration_days,
       jsonb_array_length(m.dishes) as plats
  from public.student_generated_meals m
 where m.user_id='$U' and m.retired_at is null order by m.created_at desc limit 2;"
echo "── les plats, avec leur créneau et leur jour ──"
psqlf -c "
select d->>'slot', coalesce(d->>'day','(sans jour)'), left(d->>'title',48)
  from public.student_generated_meals m,
       lateral jsonb_array_elements(m.dishes) d
 where m.user_id='$U' and m.retired_at is null
   and m.starts_on <= '$TODAY' and m.ends_on >= '$TODAY';"
