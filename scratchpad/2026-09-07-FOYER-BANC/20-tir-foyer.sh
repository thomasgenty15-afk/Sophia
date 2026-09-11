#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# UN TIR FOYER — N bouches, 1 jour, demain — 2026-09-07
#
#   bash 20-tir-foyer.sh <cas> <duo|quatre|cinq> [--write]
#     ex: bash 20-tir-foyer.sh L9 quatre         → intent draft, rien n'est écrit
#         bash 20-tir-foyer.sh L12 duo --write   → intent prepare_next, ça écrit
#
# ⛔ APRÈS TOUTE ÉDITION SOUS `supabase/functions/_shared/`, RELANCER
#      supabase functions serve --env-file supabase/.env
#    Le runtime edge sert une copie CACHÉE des modules `_shared`: un fichier
#    MODIFIÉ n'est PAS rechargé, et le tir mesurerait le code d'avant en
#    croyant mesurer le neuf. ⛔ JAMAIS `docker restart` à la place — sous
#    `functions serve` il rend un runtime qui ne sert plus rien (500/503).
#
# ⛔ NE RIEN ÉDITER SOUS `supabase/functions/` PENDANT LE TIR. L'empreinte du
#    code encadre la mesure et le dira, mais elle le dira APRÈS.
#
# ⛔ `--write` ÉCRIT VRAIMENT. Deux écritures qui se recouvrent rendent
#    `plan_overlaps_existing`: retirer le plan précédent entre deux.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

CAS="${1:-BASE}"
FIXTURE="${2:-duo}"
MODE="${3:-}"
case "$MODE" in
  ""|--draft) INTENT="draft";;
  --write)    INTENT="prepare_next";;
  *) echo "usage: $0 <cas> <duo|quatre|cinq> [--write]"; exit 2;;
esac
EMAIL="$(foyer_email "$FIXTURE")" || { echo "usage: $0 <cas> <duo|quatre|cinq> [--write]"; exit 2; }

# ══════════════════════════════════════════════════════════════════════════
# ⟳ BASCULE (2026-09-08) — LA BORNE N'A PLUS À ÊTRE LEVÉE
# ══════════════════════════════════════════════════════════════════════════
#
# `PORTION_SIZING_MAX_MOUTHS` valait `1` tant que le chemin neuf n'était armé
# que pour une bouche: ce script la levait pour son tir et la remettait par un
# `trap`. Depuis la bascule elle vaut le plafond de la lane, donc un foyer est
# armé sans qu'on touche à rien — et le tir mesure enfin ce que la population
# reçoit, pas une copie modifiée.
#
# ⚠️ LA VÉRIFICATION RESTE, ET ELLE EST L'INVERSE. On refuse de tirer si la
# borne a été redescendue: un banc qui mesurerait silencieusement le chemin
# d'avant rendrait des chiffres qu'on lirait comme ceux du chemin neuf.
PS="$REPO/supabase/functions/_shared/keel/portion_sizing.ts"
CAP="$(grep -m1 -o 'PORTION_SIZING_MAX_MOUTHS = [0-9]*' "$PS" | grep -o '[0-9]*')"
[ "${CAP:-0}" -ge 2 ] \
  && echo "   ⇧ borne à $CAP — la table est armée sans rien modifier" \
  || { echo "⛔ borne à ${CAP:-?}: le tir mesurerait le chemin legacy. Retour arrière en cours ?"; exit 1; }

FN="generate-household-meal-v1"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $EMAIL — lance 10-fixtures.sh de la campagne 9 POINTS"; exit 1; }
BOUCHES="$(psqlq -c "select count(*) from household_members m join household_members o on o.household_id=m.household_id where o.user_id='$U' and o.role='owner'")"

# ── LE FUSEAU EST CHOISI, PAS SUBI ───────────────────────────────────────
TZ_RUN="$(pick_tz)" || { echo "⛔ aucun fuseau de la liste n'est entre 8 h et 16 h — attends, ou ajoute un fuseau"; exit 1; }
TZ0="$(psqlq -c "select timezone from profiles where id='$U'")"
# ⛔ UNE SEULE FONCTION, UN SEUL `trap`. Deux `trap … EXIT` ne s'additionnent
# pas: le second REMPLACE le premier, et c'est la borne qui serait restée levée.
restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$U';" >/dev/null
  local a; a="$(psqlq -c "select timezone from profiles where id='$U'")"
  [ "$a" = "$TZ0" ] && echo "   ⤺ fixture restaurée ✓" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
