#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LA CAMPAGNE D'UN MOIS — quatre semaines, et ce que la boucle apprend
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : docs/keel/NOMENCLATURE-MEMOIRE.md §2.8, et le plan de ce chantier.
#
# ── CE QU'ELLE MESURE, QUE LE BANC DES 14 CAS NE MESURE PAS ───────────────
# Le banc prend chaque cas isolément. Celle-ci laisse l'état S'ACCUMULER sur
# quatre semaines: est-ce qu'une question répondue en semaine 1 change le plan
# de la semaine 3 ? Est-ce qu'une question ignorée finit par expirer ? Est-ce
# qu'on annonce autant de fois qu'on écrit — ni plus, ni moins ?
#
# ── DEUX LIMITES, ÉCRITES ICI POUR QU'ON NE LES REDÉCOUVRE PAS ────────────
#   1. L'HORLOGE DU GÉNÉRATEUR N'EST PAS PILOTABLE. Une semaine se simule par
#      une FENÊTRE future (`window: {kind:"exact", starts_on, duration_days:7}`)
#      mais les lignes de mémoire portent `at = le jour RÉEL`. Le passage du
#      temps n'est donc pas exercé; la mort de l'encart à `validated_at` l'a
#      déjà été par la campagne du 2026-09-03.
#   2. UN RUN PAR PHRASE. 1/1 n'est pas un taux. Ce que cette campagne rend
#      est un TABLEAU à relire, pas une statistique.
#
# Usage : scripts/2026-09-04-0130-campagne-un-mois.sh <clé anon> [semaine]
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [semaine]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${CAMPAGNE_EMAIL:-qa-mois-20260904@keeltest.dev}"
OUT="${CAMPAGNE_OUT:-/tmp/campagne-mois-20260904}"
SECRET="${BANC_INTERNAL_SECRET:-}"
mkdir -p "$OUT"

YEL=$'\033[33m'; OFF=$'\033[0m'; [ -t 1 ] || { YEL=""; OFF=""; }
psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente: $EMAIL — lancer la fixture avec --roster cinq" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
mid() { psql "select member_id from household_members where household_id='$HH' and first_name='$1';" | tr -d ' '; }
LEA=$(mid "Léa"); TOM=$(mid Tom); MARC=$(mid Marc); ZOE=$(mid "Zoé")

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))"
}
JWT=$(login); [ -n "$JWT" ] || { echo "login KO" >&2; exit 1; }

plans() { psql "select count(*) from student_generated_meals where user_id='$USER_ID';" | tr -d ' '; }
last_meal() { psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' '; }
local_day() { psql "select (now() at time zone (select timezone from profiles where id='$USER_ID'))::date;"; }
now_iso() { psql "select now()::text;"; }

