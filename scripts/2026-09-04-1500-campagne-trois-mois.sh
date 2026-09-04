#!/usr/bin/env bash
# ============================================================================
# TROIS MOIS D'UN MÊME FOYER — la mémoire se remplit, le plan doit s'améliorer
#
# Douze cycles : quatre générations de cinq jours par mois, sur trois mois.
# Chaque cycle peut porter une note écrite par la personne. Certaines sont
# claires (elles s'écrivent), d'autres AMBIGUËS (elles doivent poser une
# question dans le chat). Une réponse tapée doit écrire la ligne.
#
# ⛔ CE QUE LA CAMPAGNE MESURE, ET C'EST UNE COURBE, PAS UN VERDICT :
#   · combien de lignes de mémoire existent, et combien atteignent le prompt ;
#   · combien de fois le plan MORD une ligne, et combien de fois le MODÈLE
#     avait déjà composé la boîte (`separated`) contre les fois où la ceinture
#     a dû rattraper (`not_separated`) ;
#   · combien de bouches restent sans repas ;
#   · les questions posées, répondues, et ce qu'elles ont écrit.
#
# ⚠️ LE FUSEAU EST ÉPINGLÉ À UNE HEURE MATINALE POUR TOUTE LA CAMPAGNE, et
# c'est une parade, pas un détail. Depuis le 2026-09-04 une fenêtre dont le
# premier jour est entièrement dépensé PERD ce jour. Sur une campagne d'une
# heure, les douze tirs ne partent pas à la même heure locale : celui qui
# franchit le seuil du soir rend quatre jours au lieu de cinq, avec moins de
# plats, moins de contenants — et la courbe fléchirait pour une raison qui n'a
# rien à voir avec la mémoire. On empêche la variation au lieu de la détecter,
# ET on la détecte quand même (`duration_days` relu à chaque tir).
# ============================================================================
set -uo pipefail

URL="http://127.0.0.1:54321"
EMAIL="${CAMP_EMAIL:-qa-mois-20260904@keeltest.dev}"
OUT="${CAMP_OUT:-/tmp/campagne-3mois-20260904}"
ANON="${CAMP_ANON:?anon key requise}"
TZ_PIN="${CAMP_TZ:-Etc/GMT+7}"
mkdir -p "$OUT"

psql() { docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }
USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente: $EMAIL" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
mid() { psql "select member_id from household_members where household_id='$HH' and first_name='$1';" | tr -d ' '; }
CLAIRE=$(mid Claire); LEA=$(mid "Léa"); TOM=$(mid Tom); MARC=$(mid Marc); ZOE=$(mid "Zoé")

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))"
}
JWT=$(login); [ -n "$JWT" ] || { echo "login KO" >&2; exit 1; }

plans()     { psql "select count(*) from student_generated_meals where user_id='$USER_ID';" | tr -d ' '; }
last_meal() { psql "select id from student_generated_meals where user_id='$USER_ID' and retired_at is null order by created_at desc limit 1;" | tr -d ' '; }
local_now() { psql "select to_char(now() at time zone (select timezone from profiles where id='$USER_ID'),'HH24:MI');"; }

