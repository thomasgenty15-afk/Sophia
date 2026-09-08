#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# DEUX TIRS SUR `keel-read-note-v1` — LA QUESTION, PUIS LA RÉPONSE — 2026-09-08
#
#   bash 24-tir-question.sh <cas> <duo|quatre|cinq> "<phrase>" <Prénom>
#
# Lot 4. Le premier appel lit une phrase dont on ne sait pas la bouche («
# ma mère ne mange pas autant »): il ne doit RIEN écrire et rendre une
# question avec les bouches candidates. Le second appel répond avec la
# bouche dont le prénom est donné en 4e argument: UN cran d'appétit, dit.
#
# ⛔ MÊME PHOTO / MÊME RESTAURATION que `23-tir-read-note.sh`.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

CAS="${1:?cas}"; FIXTURE="${2:?duo|quatre|cinq}"; NOTE="${3:?phrase}"; WHO="${4:?prénom}"
EMAIL="$(foyer_email "$FIXTURE")" || { echo "usage: $0 <cas> <fixture> \"<phrase>\" <Prénom>"; exit 2; }
FN="keel-read-note-v1"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $EMAIL"; exit 1; }
HH="$(psqlq -c "select household_id from household_members where user_id='$U' and role='owner'")"

snapshot() {
  psqlq -c "select m.member_id||'|'||coalesce(m.first_name,'?')||'|'||coalesce(b.appetite,'')||'|'||coalesce(b.appetite_asked_at::text,'')
    from household_members m left join household_member_bodies b on b.member_id=m.member_id
    where m.household_id='$HH' order by m.role desc, m.first_name;"
}
SNAP0="$(snapshot)"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
T_SQL="$(psqlq -c "select to_char(now(),'YYYY-MM-DD HH24:MI:SS')")"
restore() {
  psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null </dev/null
  while IFS='|' read -r mid _ ap asked; do
    [ -z "$mid" ] && continue
    local apsql askedsql
    apsql="$([ -z "$ap" ] && echo null || echo "'$ap'")"
    askedsql="$([ -z "$asked" ] && echo null || echo "'$asked'::timestamptz")"
    psqlq -c "update household_member_bodies set appetite=$apsql, appetite_asked_at=$askedsql where member_id='$mid';" >/dev/null </dev/null
  done <<< "$SNAP0"
  psqlq -c "delete from chat_messages where user_id='$U' and role='assistant' and created_at >= timestamp '$T_SQL' and content like 'J''ai %';" >/dev/null </dev/null
  local b; b="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
  [ "$(snapshot)" = "$SNAP0" ] && [ "$b" = "$PC0" ] && echo "   ⤺ fixture restaurée ✓ (appétits + réglages + chat)" || echo "   ⛔ RESTAURATION INCOMPLÈTE"
}
trap restore EXIT INT TERM

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT1="$BANC_DIR/question-${CAS}-${FIXTURE}-${STAMP}-1.json"
OUT2="$BANC_DIR/question-${CAS}-${FIXTURE}-${STAMP}-2.json"
LOG="$BANC_DIR/log-question-${CAS}-${FIXTURE}-${STAMP}.txt"
echo "══ $CAS · $FIXTURE · $FN — question puis réponse"
echo "   note: « $NOTE » · réponse: $WHO"
echo "   appétits AVANT:"; printf '%s\n' "$SNAP0" | awk -F'|' '{printf "      %-8s %-8s\n",$2,($3==""?"(null)":$3)}'

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
TODAY="$(date +%Y-%m-%d)"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── ① LA LECTURE: une question, et rien d'écrit ───────────────────────────
BODY="$(python3 -c 'import json,sys;print(json.dumps({"draft_note":sys.argv[1],"today":sys.argv[2]}))' "$NOTE" "$TODAY")"
R="$(curl -s -o "$OUT1" -w '%{http_code} %{time_total}' --max-time 120 \
  -X POST "$API_URL/functions/v1/$FN" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
echo "   ① lecture: http=${R%% *} · ${R##* } s"
python3 - "$OUT1" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print("      ok=",d.get("ok"),"reason=",d.get("reason"),"announced=",len(d.get("announced") or []))
for q in d.get("questions") or []:
    print("      ? «",q["text"],"» direction=",q["direction"],"options=",[o["label"] for o in q["options"]])
c=d.get("counters") or {}
print("      counters: proposed=",c.get("proposed"),"kept=",c.get("kept"),"who_unknown=",c.get("portions_refused_unknown_member"))
PY
echo "   appétits après ①:"; snapshot | awk -F'|' '{printf "      %-8s %-8s\n",$2,($3==""?"(null)":$3)}'

# ── ② LA RÉPONSE: la bouche dont le prénom est donné ─────────────────────
ANSWER="$(python3 - "$OUT1" "$WHO" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); who=sys.argv[2]
for q in d.get("questions") or []:
    for o in q["options"]:
        if o["label"].lower()==who.lower():
            print(json.dumps({"answer":{"kind":"portion","member_id":o["memberId"],"direction":q["direction"]}})); sys.exit(0)
sys.exit(1)
PY
)" || { echo "   ⛔ aucune question ne propose « $WHO » — pas de second tir"; exit 0; }
R="$(curl -s -o "$OUT2" -w '%{http_code} %{time_total}' --max-time 60 \
  -X POST "$API_URL/functions/v1/$FN" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$ANSWER")"
echo "   ② réponse: http=${R%% *} · ${R##* } s"
python3 - "$OUT2" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print("      ok=",d.get("ok"),"reason=",d.get("reason"))
for a in d.get("announced") or []: print("      · "+((a.get("who")+" : ") if a.get("who") else "")+a.get("text",""))
PY
echo "   appétits après ②:"; snapshot | awk -F'|' '{printf "      %-8s %-8s\n",$2,($3==""?"(null)":$3)}'
docker logs "supabase_edge_runtime_Sophia_2" --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" > "$LOG" || true
echo "   → $OUT1 · $OUT2 · $LOG ($(wc -l < "$LOG" | tr -d ' ') lignes)"