# ── UNE GÉNÉRATION SUR UNE FENÊTRE EXACTE ─────────────────────────────────
# ⛔ MÊME GARDE QUE LE BANC: on ne rejoue que si le COMPTE prouve que rien n'a
# été écrit. Un 502 coupe la réponse, pas la fonction.
gen() {
  local tag="$1" intent="$2" note="$3" starts="$4"
  local before after code body try dt=0
  before=$(plans)
  body=$(python3 -c "
import json,sys
intent, note, starts, last = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
b = {'operation':'compose','mode':'to_shop',
     'window':{'kind':'exact','starts_on':starts,'duration_days':7},
     'intent':intent}
if intent == 'replace_current' and last: b['replaces'] = last
if note: b['draft_note'] = note
print(json.dumps(b))" "$intent" "$note" "$starts" "$(last_meal)")
  for try in 1 2 3; do
    : > "$OUT/$tag.log"
    docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/$tag.log" 2>&1 &
    local LP=$!
    local t0=$(date +%s)
    code=$(curl -s -o "$OUT/$tag.json" -w "%{http_code}" -X POST \
      "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
      -H "Content-Type: application/json" -d "$body" --max-time 800)
    dt=$(( $(date +%s) - t0 )); sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
    after=$(plans)
    [ "$code" = "200" ] && break
    [ "$after" -ne "$before" ] && { echo "   ${YEL}HTTP $code mais écrit — on n'insiste pas${OFF}"; break; }
    [ "$try" -lt 3 ] && { echo "   HTTP $code, rien d'écrit — reprise ($try/3)"; sleep 20; JWT=$(login); }
  done
  echo "   $tag · HTTP $code en ${dt}s · Δplans=$((after-before)) · fenêtre $starts"
  # ⚠️ LA FENÊTRE RÉELLEMENT POSÉE, RELUE. A1 peut reculer d'un jour: croire
  # `starts_on` sur parole ferait comparer des semaines qui se chevauchent.
  psql "select '   span: ' || starts_on || ' → ' || (starts_on + (duration_days-1)) from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;"
}

# ⛔ UNE FONCTION, PAS DU PYTHON IMBRIQUÉ DANS UN `"$(…)"`. Bash développe les
# accolades d'un dictionnaire python dans cette position et lance python une
# fois par clé, chacune avec une source tronquée — mesuré sur le banc frère, où
# le bilan partait quand même en HTTP 200 avec un corps VIDE.
bilan_body() {
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
body["meal_id"], body["today"] = sys.argv[2], sys.argv[3]
if body.get("anything_else", None) == "":
    body.pop("anything_else")
print(json.dumps(body, ensure_ascii=False))
PY
}

feedback() {
  local tag="$1" json="$2"
  : > "$OUT/$tag.log"
  docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/$tag.log" 2>&1 &
  local LP=$!
  local code
  code=$(curl -s -o "$OUT/$tag.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "$json" --max-time 600)
  sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
  echo "   $tag · HTTP $code"
}

# Le tap du premier bouton d'une question ouverte, ou de l'échappatoire.
tap_question() {
  local tag="$1" since="$2" which="$3"   # which = premier | second | escape
  local q
  q=$(psql "select coalesce(json_build_object('id',id,'buttons',metadata->'buttons')::text,'null')
            from chat_messages where user_id='$USER_ID' and role='assistant' and scope='app'
              and metadata->>'purpose'='keel_memory_clarification' and created_at > '$since'
            order by created_at desc limit 1;")
  if [ "$(printf '%s' "$q" | tr -d ' ')" = "null" ]; then
    echo "   ${YEL}$tag: aucune question posée — rien à taper${OFF}"; return 1
  fi
  local pick
  pick=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1]); which=sys.argv[2]
bs=q.get('buttons') or []
esc=[b for b in bs if b.get('label') in ('Personne de la liste','Aucun de ceux-là')]
picks=[b for b in bs if b not in esc]
sel = esc[0] if which=='escape' else (picks[1] if which=='second' and len(picks)>1 else (picks[0] if picks else None))
print(json.dumps({'id':q['id'],'payload':sel['payload'],'label':sel.get('label','')}) if sel else '')" "$q" "$which")
  [ -n "$pick" ] || { echo "   ${YEL}$tag: aucun bouton $which${OFF}"; return 1; }
  local body
  body=$(python3 -c "
import json,sys,uuid
p=json.loads(sys.argv[1])
print(json.dumps({'client_message_id':'camp-'+uuid.uuid4().hex,'kind':'button',
                  'text':p['label'],'button_payload':p['payload'],'reply_to':p['id']}))" "$pick")
  local code
  code=$(curl -s -o "$OUT/$tag.tap.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/chat-inbound-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "$body" --max-time 300)
  echo "   $tag · tap « $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['label'])" "$pick") » · HTTP $code · $(python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1])).get('handled_by',''))
except Exception: print('')" "$OUT/$tag.tap.json")"
}

pulse() {
  local tag="$1"
  [ -n "$SECRET" ] || { echo "   ${YEL}$tag: BANC_INTERNAL_SECRET absent — pouls non appelé${OFF}"; return 1; }
  curl -s -o "$OUT/$tag.json" -w "   $tag · pouls HTTP %{http_code}\n" -X POST \
    "$URL/functions/v1/keel-daily-pulse-v1" \
    -H "apikey: $ANON" -H "x-internal-secret: $SECRET" \
    -H "Content-Type: application/json" -d '{}' --max-time 300
  # ⛔ CE QU'ON VÉRIFIE DU POULS N'EST PAS QU'IL PARTE, C'EST QU'IL NE REDISE
  # PLUS LA MÉMOIRE. Le bloc a été retiré au profit de l'annonce à l'instant du
  # geste; s'il revient, ce sont DEUX messages pour une écriture.
  psql "select '   dernier message du pouls: ' || left(content, 120)
        from chat_messages where user_id='$USER_ID' and role='assistant'
          and metadata->>'purpose' like 'keel_%pulse%' order by created_at desc limit 1;"
}