# ── UNE GÉNÉRATION, ET ELLE NE REJOUE JAMAIS ──────────────────────────────
#
# ⛔ CE COMMENTAIRE DÉCRIVAIT UNE BOUCLE DE REPRISE QUI N'A JAMAIS EXISTÉ.
# Il disait « on ne rejoue jamais sans avoir relu le compte », ce qui laissait
# croire qu'on rejouait parfois. Trouvé le 2026-09-04 en cherchant pourquoi un
# 546 WORKER_LIMIT n'avait pas été repris : il n'y avait rien à reprendre.
#
# ⚠️ ET NE PAS REJOUER EST LE BON COMPORTEMENT ICI, pour deux raisons qui
# valent d'être écrites plutôt que de laisser quelqu'un « réparer » le manque :
#
#   1. Kong coupe la RÉPONSE, pas la fonction. Un 502/504/000 peut recouvrir
#      une génération qui s'écrit derrière : insister en écrirait une seconde.
#   2. Sur une campagne d'ACCUMULATION, un tir rejoué ne part pas à la même
#      heure locale que celui qu'il remplace. Une fenêtre qui franchit le seuil
#      du soir rend quatre jours au lieu de cinq — moins de plats, moins de
#      contenants — et le point rejoué n'est plus comparable aux autres.
#
# Un tir perdu se compte donc HORS MESURE (`546` n'est ni un plan écrit ni un
# refus), et le `Δplans` imprimé à chaque ligne dit si quelque chose est passé
# malgré le code d'erreur.
gen() {
  local tag="$1" note="$2" before after code dt t0
  before=$(plans)
  local body
  body=$(python3 - "$note" "$(last_meal)" <<'PY'
import json, sys
note, last = sys.argv[1], sys.argv[2]
b = {"operation": "compose", "mode": "to_shop",
     "window": {"kind": "days", "count": 5},
     "intent": "replace_current"}
if last: b["replaces"] = last
if note: b["draft_note"] = note
print(json.dumps(b, ensure_ascii=False))
PY
)
  t0=$(date +%s)
  code=$(curl -s -o "$OUT/$tag.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/generate-household-meal-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "$body" --max-time 700)
  dt=$(( $(date +%s) - t0 )); after=$(plans)
  echo "   gen $tag · HTTP $code · ${dt}s · Δplans=$((after-before)) · local $(local_now)"
  [ "$code" = "200" ] || echo "   ⚠ corps: $(head -c 200 "$OUT/$tag.json")"
}

# ── LA QUESTION EN ATTENTE, ET LA RÉPONSE PAR TAP ─────────────────────────
pending() {
  psql "select id||'|'||(options::text) from memory_clarifications
        where user_id='$USER_ID' and status='open' order by created_at desc limit 1;"
}
bubble() {
  psql "select id from chat_messages where user_id='$USER_ID' and role='assistant'
        and metadata->>'purpose'='keel_memory_clarification' order by created_at desc limit 1;" | tr -d ' '
}
tap() {
  local tag="$1" payload="$2" label="$3" b
  b=$(bubble); [ -n "$b" ] || { echo "   ⚠ aucune bulle de question"; return; }
  local body
  body=$(python3 - "$payload" "$label" "$b" <<'PY'
import json, sys, uuid
print(json.dumps({"client_message_id": str(uuid.uuid4()), "kind": "button",
                  "text": sys.argv[2], "button_payload": sys.argv[1],
                  "reply_to": sys.argv[3]}, ensure_ascii=False))
PY
)
  local code
  code=$(curl -s -o "$OUT/$tag-tap.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/chat-inbound-v1" -H "apikey: $ANON" \
    -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "$body" --max-time 200)
  echo "   tap $tag · HTTP $code · $(python3 -c "
import json,sys
try: print(json.load(open('$OUT/$tag-tap.json')).get('handled_by','?'))
except Exception: print('?')")"
}

# ── LA MESURE, APRÈS CHAQUE CYCLE ─────────────────────────────────────────
snap() { python3 "$(dirname "$0")/2026-09-04-1500-mesure-3mois.py" "$USER_ID" "$1"; }

echo "════ CAMPAGNE 3 MOIS · foyer $HH · fuseau épinglé $TZ_PIN ════"
psql "update profiles set timezone='$TZ_PIN' where id='$USER_ID';" >/dev/null
echo "heure locale de départ : $(local_now)"

# ── LA REMISE À ZÉRO, DEMANDÉE EXPLICITEMENT ─────────────────────────────
# ⛔ DÉMONTAGE DE FIXTURE, ASSUMÉ. Aucun écran n'efface la mémoire d'un
# compte : c'est du SQL, sur le seul compte du banc, et seulement pour que la
# courbe parte de zéro. Sans ça le premier cycle hérite de la mémoire d'hier
# et « ça s'améliore » ne veut plus rien dire.
if [ "${CAMP_RESET:-1}" = "1" ]; then
  psql "
    update student_goals set practical_constraints =
      jsonb_set(coalesce(practical_constraints,'{}'::jsonb), '{retained_items}', '[]'::jsonb)
      where user_id='$USER_ID';
    delete from memory_clarifications where user_id='$USER_ID';
    delete from chat_messages where user_id='$USER_ID';
    -- ⛔ LE REGISTRE DES SOLLICITATIONS AUSSI, ET C'EST LA LIGNE QUI MANQUAIT.
    -- Mesuré au premier lancement: le classifieur composait bien la question
    -- (`clarify_kept: 1, clarify_who: 1`) et elle n'était JAMAIS posée —
    -- `clarify_ask_reason: "daily_cap"`, `asks: 2`. Les deux sollicitations du
    -- jour avaient été dépensées par un banc PRÉCÉDENT, et effacer les
    -- questions sans effacer leur registre laisse le budget consommé.
    -- Le produit se comportait exactement comme prévu; c'est la fixture qui
    -- démarrait avec le compteur plein.
    delete from meal_precision_questions where user_id='$USER_ID';
  " >/dev/null
  echo "mémoire, questions et chat remis à zéro"
fi

# ── LA RÉPONSE À UNE QUESTION, PAR LE PRÉNOM ─────────────────────────────
# Les options sont stockées dans l'ordre; le jeton porte la POSITION. On lit
# donc la ligne ouverte et on cherche la position du prénom voulu.
answer_with() {
  local tag="$1" want="$2" row id idx
  row=$(psql "select id||'§'||options::text from memory_clarifications
              where user_id='$USER_ID' and status='open' order by created_at desc limit 1;")
  [ -n "$row" ] || { echo "   ⚠ aucune question ouverte — rien à répondre"; return; }
  id="${row%%§*}"; local opts="${row#*§}"
  idx=$(python3 - "$opts" "$want" <<'PY'
import json, sys
opts = json.loads(sys.argv[1]); want = sys.argv[2]
for i, o in enumerate(opts):
    label = o.get("label") if isinstance(o, dict) else str(o)
    if want.lower() in str(label).lower():
        print(i); raise SystemExit
print(-1)
PY
)
  if [ "$idx" = "-1" ]; then
    echo "   ⚠ « $want » absent des options: $opts"
    return
  fi
  tap "$tag" "KEEL_MEMCLAR_PICK|$id|$idx" "$want"
}
decline() {
  local tag="$1" row id
  row=$(psql "select id from memory_clarifications where user_id='$USER_ID'
              and status='open' order by created_at desc limit 1;" | tr -d ' ')
  [ -n "$row" ] || { echo "   ⚠ aucune question ouverte"; return; }
  tap "$tag" "KEEL_MEMCLAR_NONE|$row" "Personne de la liste"
}

# ══════════════════════════════════════════════════════════════════════════
# LES DOUZE CYCLES — quatre par mois, sur trois mois
# ══════════════════════════════════════════════════════════════════════════
: > "$OUT/courbe.jsonl"
cycle() {
  local tag="$1" note="$2"
  echo; echo "── $tag ─────────────────────────────────────────────"
  [ -n "$note" ] && echo "   note: « $note »"
  gen "$tag" "$note"
  snap "$tag" | tee -a "$OUT/courbe.jsonl"
}

# MOIS 1 — le foyer commence à parler
cycle M1C1 ""
cycle M1C2 "Mon fils n'aime pas le poisson."
cycle M1C3 "Ma fille n'aime pas les courgettes."
echo "   → on répond à la question ouverte : Zoé"
answer_with M1C3 "Zoé"
cycle M1C4 ""

# MOIS 2 — ça se précise
cycle M2C1 "Mon mari ne veut plus de lentilles."
cycle M2C2 "Les petites adorent les pâtes."
cycle M2C3 "Elle a horreur des épinards."
echo "   → on refuse de répondre : « Personne de la liste »"
decline M2C3
cycle M2C4 ""

# MOIS 3 — la mémoire est pleine, le plan doit la tenir
cycle M3C1 "On mange végétarien le lundi soir."
cycle M3C2 "Tom ne mange plus de fromage."
cycle M3C3 ""
cycle M3C4 ""

echo
echo "════ FIN — le fuseau revient à Europe/Paris ════"
psql "update profiles set timezone='Europe/Paris' where id='$USER_ID';" >/dev/null
python3 - "$OUT/courbe.jsonl" <<'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
cols = ["cycle", "days", "memory_food_lines", "violations_on_plate",
        "exclusion_bites", "exclusion_separated", "exclusion_not_separated",
        "unfed_missing", "unfed_restored", "chat_notices", "chat_questions",
        "chat_voir_buttons", "clarifications"]
head = ["cycle", "j", "mém", "viol", "mord", "sépa", "rattr", "sansrepas", "rendu",
        "notif", "quest", "voir", "questions"]
print(" | ".join(f"{h:<9}" for h in head))
print("-" * 118)
for r in rows:
    print(" | ".join(f"{str(r.get(c, '')):<9}" for c in cols))
PY
