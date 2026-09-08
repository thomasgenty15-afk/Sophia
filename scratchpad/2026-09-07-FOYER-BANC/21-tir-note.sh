#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# UN TIR AVEC UNE NOTE — N bouches, 1 jour, demain, et une phrase — 2026-09-08
#
#   bash 21-tir-note.sh <cas> <duo|quatre|cinq> "<phrase>" [--write]
#     ex: bash 21-tir-note.sh N1 quatre "Claire ne mange pas autant" --write
#
# Clone de `20-tir-foyer.sh` (même socle, même capture) avec TROIS différences,
# chacune imposée par ce qu'on mesure:
#
#   1. `draft_note` DANS LE CORPS. C'est la phrase qui part au classifieur.
#   2. `--write` EST QUASI OBLIGATOIRE. En intent `draft` la lane SORT avant la
#      persistance (`if (isDraft) return …`, index.ts ≈13480): le classifieur
#      tourne pour la ceinture, mais rien ne s'écrit et aucun appétit ne bouge.
#      Un tir `draft` ne mesure donc que le rangement, jamais l'effet.
#   3. L'ARCHIVE LIT DEUX SOURCES. Le classifieur archive sous
#      `keel-draft-note-classify`, PAS sous le nom de la fonction: le filtre du
#      banc voisin le MANQUE. Et on prend `output_text` — c'est le JSON rendu
#      par le modèle qui dit dans quel tiroir la phrase est tombée.
#
# ⛔ L'APPÉTIT DE CHAQUE BOUCHE EST PHOTOGRAPHIÉ AVANT ET RESTAURÉ APRÈS (trap).
#    Le diff est imprimé AVANT la restauration: c'est lui la preuve. Une
#    fixture qui garderait un cran d'un tir à l'autre mesurerait le tir d'avant.
#
# ⛔ LE PLAN ÉCRIT N'EST PAS RETIRÉ ICI. On le regarde d'abord; on le retire à
#    la main (`student_generated_meals`), sinon le tir suivant — MÊME UN
#    `draft` — rend 409 `plan_overlaps_existing` avant tout appel modèle.
#    ⚠️ `starts_on` EST LA VEILLE DE CUISINE (aujourd'hui), pas « demain »:
#    la fenêtre demandée pour le 9 s'écrit `starts=08, ends=09`. Mesuré au tir
#    N2: un `delete … where starts_on='2026-09-09'` a touché 0 ligne. Viser
#    l'`id` ou `ends_on`, jamais la date demandée.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

CAS="${1:?cas}"
FIXTURE="${2:?duo|quatre|cinq}"
NOTE="${3-}"
MODE="${4:-}"
case "$MODE" in
  ""|--draft) INTENT="draft";;
  --write)    INTENT="prepare_next";;
  *) echo "usage: $0 <cas> <duo|quatre|cinq> \"<phrase>\" [--write]"; exit 2;;
esac
EMAIL="$(foyer_email "$FIXTURE")" || { echo "usage: $0 <cas> <duo|quatre|cinq> \"<phrase>\" [--write]"; exit 2; }

PS="$REPO/supabase/functions/_shared/keel/portion_sizing.ts"
CAP="$(grep -m1 -o 'PORTION_SIZING_MAX_MOUTHS = [0-9]*' "$PS" | grep -o '[0-9]*')"
[ "${CAP:-0}" -ge 2 ] || { echo "⛔ borne à ${CAP:-?}: le tir mesurerait le chemin legacy"; exit 1; }

FN="generate-household-meal-v1"
CLS="keel-draft-note-classify"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $EMAIL"; exit 1; }
HH="$(psqlq -c "select household_id from household_members where user_id='$U' and role='owner'")"

TZ_RUN="$(pick_tz)" || { echo "⛔ aucun fuseau entre 8 h et 16 h"; exit 1; }
TZ0="$(psqlq -c "select timezone from profiles where id='$U'")"