# ── LE TABLEAU DE LA SEMAINE, RELU EN BASE ────────────────────────────────
tableau() {
  local sem="$1" since="$2"
  echo "   ── tableau S$sem ─────────────────────────────"
  psql "
    select '   ' || rpad(k, 34) || ' ' || v from (
      select 'plans écrits' as k, count(*)::text as v, 1 as o from student_generated_meals where user_id='$USER_ID' and created_at > '$since'
      union all select 'plans vivants', count(*)::text, 2 from student_generated_meals where user_id='$USER_ID' and retired_at is null
      union all select 'questions posées', count(*)::text, 3 from memory_clarifications where user_id='$USER_ID' and created_at > '$since'
      union all select 'dont répondues', count(*) filter (where status='answered')::text, 4 from memory_clarifications where user_id='$USER_ID' and created_at > '$since'
      union all select 'dont échappées', count(*) filter (where status='declined')::text, 5 from memory_clarifications where user_id='$USER_ID' and created_at > '$since'
      union all select 'dont encore ouvertes', count(*) filter (where status='open')::text, 6 from memory_clarifications where user_id='$USER_ID' and created_at > '$since'
      union all select 'annonces (bulles)', count(*)::text, 7 from chat_messages where user_id='$USER_ID' and metadata->>'purpose'='keel_memory_written' and created_at > '$since'
      union all select 'questions (bulles)', count(*)::text, 8 from chat_messages where user_id='$USER_ID' and metadata->>'purpose'='keel_memory_clarification' and created_at > '$since'
      union all select 'ledger skipped', count(*)::text, 9 from outbound_messages where user_id='$USER_ID' and status='skipped' and created_at > '$since' and metadata->>'purpose' in ('keel_memory_written','keel_memory_clarification')
      union all select 'items en mémoire', jsonb_array_length(coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'),'[]'::jsonb))::text, 10
      union all select 'mémo', jsonb_array_length(coalesce((select practical_constraints->'memo' from student_goals where user_id='$USER_ID'),'[]'::jsonb))::text, 11
      union all select 'encart', jsonb_array_length(coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'),'[]'::jsonb))::text, 12
      union all select 'réglages (field_changes)', jsonb_array_length(coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'),'[]'::jsonb))::text, 13
      union all select 'SÉCURITÉ (doit rester 0)', (select count(*)::text from student_safety_constraints where user_id='$USER_ID'), 14
      union all select 'ALLERGIES (doit rester 0)', (select count(*)::text from household_member_allergies a join household_members m using (member_id) where m.household_id='$HH'), 15
    ) t order by o;"
  # ⛔ LES TROIS REQUÊTES DE DOUBLONS, reprises de la campagne du 2026-09-03.
  local dup
  dup=$(psql "
    select count(*) from (
      select lower(x->>'text') t, x->>'subject' s, count(*) c
      from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) x
      where g.user_id='$USER_ID' group by 1,2 having count(*) > 1) d;")
  echo "   doublons (texte+sujet) : ${dup:-?}"
}

# ═══════════════════════════════════════════════════════════════════════════
# LES QUATRE SEMAINES
# ═══════════════════════════════════════════════════════════════════════════
#
# Chaque semaine: A (prepare_next, note NON ambiguë) puis B (replace_current,
# note ambiguë) — c'est le geste réel « je régénère avec une remarque ». Le
# bilan porte sur B. Le pouls clôt la semaine.
#
# ⚠️ LE TAP DE B EST DÉCLARÉ ICI, PAR SEMAINE, et il varie exprès: répondre,
# répondre à l'autre bouche, s'échapper, se taire. Les quatre sorts d'une
# question doivent être exercés sur un même compte, dans le même mois.
#
#   sem | A (aucune question attendue)          | B (question attendue) | sort
#   ----+---------------------------------------+-----------------------+--------
#    1  | « Mon fils n'aime pas le poisson. »   | « Ma fille … poisson »| second
#    2  | « Mon mari n'aime pas les lentilles. »| « … danse le mardi »  | silence
#    3  | « Les petites adorent les pâtes. »    | « Elle ne veut plus … »| premier
#    4  | « On mange tard le vendredi. »        | « Ma fille est fan …» | escape
SEMAINES=(
"1|Mon fils n'aime pas le poisson.|Ma fille n'aime pas le poisson.|second|{\"cooked\":\"yes\",\"portions\":\"too_much\",\"portions_subject\":\"household\",\"anything_else\":\"J'ai pas aimé la viande.\"}"
"2|Mon mari n'aime pas les lentilles.|Ma fille a danse le mardi soir, il lui faut un vrai repas ce soir-là.|silence|{\"cooked\":\"yes\",\"anything_else\":\"Mon mari trouve qu'il y a trop de riz.\"}"
"3|Les petites adorent les pâtes.|Elle ne veut plus de brocolis.|premier|{\"cooked\":\"yes\",\"difficulty\":\"too_hard\",\"anything_else\":\"Les enfants ont détesté les courgettes, sauf Tom.\"}"
"4|On mange tard le vendredi.|Ma fille est fan de brocolis.|escape|{\"cooked\":\"yes\",\"speed\":\"too_long\",\"anything_else\":\"\"}"
)

echo "════════ CAMPAGNE D'UN MOIS · $EMAIL ════════"
echo "compte $USER_ID · foyer $HH · sortie $OUT"
echo "  Léa=$LEA Tom=$TOM Marc=$MARC Zoé=$ZOE"
D0=$(local_day)

for entry in "${SEMAINES[@]}"; do
  N="${entry%%|*}"; r="${entry#*|}"
  NOTE_A="${r%%|*}"; r="${r#*|}"
  NOTE_B="${r%%|*}"; r="${r#*|}"
  SORT="${r%%|*}"; BILAN="${r#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$N" ] && continue

  # ⚠️ LA SEMAINE k COMMENCE À D0 + 7(k−1), ET DANS LE FUTUR: le générateur
  # refuse un `starts_on` passé, et deux semaines qui se chevauchent rendraient
  # « le plan précédent » ambigu.
  W=$(python3 -c "
import datetime,sys
d0=datetime.date.fromisoformat(sys.argv[1]); k=int(sys.argv[2])
print(d0 + datetime.timedelta(days=7*(k-1) + 1))" "$D0" "$N")
  TODAY_FB=$(python3 -c "
import datetime,sys
print(datetime.date.fromisoformat(sys.argv[1]) + datetime.timedelta(days=6))" "$W")

  echo
  echo "════ SEMAINE $N · fenêtre $W (+7j) · bilan daté $TODAY_FB ════"
  SINCE=$(now_iso)
  JWT=$(login)

  # ── A: la note sans ambiguïté ────────────────────────────────────────────
  gen "S$N.A" prepare_next "$NOTE_A" "$W"

  # ── B: la note ambiguë, sur le MÊME créneau ──────────────────────────────
  SINCE_B=$(now_iso)
  gen "S$N.B" replace_current "$NOTE_B" "$W"
  MEAL=$(last_meal)

  case "$SORT" in
    silence) echo "   S$N.B · SILENCE volontaire — la question reste ouverte";;
    *)       tap_question "S$N.B" "$SINCE_B" "$SORT" || true;;
  esac

  # ── LE BILAN ─────────────────────────────────────────────────────────────
  if [ -n "$BILAN" ] && [ -n "$MEAL" ]; then
    feedback "S$N.bilan" "$(bilan_body "$BILAN" "$MEAL" "$TODAY_FB")"
    # Le bilan peut poser sa propre question (« la viande ») — on la répond
    # quand le plafond l'a laissée partir.
    [ "$N" = "1" ] && { tap_question "S$N.bilan" "$SINCE_B" premier || true; }
  fi

  # ── LE POULS ─────────────────────────────────────────────────────────────
  pulse "S$N.pouls" || true
  tableau "$N" "$SINCE"
done

echo
echo "════════ LE MOIS, EN UNE VUE ════════"
psql "
  select '  ' || to_char(created_at,'HH24:MI') || '  ' || rpad(about,5) || ' ' ||
         rpad(status,9) || ' ' || rpad(source,14) || ' ' || left(pending->>'text', 40)
  from memory_clarifications where user_id='$USER_ID' order by created_at;"
echo
echo "  la mémoire, à la fin du mois:"
psql "
  select '   ' || rpad(x->>'kind', 16) || ' ' ||
         rpad(coalesce((select first_name from household_members where member_id::text = replace(x->>'subject','member:','')), x->>'subject'), 10) ||
         ' ' || left(x->>'text', 46)
  from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) x
  where g.user_id='$USER_ID';"
echo
echo "  ⚠️ Un run par phrase: 1/1 n'est pas un taux. Ce tableau se RELIT,"
echo "     il ne se résume pas en un pourcentage."