trap restore EXIT INT TERM
psqlq -c "update profiles set timezone='$TZ_RUN' where id='$U';" >/dev/null

# ⛔ DEMAIN SE CALCULE DANS LE FUSEAU DU FOYER, pas dans celui de la machine.
TODAY="$(psqlq -c "select to_char((now() at time zone '$TZ_RUN')::date,'YYYY-MM-DD')")"
TOMORROW="$(psqlq -c "select to_char((now() at time zone '$TZ_RUN')::date + 1,'YYYY-MM-DD')")"
HEURE="$(psqlq -c "select to_char(now() at time zone '$TZ_RUN','HH24:MI')")"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BANC_DIR/plan-${CAS}-${FIXTURE}-${STAMP}.json"
LOG="$BANC_DIR/log-${CAS}-${FIXTURE}-${STAMP}.txt"
PROMPT="$BANC_DIR/prompt-${CAS}-${FIXTURE}-${STAMP}.json"

echo "══ $CAS · $FIXTURE ($BOUCHES bouches) · 1 jour · intent=$INTENT · $TZ_RUN il est ${HEURE} · demain=$TOMORROW"

BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":1},\"intent\":\"$INTENT\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint "$FN")"
BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
# ⛔ LE « Z » EST LOAD-BEARING: `date -u +%FT%T` rend un horodatage NAÏF que
# docker lit en heure LOCALE, et la fenêtre capturerait des tags de runs
# PRÉCÉDENTS. Mesuré au banc solo le 2026-09-07.
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
T_SQL="$(psqlq -c "select to_char(now(),'YYYY-MM-DD HH24:MI:SS')")"
echo "   empreinte AVANT=$CP0 · llm_usage AVANT=$BEFORE · début $(date -u +%H:%M:%SZ)"

TRY=0
while :; do
  TRY=$((TRY+1))
  R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
    -X POST "$API_URL/functions/v1/$FN" \
    -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
  CODE="${R%% *}"
  if [ "$CODE" = "546" ] && grep -q WORKER_LIMIT "$OUT" 2>/dev/null; then
    NOW="$(psqlq -c 'select count(*) from llm_usage_events')"
    echo "   ⚠️ WORKER_LIMIT à l'essai $TRY (${R##* } s) · llm_usage=$NOW — worker saturé, j'attends"
    [ "$TRY" -ge 3 ] && { echo "   ⛔ trois WORKER_LIMIT, j'abandonne"; break; }
    sleep 90; continue
  fi
  [ "$CODE" != "502" ] && [ "$CODE" != "000" ] && break
  # 502/000: Kong coupe la RÉPONSE, pas la fonction. On RELIT le compteur avant
  # de rejouer — insister écrit un 2e plan.
  NOW="$(psqlq -c 'select count(*) from llm_usage_events')"
  echo "   ⚠️ $CODE à l'essai $TRY (${R##* } s) · llm_usage=$NOW (delta $((NOW-BEFORE)))"
  [ "$TRY" -ge 3 ] && { echo "   ⛔ trois échecs, j'abandonne"; break; }
  sleep 25
done
AFTER="$(psqlq -c 'select count(*) from llm_usage_events')"
CP1="$(codeprint "$FN")"

# ⛔ LE JOURNAL DU RUNTIME EST PARTAGÉ — filtrer sur MON `user_id`.
docker logs "supabase_edge_runtime_Sophia_2" --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" > "$LOG" || true

psqlq -c "select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)::text from (
    select created_at, request_id, status, http_status, model, json_mode, outcome,
           metadata->>'prompt_version' as prompt_version,
           system_prompt, user_message, system_prompt_chars, user_message_chars
    from llm_raw_response_events
    where user_id='$U' and source='$FN' and created_at >= timestamp '$T_SQL'
    order by created_at) x;" > "$PROMPT" || echo '[]' > "$PROMPT"

echo "   http=$CODE · ${R##* } s · essais=$TRY · llm_usage delta=$((AFTER-BEFORE))"
echo "   empreinte APRÈS=$CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   → $OUT ($(wc -c < "$OUT" | tr -d ' ') octets)"
echo "   → $LOG ($(wc -l < "$LOG" | tr -d ' ') lignes)"
echo "   lire: python3 $BANC_DIR/30-lire-foyer.py $LOG $OUT"