# ── LA PHOTO DES APPÉTITS, ET SA RESTAURATION ────────────────────────────
snapshot() {
  psqlq -c "select m.member_id||'|'||coalesce(m.first_name,'?')||'|'||coalesce(b.appetite,'')||'|'||coalesce(b.appetite_asked_at::text,'')
    from household_members m left join household_member_bodies b on b.member_id=m.member_id
    where m.household_id='$HH' order by m.role desc, m.first_name;"
}
SNAP0="$(snapshot)"
# ⛔ LES RÉGLAGES AUSSI (2026-09-08): une phrase peut désormais déplacer
# `practical_constraints` (style, temps, difficulté, variété) — photo et
# restauration, comme au banc solo (`PC0`).
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
settings_now() {
  psqlq -c "select 'cooking_style='||coalesce(pc->>'cooking_style','∅')||' cooking_time_min='||coalesce(pc->>'cooking_time_min','∅')||' recipe_difficulty='||coalesce(pc->>'recipe_difficulty','∅')||' variety='||coalesce(pc->>'variety','∅')||' field_changes='||coalesce(jsonb_array_length(case when jsonb_typeof(pc->'field_changes')='array' then pc->'field_changes' else '[]' end)::text,'0') from (select practical_constraints pc from student_goals where user_id='$U') x"
}
restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$U';" >/dev/null
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null </dev/null
  # ⛔ `< /dev/null` SUR CHAQUE psql, ET C'EST LE CORRECTIF DU TIR N1. `psqlq`
  # est un `docker exec -i`: il LIT stdin, c'est-à-dire les lignes restantes de
  # la boucle. Mesuré: seul Paul (déjà à `average`) était traité, Claire restait
  # à `small`, et le script disait « RESTAURATION INCOMPLÈTE » sans dire qui.
  while IFS='|' read -r mid _ ap asked; do
    [ -z "$mid" ] && continue
    local apsql askedsql
    apsql="$([ -z "$ap" ] && echo null || echo "'$ap'")"
    askedsql="$([ -z "$asked" ] && echo null || echo "'$asked'::timestamptz")"
    psqlq -c "update household_member_bodies set appetite=$apsql, appetite_asked_at=$askedsql where member_id='$mid';" >/dev/null </dev/null
  done <<< "$SNAP0"
  local a b; a="$(psqlq -c "select timezone from profiles where id='$U'")"
  b="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  if [ "$a" = "$TZ0" ] && [ "$(snapshot)" = "$SNAP0" ] && [ "$b" = "$PC0" ]; then
    echo "   ⤺ fixture restaurée ✓ (fuseau + appétits + réglages)"
  else
    echo "   ⛔ RESTAURATION INCOMPLÈTE"
  fi
}
trap restore EXIT INT TERM
psqlq -c "update profiles set timezone='$TZ_RUN' where id='$U';" >/dev/null

# ── LE CONTREFACTUEL: FORCER L'APPÉTIT D'UNE BOUCHE LE TEMPS DU TIR ──────
#   FORCE_APPETITE="Claire=small" bash 21-tir-note.sh N2 quatre "" 
# Posé APRÈS la photo, donc restauré par le trap. C'est ce qui permet de
# comparer, sur la même table et le même jour, la cible d'une bouche à
# `average` (tir A) et à `small` (tir B) — un seul état changé, rien d'autre.
if [ -n "${FORCE_APPETITE:-}" ]; then
  F_NAME="${FORCE_APPETITE%%=*}"; F_LEVEL="${FORCE_APPETITE#*=}"
  F_MID="$(psqlq -c "select member_id from household_members where household_id='$HH' and first_name='$F_NAME'")"
  [ -z "$F_MID" ] && { echo "⛔ FORCE_APPETITE: aucune bouche « $F_NAME » dans ce foyer"; exit 1; }
  psqlq -c "update household_member_bodies set appetite='$F_LEVEL' where member_id='$F_MID';" >/dev/null
  echo "   ⇧ FORCÉ le temps du tir: $F_NAME → $F_LEVEL"
fi
#   FORCE_PC='{"cooking_style":"balanced"}' — fusionné dans practical_constraints
# le temps du tir (restauré par le trap depuis PC0). Sert à sortir d'un plancher.
if [ -n "${FORCE_PC:-}" ]; then
  psqlq -c "update student_goals set practical_constraints = coalesce(practical_constraints,'{}'::jsonb) || '$FORCE_PC'::jsonb where user_id='$U';" >/dev/null
  echo "   ⇧ FORCÉ le temps du tir: practical_constraints || $FORCE_PC"
fi

