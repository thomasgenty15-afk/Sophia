#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# UN TIR SUR `keel-read-note-v1` — lire une phrase, SANS composer — 2026-09-08
#
#   bash 23-tir-read-note.sh <cas> <duo|quatre|cinq> "<phrase>"
#
# C'est le premier des deux appels du lot 3: la phrase est lue, classée,
# APPLIQUÉE (goûts, appétit, réglages) et DITE — en quelques secondes, sans
# qu'aucun plan ne se compose. Le second appel (composer) se mesure avec
# `21-tir-note.sh` SANS note.
#
# ⛔ MÊME PHOTO / MÊME RESTAURATION que `21-tir-note.sh` (appétits, réglages):
#    ce tir ÉCRIT sur la fiche. `FORCE_PC` / `FORCE_APPETITE` idem.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

CAS="${1:?cas}"; FIXTURE="${2:?duo|quatre|cinq}"; NOTE="${3:?phrase}"
EMAIL="$(foyer_email "$FIXTURE")" || { echo "usage: $0 <cas> <duo|quatre|cinq> \"<phrase>\""; exit 2; }
FN="keel-read-note-v1"; CLS="keel-draft-note-classify"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $EMAIL"; exit 1; }
HH="$(psqlq -c "select household_id from household_members where user_id='$U' and role='owner'")"

snapshot() {
  psqlq -c "select m.member_id||'|'||coalesce(m.first_name,'?')||'|'||coalesce(b.appetite,'')||'|'||coalesce(b.appetite_asked_at::text,'')
    from household_members m left join household_member_bodies b on b.member_id=m.member_id
    where m.household_id='$HH' order by m.role desc, m.first_name;"
}
settings_now() {
  psqlq -c "select 'cooking_style='||coalesce(pc->>'cooking_style','∅')||' cooking_time_min='||coalesce(pc->>'cooking_time_min','∅')||' variety='||coalesce(pc->>'variety','∅')||' field_changes='||coalesce(jsonb_array_length(case when jsonb_typeof(pc->'field_changes')='array' then pc->'field_changes' else '[]' end)::text,'0')||' retained='||coalesce(jsonb_array_length(case when jsonb_typeof(pc->'retained_items')='array' then pc->'retained_items' else '[]' end)::text,'0') from (select practical_constraints pc from student_goals where user_id='$U') x"
}
SNAP0="$(snapshot)"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
restore() {
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null </dev/null
  while IFS='|' read -r mid _ ap asked; do
    [ -z "$mid" ] && continue
    local apsql askedsql
    apsql="$([ -z "$ap" ] && echo null || echo "'$ap'")"
    askedsql="$([ -z "$asked" ] && echo null || echo "'$asked'::timestamptz")"
    psqlq -c "update household_member_bodies set appetite=$apsql, appetite_asked_at=$askedsql where member_id='$mid';" >/dev/null </dev/null
  done <<< "$SNAP0"
  # Le message d'accusé posté dans le chat de la fixture est un artefact de test.
  psqlq -c "delete from chat_messages where user_id='$U' and role='assistant' and created_at >= timestamp '$T_SQL' and content like 'J''ai %';" >/dev/null </dev/null
  local b; b="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  [ "$(snapshot)" = "$SNAP0" ] && [ "$b" = "$PC0" ] && echo "   ⤺ fixture restaurée ✓ (appétits + réglages + chat)" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
T_SQL="$(psqlq -c "select to_char(now(),'YYYY-MM-DD HH24:MI:SS')")"
trap restore EXIT INT TERM

if [ -n "${FORCE_PC:-}" ]; then
  psqlq -c "update student_goals set practical_constraints = coalesce(practical_constraints,'{}'::jsonb) || '$FORCE_PC'::jsonb where user_id='$U';" >/dev/null
  echo "   ⇧ FORCÉ: practical_constraints || $FORCE_PC"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BANC_DIR/readnote-${CAS}-${FIXTURE}-${STAMP}.json"
LOG="$BANC_DIR/log-readnote-${CAS}-${FIXTURE}-${STAMP}.txt"
echo "══ $CAS · $FIXTURE · $FN"
echo "   note: « $NOTE »"
echo "   réglages AVANT: $(settings_now)"
echo "   appétits AVANT:"; printf '%s\n' "$SNAP0" | awk -F'|' '{printf "      %-8s %-8s\n",$2,($3==""?"(null)":$3)}'

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
TODAY="$(date +%Y-%m-%d)"
BODY="$(python3 -c 'import json,sys;print(json.dumps({"draft_note":sys.argv[1],"today":sys.argv[2]}))' "$NOTE" "$TODAY")"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 120 \
  -X POST "$API_URL/functions/v1/$FN" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
echo "   http=${R%% *} · ${R##* } s"
docker logs "supabase_edge_runtime_Sophia_2" --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" > "$LOG" || true
echo "   réponse:"; python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
print("      ok=",d.get("ok"),"reason=",d.get("reason"),"dropped=",d.get("dropped_clauses"))
for a in d.get("announced") or []: print("      · "+((a.get("who")+" : ") if a.get("who") else "")+a.get("text",""))
print("      counters=",json.dumps(d.get("counters"),ensure_ascii=False))
' "$OUT"
echo "   réglages APRÈS: $(settings_now)"
echo "   appétits APRÈS:"; snapshot | awk -F'|' '{printf "      %-8s %-8s\n",$2,($3==""?"(null)":$3)}'
echo "   → $OUT · $LOG ($(wc -l < "$LOG" | tr -d ' ') lignes)"
