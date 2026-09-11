#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# UN TIR SOLO — 1 bouche, 1 jour, demain — 2026-09-07
#
#   bash 20-tir-solo.sh <cas> [--write]
#     ex: bash 20-tir-solo.sh BASE          → intent draft, rien n'est écrit
#         bash 20-tir-solo.sh L4 --write    → intent prepare_next, ça écrit
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
MODE="${2:-}"
case "$MODE" in
  ""|--draft) INTENT="draft";;
  --write)    INTENT="prepare_next";;
  *) echo "usage: $0 <cas> [--write]"; exit 2;;
esac

require_solo_lane "$SOLO_EMAIL" || exit 1

FN="generate-household-meal-v1"
U="$(psqlq -c "select id from auth.users where email='$SOLO_EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $SOLO_EMAIL — lance 10-fixture-solo.sh"; exit 1; }

# ── LE FUSEAU EST CHOISI, PAS SUBI ───────────────────────────────────────
# `index.ts:1488` lit l'horloge UNE fois, dans le fuseau du titulaire. Après
# 18 h locales `leadDayFor` rend `same_morning` et les créneaux sont retenus:
# on lirait une journée vide en croyant lire un défaut du moteur.
TZ_RUN="$(pick_tz)" || { echo "⛔ aucun fuseau de la liste n'est entre 8 h et 16 h — attends, ou ajoute un fuseau"; exit 1; }
TZ0="$(psqlq -c "select timezone from profiles where id='$U'")"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$U';" >/dev/null
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null
  local a b
  a="$(psqlq -c "select timezone from profiles where id='$U'")"
  b="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  [ "$a" = "$TZ0" ] && [ "$b" = "$PC0" ] \
    && echo "   ⤺ fixture restaurée ✓" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
trap restore EXIT INT TERM
psqlq -c "update profiles set timezone='$TZ_RUN' where id='$U';" >/dev/null

# ⛔ DEMAIN SE CALCULE DANS LE FUSEAU DU FOYER, pas dans celui de la machine.
# `todayDate = localDateInZone(timezone, now)`; un `date -v+1d` local
# décalerait d'un jour la moitié de l'année.
TODAY="$(psqlq -c "select to_char((now() at time zone '$TZ_RUN')::date,'YYYY-MM-DD')")"
TOMORROW="$(psqlq -c "select to_char((now() at time zone '$TZ_RUN')::date + 1,'YYYY-MM-DD')")"
HEURE="$(psqlq -c "select to_char(now() at time zone '$TZ_RUN','HH24:MI')")"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BANC_DIR/plan-${CAS}-${STAMP}.json"
LOG="$BANC_DIR/log-${CAS}-${STAMP}.txt"
PROMPT="$BANC_DIR/prompt-${CAS}-${STAMP}.json"

echo "══ $CAS · solo · 1 jour · intent=$INTENT · $TZ_RUN il est ${HEURE} · aujourd'hui=$TODAY demain=$TOMORROW"
# Attendu de `leadDayFor`: startsOn = today+1 et hourNow < 18 ⇒ veille =
# aujourd'hui (`day_before`), `lead_days: 1`, et des repas DEMAIN seulement.

BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":1},\"intent\":\"$INTENT\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}"

TOK="$(login "$SOLO_EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint "$FN")"
BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
# ⛔ LE « Z » EST LOAD-BEARING. `date -u +%FT%T` rend un horodatage NAÏF, et
# docker le lit en heure LOCALE: à Paris la fenêtre s'ouvrait deux heures trop
# tôt, et le log d'un run capturait des tags de runs PRÉCÉDENTS. Mesuré le
# 2026-09-07 au tir L4W: un tag `portion_sizing` avec `intent: draft` dans le
# journal d'un tir `prepare_next`. On lisait les compteurs de quelqu'un d'autre
# en croyant lire les siens — le défaut exact que le filtre `user_id` ferme
# entre SESSIONS, rouvert entre RUNS d'une même session.
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
  # ⚠️ 546 / WORKER_LIMIT n'est pas un défaut du plan: c'est le worker edge qui
  # saute quand deux générations lourdes tournent en même temps.
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

# ── L'ARCHIVE DU PROMPT ──────────────────────────────────────────────────
# ⚠️ PLUSIEURS LIGNES PAR TIR. La capture précède la réécriture en mode JSON,
# et un 429 archive le prompt entier sans réponse: on prend TOUTES les lignes
# de la fenêtre et on laisse `30-lire-solo.py` choisir la plus longue.
psqlq -c "select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)::text from (
    select created_at, request_id, status, http_status, model, json_mode, outcome,
           metadata->>'prompt_version' as prompt_version,
           system_prompt, user_message, system_prompt_chars, user_message_chars
    from llm_raw_response_events
    where user_id='$U' and source='$FN' and created_at >= timestamp '$T_SQL'
    order by created_at) x;" > "$PROMPT" || echo '[]' > "$PROMPT"

# ── LA PART STANDARD, RECALCULÉE PAR L'ARITHMÉTIQUE DU MOTEUR ────────────
# Tant que le journal ne porte pas `portion_sizing.rows[]` (lots 0 et 1), c'est
# la seule façon de lire des kcal par plat. `31-energie-solo.ts` IMPORTE
# `dishEnergy` et `weighedReadyGrams`: aucune seconde implémentation.
ENE="$BANC_DIR/energie-${CAS}-${STAMP}.json"
REFS="$BANC_DIR/.refs.json"; ALIAS="$BANC_DIR/.aliases.json"
psqlq -c "select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)::text from (
    select slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
           fiber_g, omega3_marine, iron_source, calcium_source, iodine_source,
           zinc_source, b12_source, folate_source, yield_class, yield_factor,
           atwater_discount, energy_dense, unit_grams, condiment_grams
    from food_composition_refs) x;" > "$REFS"
psqlq -c "select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)::text from (
    select alias, slug from food_composition_aliases) x;" > "$ALIAS"
if deno run --allow-read "$BANC_DIR/31-energie-solo.ts" "$REFS" "$ALIAS" "$OUT" > "$ENE" 2>"$BANC_DIR/.energie.err"; then
  echo "   → $ENE"
else
  echo "   ⚠️ recalcul d'énergie en échec: $(tail -3 "$BANC_DIR/.energie.err")"
  ENE=""
fi

echo "   http=$CODE · ${R##* } s · essais=$TRY · llm_usage delta=$((AFTER-BEFORE))"
echo "   empreinte APRÈS=$CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   → $OUT ($(wc -c < "$OUT" | tr -d ' ') octets)"
echo "   → $LOG ($(wc -l < "$LOG" | tr -d ' ') lignes)"
echo "   → $PROMPT ($(python3 -c "import json,sys;print(len(json.load(open('$PROMPT'))))" 2>/dev/null || echo '?') archive(s))"
echo "   lire: python3 $BANC_DIR/30-lire-solo.py $OUT $LOG $PROMPT $ENE"