TOMORROW="$(psqlq -c "select to_char((now() at time zone '$TZ_RUN')::date + 1,'YYYY-MM-DD')")"
HEURE="$(psqlq -c "select to_char(now() at time zone '$TZ_RUN','HH24:MI')")"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BANC_DIR/plan-${CAS}-${FIXTURE}-${STAMP}.json"
LOG="$BANC_DIR/log-${CAS}-${FIXTURE}-${STAMP}.txt"
PROMPT="$BANC_DIR/prompt-${CAS}-${FIXTURE}-${STAMP}.json"

echo "══ $CAS · $FIXTURE · intent=$INTENT · $TZ_RUN il est ${HEURE} · demain=$TOMORROW"
echo "   note: « $NOTE »"
echo "   réglages AVANT: $(settings_now)"
echo "   appétits AVANT:"; printf '%s\n' "$SNAP0" | awk -F'|' '{printf "      %-8s %-8s asked=%s\n",$2,($3==""?"(null)":$3),($4==""?"jamais":substr($4,1,19))}'

# ⛔ `draft_note` N'EST POSÉE QUE SI ELLE EXISTE: un `""` serait lu comme une
# phrase illisible (`note_unusable`) — la même règle que le front.
if [ -n "$NOTE" ]; then
  NOTE_JSON="$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$NOTE")"
  NOTE_FIELD=",\"draft_note\":$NOTE_JSON"
else
  NOTE_FIELD=""
fi
BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"exact\",\"starts_on\":\"$TOMORROW\",\"duration_days\":1},\"intent\":\"$INTENT\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null$NOTE_FIELD}"

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint "$FN")"
BEFORE="$(psqlq -c 'select count(*) from llm_usage_events')"
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
    echo "   ⚠️ WORKER_LIMIT à l'essai $TRY (${R##* } s) — worker saturé, j'attends"
    [ "$TRY" -ge 3 ] && { echo "   ⛔ trois WORKER_LIMIT, j'abandonne"; break; }
    sleep 90; continue
  fi
  [ "$CODE" != "502" ] && [ "$CODE" != "000" ] && break
  NOW="$(psqlq -c 'select count(*) from llm_usage_events')"
  echo "   ⚠️ $CODE à l'essai $TRY (${R##* } s) · llm_usage=$NOW (delta $((NOW-BEFORE)))"
  [ "$TRY" -ge 3 ] && { echo "   ⛔ trois échecs, j'abandonne"; break; }
  sleep 25
done
AFTER="$(psqlq -c 'select count(*) from llm_usage_events')"
CP1="$(codeprint "$FN")"

docker logs "supabase_edge_runtime_Sophia_2" --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" > "$LOG" || true

# ⛔ LES DEUX SOURCES, ET `output_text`: c'est le JSON du modèle qui dit le tiroir.
psqlq -c "select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)::text from (
    select created_at, request_id, source, status, http_status, model, json_mode, outcome,
           metadata->>'prompt_version' as prompt_version,
           system_prompt, user_message, output_text, system_prompt_chars, user_message_chars
    from llm_raw_response_events
    where user_id='$U' and source in ('$FN','$CLS') and created_at >= timestamp '$T_SQL'
    order by created_at) x;" > "$PROMPT" || echo '[]' > "$PROMPT"

echo "   http=$CODE · ${R##* } s · essais=$TRY · llm_usage delta=$((AFTER-BEFORE))"
echo "   empreinte APRÈS=$CP1 $([ "$CP0" = "$CP1" ] && echo '(inchangée ✓)' || echo '⛔ LE CODE A CHANGÉ SOUS LA MESURE')"
echo "   réglages APRÈS: $(settings_now)"
echo "   appétits APRÈS:"; snapshot | awk -F'|' '{printf "      %-8s %-8s asked=%s\n",$2,($3==""?"(null)":$3),($4==""?"jamais":substr($4,1,19))}'
echo "   → $OUT ($(wc -c < "$OUT" | tr -d ' ') octets)"
echo "   → $LOG ($(wc -l < "$LOG" | tr -d ' ') lignes)"
echo "   → $PROMPT ($(python3 -c "import json,sys;print(len(json.load(open('$PROMPT'))))" 2>/dev/null || echo '?') archive(s))"
