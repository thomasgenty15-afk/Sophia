#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LE BANC DES CLARIFICATIONS — quatorze cas, en conditions réelles
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité produit : docs/keel/NOMENCLATURE-MEMOIRE.md §2.8 et §8.3.
#
# ── CE QU'IL MESURE, ET POURQUOI AUCUN TEST UNITAIRE NE LE PEUT ───────────
# Le chantier repose sur un JUGEMENT DE MODÈLE: « ma fille » avec deux filles
# doit poser une question, « mon fils » avec un seul garçon ne doit PAS. Les
# deux moitiés comptent, et c'est leur COEXISTENCE qui dit que la question part
# au bon moment plutôt que systématiquement. Un test unitaire fige une réponse
# de modèle; ce banc lui pose la vraie question, avec le vrai roster, sur un
# vrai plan.
#
# ── LES CINQ ÉCHECS DE BANC DÉJÀ PAYÉS DANS CE DÉPÔT, ÉVITÉS ICI ──────────
#   1. Lire un chemin JSON QUI N'EXISTE PAS et imprimer « 0 » — qui se lit
#      comme une exclusion réussie. Tout chemin lu ici est vérifié non vide
#      au moins une fois, sinon le cas est INCONCLUSIVE.
#   2. Compter des lignes SANS filtrer sur `user_id` — les comptes voisins du
#      poste polluent tout. Chaque requête porte le compte.
#   3. Insister sur un 502 de Kong et écrire DEUX plans. `gen` relit le compte
#      avant d'insister, et un `delta != 1` ANNULE le cas.
#   4. Taper sans `reply_to`: la fraîcheur est alors fail-open, et le cas S ne
#      mesure plus rien.
#   5. Prendre un vert de banc pour un vert de produit. Un INCONCLUSIVE n'est
#      JAMAIS compté PASS, et sa précondition est nommée.
#
# ⛔ CE BANC NE CORRIGE PAS LE PRODUIT POUR VERDIR. Si un cas échoue, c'est le
# rapport qui le dit.
#
# Usage : scripts/2026-09-04-0030-banc-clarifications.sh <clé anon> [cas]
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [cas]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${BANC_EMAIL:-qa-clarif-20260904@keeltest.dev}"
OUT="${BANC_OUT:-/tmp/banc-clarif-20260904}"
mkdir -p "$OUT"

RED=$'\033[31m'; GREEN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; YEL=""; OFF=""; }

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

# ---------------------------------------------------------------------------
# LE PRÉ-VOL — il refuse de continuer, il ne prévient pas
# ---------------------------------------------------------------------------
fatal() { echo "${RED}PRÉ-VOL: $1${OFF}" >&2; exit 1; }

echo "════════ PRÉ-VOL ════════"

# ① Le compte et le foyer
USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || fatal "fixture absente ($EMAIL). Lancer d'abord:
   deno run --allow-net --allow-env scripts/2026-09-01-fixture-foyer-retours.ts \\
     --anon <anon> --service <service> --roster cinq \\
     --coach 00000000-0000-4000-8000-00000000d15c --email $EMAIL"
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
[ -n "$HH" ] || fatal "aucun foyer pour $USER_ID"

mid() { psql "select member_id from household_members where household_id='$HH' and first_name='$1';" | tr -d ' '; }
CLAIRE=$(mid Claire); LEA=$(mid "Léa"); TOM=$(mid Tom); MARC=$(mid Marc); ZOE=$(mid "Zoé")
for pair in "Claire:$CLAIRE" "Léa:$LEA" "Tom:$TOM" "Marc:$MARC" "Zoé:$ZOE"; do
  [ -n "${pair#*:}" ] || fatal "bouche manquante: ${pair%%:*} — relancer la fixture avec --roster cinq"
done

# ② LE ROSTER TEL QUE LE CLASSIFIEUR LE LIT — pas tel que la table le stocke.
#    ⛔ `keel_household_bodies_for` prend le FOYER, `roster_for` la PERSONNE:
#    deux RPC, deux arguments, et l'erreur ressemble à une panne de base.
ROSTER=$(psql "
  with r as (select * from public.keel_household_roster_for('$USER_ID')),
       b as (select * from public.keel_household_bodies_for('$HH'))
  select string_agg(r.first_name || ' ' || r.age_state || ' ' || coalesce(b.gender,'?'), ' | ' order by r.first_name)
  from r left join b on b.member_id = r.member_id;")
EXPECT_ROSTER="Claire adult female | Léa minor female | Marc adult male | Tom minor male | Zoé minor female"
[ "$ROSTER" = "$EXPECT_ROSTER" ] || fatal "roster inattendu.
   obtenu : $ROSTER
   attendu: $EXPECT_ROSTER
   ⚠️ Un sexe « ? » fait S'ABSTENIR le classifieur — l'ambiguïté disparaîtrait
   pour la mauvaise raison."
echo "roster ✓ $ROSTER"

# ③ Le fuseau et la langue — le plafond se compte en jour LOCAL
TZ_LOC=$(psql "select coalesce(timezone,'') || '/' || coalesce(locale,'') from profiles where id='$USER_ID';")
[ "$TZ_LOC" = "Europe/Paris/fr-FR" ] || fatal "profil: $TZ_LOC (attendu Europe/Paris/fr-FR)"
echo "profil ✓ $TZ_LOC"

# ④ LES NOMS QUE CE BANC SUPPOSE, RÉSOLUS PAR GREP. Un grep vide veut dire que
#    le produit a été renommé et que ce banc mesurerait un fantôme.
need() {
  grep -rq "$2" "$1" || fatal "introuvable dans $1: $2
   Ce banc épingle un nom du produit. S'il a changé, c'est le banc qu'il faut
   corriger — pas le verdict qu'il faut croire."
  echo "   ✓ $2"
}
need supabase/functions/_shared/chat/deterministic_buttons.ts "MEMORY_CLARIFICATION_BUTTON_PREFIX"
need supabase/functions/_shared/chat/deterministic_buttons.ts "NAVIGATION_BUTTON_PREFIX"
need supabase/functions/_shared/keel/memory_clarification_io.ts 'MEMORY_CLARIFICATION_PURPOSE = "keel_memory_clarification"'
need supabase/functions/_shared/keel/memory_clarification_io.ts 'MEMORY_WRITTEN_PURPOSE = "keel_memory_written"'
CAP=$(grep -oE "MEMORY_CLARIFICATION_DAILY_CAP = [0-9]+" supabase/functions/_shared/keel/daily_ask_budget.ts | grep -oE "[0-9]+$")
[ -n "$CAP" ] || fatal "plafond quotidien introuvable"
echo "   ✓ plafond quotidien = $CAP"

# ⑤ LA TABLE EXISTE VRAIMENT. Une migration non appliquée rendrait chaque
#    question `insert_failed` — un silence qui ressemble à « le modèle n'a pas
#    hésité ».
HAS_TABLE=$(psql "select to_regclass('public.memory_clarifications') is not null;")
[ "$HAS_TABLE" = "t" ] || fatal "table memory_clarifications absente — migration 20260904090000 non appliquée"
echo "   ✓ memory_clarifications"

# ⑤bis KONG NE DOIT PAS COUPER AVANT LA FONCTION.
#    ⛔ Cicatrice chiffrée: à 60 s, Kong rend « An invalid response was received
#    from the upstream server » PENDANT que la génération continue derrière. Le
#    502 ressemble à une panne, alors que le plan s'écrit — et insister en écrit
#    un second. Mesuré au premier tir de ce banc.
KONG_TO=$(docker exec supabase_kong_Sophia_2 sh -c "grep -oE 'read_timeout: [0-9]+' /home/kong/kong.yml | grep -oE '[0-9]+'" 2>/dev/null | head -1)
if [ -z "$KONG_TO" ] || [ "$KONG_TO" -lt 300000 ]; then
  fatal "Kong coupe les fonctions à ${KONG_TO:-60000} ms. Une génération de foyer
   dépasse largement. Lancer d'abord:
     TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh"
fi
echo "   ✓ Kong read_timeout = ${KONG_TO} ms"

# ⑥ LE RUNTIME EST PLUS JEUNE QUE LE DERNIER COMMIT DES FONCTIONS.
#    ⛔ Cicatrice: un `_shared` MODIFIÉ n'est pas rechargé par le runtime. Un
#    banc lancé sur du code d'hier mesure le produit d'hier.
# ⛔ LES DEUX EN ÉPOQUE, ET C'EST UNE FAUTE DÉJÀ COMMISE ICI. `docker inspect`
# rend de l'UTC (`…Z`) et `git %cI` rend l'heure LOCALE avec son décalage: les
# tronquer tous les deux à 19 caractères compare 22:04 UTC à 23:59 Paris, et le
# pré-vol accuse un runtime qui était en réalité PLUS RÉCENT que le commit.
# ⛔ ON COMPARE AU `mtime` DU DISQUE, PAS À LA DATE DU DERNIER COMMIT. Un
# `git commit` ne touche AUCUN fichier: comparer à lui accuse un runtime frais
# dès qu'une session voisine commite, et laisse passer un runtime périmé quand
# quelqu'un édite sans commiter — les deux erreurs, dans les deux sens. Ce que
# le runtime charge, c'est le disque.
RT_AT=$(docker inspect -f '{{.State.StartedAt}}' supabase_edge_runtime_Sophia_2 2>/dev/null)
NEWEST=$(find supabase/functions -name '*.ts' -newermt "@0" -print0 2>/dev/null \
  | xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1)
FILE_S="${NEWEST%% *}"; FILE_N="${NEWEST#* }"
if [ -n "$RT_AT" ] && [ -n "$FILE_S" ]; then
  RT_S=$(python3 -c "
import datetime,sys,re
raw = re.sub(r'\.[0-9]+', '', sys.argv[1].strip()).replace('Z', '+00:00')
print(int(datetime.datetime.fromisoformat(raw).timestamp()))" "$RT_AT")
  if [ "$RT_S" -lt "$FILE_S" ]; then
    fatal "le runtime edge a démarré AVANT la dernière écriture sous
   supabase/functions/ — il sert des modules périmés.
     runtime : $(python3 -c "import datetime,sys;print(datetime.datetime.fromtimestamp(int(sys.argv[1])))" "$RT_S")
     fichier : $(python3 -c "import datetime,sys;print(datetime.datetime.fromtimestamp(int(sys.argv[1])))" "$FILE_S")  ($FILE_N)
   Réparer par un redémarrage de \`supabase functions serve\` — JAMAIS par un
   \`docker restart\` si \`functions serve\` tourne."
  fi
  echo "   ✓ runtime plus jeune que le dernier fichier ($FILE_N)"
fi

# ⑦bis LA REMISE À ZÉRO, SUR DEMANDE EXPLICITE
#
# ⚠️ `--purge` DE LA FIXTURE NE SUFFIT PAS, ET C'EST MESURÉ: il refait le
# roster, mais laisse les plans, la mémoire et les bulles. Un second passage du
# banc y trouve alors ses propres écritures — et la dédup rend `d_items: 0` sur
# un cas qui a parfaitement marché la première fois.
#
# ⛔ EN SQL, ET C'EST LA SEULE ÉCRITURE DE CE BANC QUI NE PASSE PAS PAR UNE
# PORTE. Assumé et nommé: c'est un DÉMONTAGE de fixture, pas un geste du
# produit — il n'existe aucun écran qui efface la mémoire d'un compte. Il ne
# tourne que sur le compte du banc, et seulement si on le demande.
if [ "${BANC_RESET:-0}" = "1" ]; then
  psql "
    delete from memory_clarifications where user_id='$USER_ID';
    delete from meal_precision_questions where user_id='$USER_ID';
    delete from outbound_messages where user_id='$USER_ID';
    delete from chat_messages where user_id='$USER_ID';
    delete from student_generated_meals where user_id='$USER_ID';
    delete from meal_plan_feedback where user_id='$USER_ID';
    delete from student_safety_constraints where user_id='$USER_ID';
    update student_goals
       set practical_constraints = coalesce(practical_constraints,'{}'::jsonb)
             - 'retained_items' - 'memo' - 'retained_next_plan' - 'field_changes'
     where user_id='$USER_ID';" >/dev/null
  echo "   ✓ compte remis à zéro (BANC_RESET=1)"
fi

# ⑦ LES DIX ZÉROS — la mémoire est nue, sinon les deltas ne veulent rien dire.
ZEROS=$(psql "
  select json_build_object(
    'items',  jsonb_array_length(coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'),'[]'::jsonb)),
    'memo',   jsonb_array_length(coalesce((select practical_constraints->'memo' from student_goals where user_id='$USER_ID'),'[]'::jsonb)),
    'encart', jsonb_array_length(coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'),'[]'::jsonb)),
    'champs', jsonb_array_length(coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'),'[]'::jsonb)),
    'securite',    (select count(*) from student_safety_constraints where user_id='$USER_ID'),
    'restrictions',(select count(*) from household_food_restrictions r join household_members m using (member_id) where m.household_id='$HH'),
    'allergies',   (select count(*) from household_member_allergies a join household_members m using (member_id) where m.household_id='$HH'),
    'regimes',     (select count(*) from household_members where household_id='$HH' and diet is not null),
    'questions',   (select count(*) from memory_clarifications where user_id='$USER_ID'),
    'bulles',      (select count(*) from chat_messages where user_id='$USER_ID')
  )::text")
NONZERO=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1]); print(','.join(f'{k}={v}' for k,v in d.items() if v))" "$ZEROS")
if [ -n "$NONZERO" ]; then
  echo "${YEL}   ⚠️ la mémoire n'est PAS nue: $NONZERO${OFF}"
  echo "${YEL}      Les deltas restent justes (ils sont mesurés avant/après chaque cas),${OFF}"
  echo "${YEL}      mais un état antérieur peut avoir consommé le plafond du jour.${OFF}"
else
  echo "   ✓ les dix zéros"
fi

echo "compte $USER_ID · foyer $HH"
echo "  Claire=$CLAIRE Léa=$LEA Tom=$TOM Marc=$MARC Zoé=$ZOE"

# ---------------------------------------------------------------------------
# LE TRANSPORT
# ---------------------------------------------------------------------------
login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))"
}
JWT=$(login)
[ -n "$JWT" ] || fatal "login KO"

plans() { psql "select count(*) from student_generated_meals where user_id='$USER_ID';" | tr -d ' '; }
last_meal() { psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' '; }

snapshot() {
  psql "
    select json_build_object(
      'items',  coalesce((select practical_constraints->'retained_items' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'memo',   coalesce((select practical_constraints->'memo' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'encart', coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'champs', coalesce((select practical_constraints->'field_changes' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'securite',    (select count(*) from student_safety_constraints where user_id='$USER_ID'),
      'restrictions',(select count(*) from household_food_restrictions r join household_members m using (member_id) where m.household_id='$HH'),
      'allergies',   (select count(*) from household_member_allergies a join household_members m using (member_id) where m.household_id='$HH'),
      'regimes',     (select count(*) from household_members where household_id='$HH' and diet is not null)
    )::text"
}

# Les lignes de questions créées depuis un instant, avec leur statut.
clar_rows() {
  psql "select coalesce(json_agg(json_build_object('id',id,'about',about,'status',status,'source',source,'options',options,'gate',pending->>'gate') order by created_at)::text,'[]')
        from memory_clarifications where user_id='$USER_ID' and created_at > '$1';"
}

# La DERNIÈRE bulle de question depuis un instant. `null` si aucune.
question_bubble() {
  psql "select coalesce(json_build_object('id',id,'content',content,'buttons',metadata->'buttons')::text,'null')
        from chat_messages
        where user_id='$USER_ID' and role='assistant' and scope='app'
          and metadata->>'purpose'='keel_memory_clarification' and created_at > '$1'
        order by created_at desc limit 1;"
}

# TOUTES les bulles d'annonce depuis un instant.
#
# ⛔ UNE ANNONCE EST UNE BULLE QUI PORTE « VOIR » — pas un `purpose`.
#
# Deux fautes de banc successives, sur la même fonction, et la seconde est née
# de la correction de la première:
#
#   ① N'avoir compté que `keel_memory_written` rendait `n_count: 0` sur un D1
#      par ailleurs PARFAIT: quand l'écriture vient d'un TAP, c'est le répondeur
#      de bouton qui porte l'accusé (`keel_memory_clarification_ack`), avec le
#      même corps et le même « Voir ».
#   ② Ajouter ce second purpose a fait compter l'accusé d'un REFUS (« D'accord,
#      je n'ai rien noté. ») comme une annonce — et D5, dont tout l'objet est
#      qu'on n'annonce RIEN, est passé de PASS à FAIL.
#
# Le critère juste n'est ni l'un ni l'autre: une annonce est une bulle qui DIT
# OÙ ALLER VOIR ce qui vient d'être écrit. S'il n'y a pas de « Voir », il n'y a
# rien eu à écrire.
notice_bubbles() {
  psql "select coalesce(json_agg(json_build_object('id',id,'content',content,'buttons',metadata->'buttons') order by created_at)::text,'[]')
        from chat_messages
        where user_id='$USER_ID' and role='assistant' and scope='app'
          and created_at > '$1'
          and exists (
            select 1 from jsonb_array_elements(coalesce(metadata->'buttons','[]'::jsonb)) b
            where b->>'payload' like 'KEEL_VIEW_ABOUT_YOU|%');"
}

# Le LEDGER: c'est ici qu'une bulle disparaît SANS erreur.
ledger() {
  psql "select coalesce(json_agg(json_build_object('purpose',metadata->>'purpose','status',status,'reason',metadata->>'delivery_reason') order by created_at)::text,'[]')
        from outbound_messages
        where user_id='$USER_ID' and created_at > '$1'
          and metadata->>'purpose' in ('keel_memory_clarification','keel_memory_written','keel_memory_clarification_ack');"
}

now_iso() { psql "select now()::text;"; }

# ---------------------------------------------------------------------------
# `gen` — UNE génération, et la garde anti-double-écriture
# ---------------------------------------------------------------------------
#
# ⛔ SUR UN 502/504/000 ON NE RÉESSAIE **JAMAIS** AVANT D'AVOIR RELU LE COMPTE.
# Kong coupe à 60 s pendant que la fonction continue derrière: insister écrit un
# SECOND plan, et le second efface la question du premier (une seule ouverte).
gen() {
  local case="$1" text="$2" days="$3"
  local before after body code
  before=$(plans)
  body=$(python3 -c "
import json,sys
last, text, days = sys.argv[1], sys.argv[2], int(sys.argv[3])
b = {'operation':'compose','mode':'to_shop','window':{'kind':'days','count':days}}
if last: b['intent']='replace_current'; b['replaces']=last
else: b['intent']='prepare_next'
if text: b['draft_note']=text
print(json.dumps(b))" "$(last_meal)" "$text" "$days")

  local try dt=0
  for try in 1 2 3; do
    : > "$OUT/$case.gen.log"
    docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/$case.gen.log" 2>&1 &
    local LP=$!
    local t0=$(date +%s)
    code=$(curl -s -o "$OUT/$case.gen.json" -w "%{http_code}" -X POST \
      "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
      -H "Content-Type: application/json" -d "$body" --max-time 800)
    dt=$(( $(date +%s) - t0 ))
    sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
    after=$(plans)
    [ "$code" = "200" ] && break
    # ⛔ ON NE REJOUE QUE SI LE COMPTE PROUVE QUE RIEN N'A ÉTÉ ÉCRIT. C'est la
    # règle entière: un 502 de Kong ou un runtime qui redémarre coupe la
    # RÉPONSE, pas la fonction — elle peut très bien avoir fini derrière. Un
    # rejeu aveugle écrit un SECOND plan, et le second efface la question du
    # premier (une seule ouverte par personne).
    if [ "$after" -ne "$before" ]; then
      echo "   ${YEL}HTTP $code mais le plan a été ÉCRIT (Δ=$((after-before))): on n'insiste pas${OFF}"
      break
    fi
    [ "$try" -lt 3 ] && {
      echo "   HTTP $code en ${dt}s, rien d'écrit — reprise ($try/3)"
      # Le runtime redémarre par salves sur un arbre partagé: on lui laisse le
      # temps de revenir plutôt que de le frapper pendant qu'il tombe.
      sleep 20
      JWT=$(login)
    }
  done

  GEN_HTTP="$code"; GEN_DELTA=$(( after - before )); GEN_SECS="$dt"
  echo "   plan · HTTP $code en ${dt}s · plans ${before}→${after} (Δ=$GEN_DELTA)"
}

# `feedback` — le bilan, avec son texte libre
feedback() {
  local case="$1" meal="$2" json="$3"
  : > "$OUT/$case.bilan.log"
  docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/$case.bilan.log" 2>&1 &
  local LP=$!
  FB_HTTP=$(curl -s -o "$OUT/$case.bilan.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/keel-plan-feedback-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "$json" --max-time 600)
  sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
  echo "   bilan · HTTP $FB_HTTP"
}

# ── LE CORPS D'UN BILAN, FABRIQUÉ PAR UNE FONCTION ────────────────────────
#
# ⛔ JAMAIS DU PYTHON MULTILIGNE IMBRIQUÉ DANS UN `"$(…)"`. Mesuré ici, et le
# symptôme est trompeur: bash a fait de la DÉVELOPPEMENT D'ACCOLADES sur le
# dictionnaire python (`{'a':1,'b':2}` → deux mots), et le script a lancé
# python DEUX FOIS avec une moitié de source chacune. Le bilan est quand même
# parti (HTTP 200) — avec un corps VIDE — et le cas a rendu INCONCLUSIVE pour
# une raison qui n'avait rien à voir avec le produit. Une fonction à part, avec
# un heredoc cité, ferme le trou pour de bon.
body_of() {
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
meal, today, note = sys.argv[1], sys.argv[2], sys.argv[3]
body = {"meal_id": meal, "today": today, "cooked": "yes"}
if note:
    body["anything_else"] = note
print(json.dumps(body, ensure_ascii=False))
PY
}

pulse_body() {
  python3 - "$1" <<'PY'
import json, sys
# ⚠️ LA CHAÎNE ARRIVE DÉJÀ EN ISO-8601 UTC. On ne la RÉPARE pas ici: une
# réparation silencieuse est très exactement ce qui a fait passer un horodatage
# invalide pour une heure valide.
now = sys.argv[1].strip()
if not now.endswith("Z") or " " in now:
    raise SystemExit(f"horodatage non ISO-8601 UTC: {now!r}")
print(json.dumps({"now": now, "dry_run": True}))
PY
}

# `tap` — un bouton. ⚠️ `reply_to` OBLIGATOIRE: sans lui la fraîcheur est
# fail-open, et le cas S ne mesure plus rien.
tap() {
  local case="$1" bubble="$2" payload="$3" label="$4"
  : > "$OUT/$case.tap.log"
  docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/$case.tap.log" 2>&1 &
  local LP=$!
  local body
  body=$(python3 -c "
import json,sys,uuid
print(json.dumps({'client_message_id':'banc-'+uuid.uuid4().hex,'kind':'button',
                  'text':sys.argv[1],'button_payload':sys.argv[2],'reply_to':sys.argv[3]}))" \
    "$label" "$payload" "$bubble")
  TAP_HTTP=$(curl -s -o "$OUT/$case.tap.json" -w "%{http_code}" -X POST \
    "$URL/functions/v1/chat-inbound-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "$body" --max-time 300)
  sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
  TAP_HANDLED=$(python3 -c "
import json,sys
try:
  d=json.load(open(sys.argv[1])); print(d.get('handled_by') or d.get('handledAs') or '')
except Exception: print('')" "$OUT/$case.tap.json")
  echo "   tap · HTTP $TAP_HTTP · handled=$TAP_HANDLED"
}

# La ligne de trace du classifieur, depuis un journal.
classify_of() {
  grep '"tag":"keel/draft_note_classify"' "$1" 2>/dev/null \
    | sed 's/.*{"tag":"keel\/draft_note_classify"/{"tag":"keel\/draft_note_classify"/' \
    | grep '"clarify_proposed"' | tail -1
}

# ---------------------------------------------------------------------------
# `collect` — l'OBTENU d'un cas, assemblé une fois, en un seul objet
# ---------------------------------------------------------------------------
#
# ⚠️ TOUT CE QUE LE JUGE COMPARE SORT D'ICI, ET DONC D'UNE REQUÊTE OU D'UN
# FICHIER DE `$OUT`. Rien n'est affirmé de mémoire.
collect() {
  local case="$1" since="$2"
  local before="$OUT/$case.before.json" after="$OUT/$case.after.json"
  snapshot > "$after"
  python3 - "$case" "$since" "$before" "$after" \
      "$OUT/$case.gen.log" "$OUT/$case.bilan.log" "$OUT/$case.tap.log" \
      "$(clar_rows "$since")" "$(question_bubble "$since")" \
      "$(notice_bubbles "$since")" "$(ledger "$since")" \
      "${GEN_HTTP:-}" "${GEN_DELTA:-}" "${FB_HTTP:-}" "${TAP_HTTP:-}" "${TAP_HANDLED:-}" \
      > "$OUT/$case.obtenu.json" <<'PY'
import json, os, re, sys

(case, since, before_p, after_p, genlog, bilanlog, taplog,
 clar_s, q_s, n_s, led_s, gen_http, gen_delta, fb_http, tap_http, tap_handled) = sys.argv[1:17]

def jload(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}

def jparse(text, fallback):
    try:
        return json.loads(text) if text.strip() else fallback
    except Exception:
        return fallback

before, after = jload(before_p), jload(after_p)
clar = jparse(clar_s, [])
question = jparse(q_s, None)
notices = jparse(n_s, [])
ledger = jparse(led_s, [])

# ── LA TRACE DU CLASSIFIEUR ────────────────────────────────────────────────
# ⛔ FILTRÉE SUR LE COMPTE. Le poste porte des comptes voisins qui écrivent
# dans le même journal docker; une ligne prise « la dernière » peut être celle
# d'un autre banc qui tourne en parallèle.
USER = os.environ.get("BANC_USER_ID", "")
def classify_from(*paths):
    found = None
    for path in paths:
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    at = line.find('{"tag":"keel/draft_note_classify"')
                    if at < 0:
                        continue
                    try:
                        row = json.loads(line[at:].strip())
                    except Exception:
                        continue
                    if "clarify_proposed" not in row:
                        continue
                    if USER and row.get("user_id") != USER:
                        continue
                    found = row
        except FileNotFoundError:
            continue
    return found

trace = classify_from(genlog, bilanlog) or {}

# ── LES DELTAS DE MÉMOIRE ──────────────────────────────────────────────────
def items(snap):
    return snap.get("items") or []
def key(it):
    return (it.get("kind"), it.get("subject"), (it.get("text") or "").lower())
old = {key(i) for i in items(before)}
added = [i for i in items(after) if key(i) not in old]

def count(snap, field):
    return len(snap.get(field) or [])

out = {
  "http": int(gen_http) if gen_http.isdigit() else (int(fb_http) if fb_http.isdigit() else 0),
  "plans_delta": int(gen_delta) if gen_delta.strip().lstrip("-").isdigit() else None,
  # Les compteurs du classifieur, réduits à ceux que les cas déclarent.
  "clarify_proposed": trace.get("clarify_proposed"),
  "clarify_kept": trace.get("clarify_kept"),
  "clarify_refused_bad_options": trace.get("clarify_refused_bad_options"),
  "clarify_ask_reason": trace.get("clarify_ask_reason"),
  "pref_kept": trace.get("pref_kept"),
  "notes_kept": trace.get("notes_kept"),
  "next_kept": trace.get("next_kept"),
  "skipped_degree": trace.get("skipped_degree"),
  "skipped_meal_story": trace.get("skipped_meal_story"),
  "refused_unknown_member": trace.get("refused_unknown_member"),
  # Les questions
  "clar_created": len(clar),
  "clar_status": [c.get("status") for c in clar],
  "clar_about": [c.get("about") for c in clar],
  "q_count": 1 if question else 0,
  "q_labels": [b.get("label") for b in (question or {}).get("buttons") or []],
  "q_payloads_ok": all(
      str(b.get("payload", "")).startswith("KEEL_MEMCLAR_")
      for b in (question or {}).get("buttons") or []
  ) if question else True,
  # Les annonces
  "n_count": len(notices),
  "n_text": " ⏐ ".join(n.get("content") or "" for n in notices),
  "n_view_buttons": sum(
      1 for n in notices for b in (n.get("buttons") or [])
      if str(b.get("payload", "")).startswith("KEEL_VIEW_ABOUT_YOU|")
  ),
  # La base
  "d_items": len(added),
  "added": [{"kind": i.get("kind"), "subject": i.get("subject"),
             "text": i.get("text"), "at": i.get("at")} for i in added],
  "d_memo": count(after, "memo") - count(before, "memo"),
  "d_encart": count(after, "encart") - count(before, "encart"),
  "d_champs": count(after, "champs") - count(before, "champs"),
  # ⛔ CES QUATRE NE BOUGENT JAMAIS. Une phrase de goût qui écrit une allergie
  # est le défaut le plus cher que ce chantier puisse produire.
  "securite_bouge": after.get("securite") != before.get("securite"),
  "allergies_bouge": after.get("allergies") != before.get("allergies"),
  "restrictions_bouge": after.get("restrictions") != before.get("restrictions"),
  "regimes_bouge": after.get("regimes") != before.get("regimes"),
  # Le ledger: une bulle refusée est SILENCIEUSE côté produit.
  "ledger_skipped": sum(1 for r in ledger if r.get("status") == "skipped"),
  "ledger": ledger,
  # Le tap
  "tap_http": int(tap_http) if tap_http.isdigit() else None,
  "tap_handled": tap_handled or None,
}

# ── LES PRÉCONDITIONS DU BANC ──────────────────────────────────────────────
# ⚠️ ELLES NE SONT PAS DES ÉCHECS DU PRODUIT. Un classifieur qui n'a pas
# tourné (le modèle est tombé, la note a été refusée en amont) rend des
# compteurs `None`: comparer `None == 0` ferait passer un cas pour un succès
# alors que rien n'a été mesuré.
if trace == {} and os.environ.get("BANC_NEEDS_TRACE", "1") == "1":
    out["_inconclusive"] = (
        "aucune ligne `keel/draft_note_classify` pour ce compte dans les "
        "journaux — le classifieur n'a pas tourné, rien n'est mesurable")
print(json.dumps(out, ensure_ascii=False, indent=1))
PY
}

PASS=0; FAIL=0; INCONC=0
declare -a VERDICTS

# `judge <cas> <fichier attendu>`
judge() {
  local case="$1" expect="$2"
  python3 scripts/2026-09-04-0030-juge-clarifications.py "$expect" "$OUT/$case.obtenu.json"
  local rc=$?
  case $rc in
    0) PASS=$((PASS+1)); VERDICTS+=("$case PASS");;
    2) INCONC=$((INCONC+1)); VERDICTS+=("$case INCONCLUSIVE");;
    *) FAIL=$((FAIL+1)); VERDICTS+=("$case FAIL");;
  esac
}

export BANC_USER_ID="$USER_ID"

# ---------------------------------------------------------------------------
# LE JOUR LOCAL — deux journées, parce que le plafond est de deux par jour
# ---------------------------------------------------------------------------
#
# ⚠️ DEUX, ET PAS TROIS. Les fuseaux vont de UTC−12 à UTC+12: à un instant
# donné, ils ne rendent que DEUX dates locales. Les cinq questions du banc sont
# donc réparties 2 + 2, la cinquième étant justement celle qui doit être
# REFUSÉE par le plafond (cas P).
#
# ⛔ PAR LA MÊME ÉCRITURE QUE L'ÉCRAN (PATCH PostgREST, jeton de la personne),
# jamais par un `update` SQL: un banc qui écrit à côté du produit mesure la
# base, pas le produit.
set_timezone() {
  local tz="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
    "$URL/rest/v1/profiles?id=eq.$USER_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"timezone\":\"$tz\"}")
  local got
  got=$(psql "select timezone from profiles where id='$USER_ID';")
  [ "$got" = "$tz" ] || { echo "${RED}   fuseau NON posé (HTTP $code, lu « $got »)${OFF}"; return 1; }
  echo "   fuseau → $tz · jour local $(psql "select (now() at time zone '$tz')::date;")"
}

# Le jour local courant, tel que le produit le compte.
local_day() { psql "select (now() at time zone (select timezone from profiles where id='$USER_ID'))::date;"; }

# ---------------------------------------------------------------------------
# LES CAS — l'attendu est ÉCRIT AVANT LE TIR, dans `$OUT/<cas>.attendu.json`
# ---------------------------------------------------------------------------
expect() { cat > "$OUT/$1.attendu.json"; }
# ⚠️ UNE LISTE, PAS UN SEUL CAS — et c'est le PLAFOND qui l'impose. Deux
# questions par jour local, deux jours locaux disponibles à un instant donné
# (les fuseaux vont de UTC−12 à UTC+12): le banc ne peut poser que QUATRE
# questions par compte et par passe. Les cas S et I en demandent une de plus,
# donc ils se rejouent sur un SECOND compte, ensemble:
#
#   BANC_EMAIL=qa-mois-20260904@keeltest.dev ./banc.sh <anon> "S I"
#
# Ensemble, parce que I balaie la question que S laisse ouverte: les séparer
# rendrait I INCONCLUSIVE par construction.
want() { [ -z "$ONLY" ] || [[ " $ONLY " == *" $1 "* ]]; }
head_of() { echo; echo "── $1 ─── $2"; }

# Les invariants que TOUS les cas portent, ajoutés à chaque attendu.
INVARIANTS='"securite_bouge": false, "allergies_bouge": false,
  "restrictions_bouge": false, "regimes_bouge": false, "ledger_skipped": 0'

BILAN_MEAL=""   # le plan sur lequel le bilan suivant portera

# ═══════════════════════════════════════════════════════════════════════════
# JOURNÉE 1 — Europe/Paris
# ═══════════════════════════════════════════════════════════════════════════

run_D2() {
  head_of D2 "« Mon fils n'aime pas le poisson. » — un seul garçon: AUCUNE question"
  expect D2 <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_kept": 0, "pref_kept": 1,
  "clar_created": 0, "q_count": 0,
  "n_count": 1, "n_text": {"contains": ["Tom", "poisson"]}, "n_view_buttons": 1,
  "d_items": 1, "added": {"contains": ["food.exclude", "member:$TOM", "poisson"]},
  "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/D2.before.json"
  gen D2 "Mon fils n'aime pas le poisson." 3
  BILAN_MEAL=$(last_meal)
  collect D2 "$SINCE"; judge D2 "$OUT/D2.attendu.json"
}

run_B3() {
  head_of B3 "« Zoé a bien mangé cette semaine. » — ni question ni annonce"
  expect B3 <<EOF
{ "http": 200,
  "clarify_kept": 0, "pref_kept": 0, "notes_kept": 0, "next_kept": 0,
  "skipped_meal_story": {"atLeast": 1},
  "clar_created": 0, "q_count": 0, "n_count": 0,
  "d_items": 0, "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/B3.before.json"
  local meal="$BILAN_MEAL"
  [ -n "$meal" ] || { echo "${YEL}   pas de plan à commenter${OFF}"; return; }
  feedback B3 "$meal" "$(body_of "$meal" "$(local_day)" "Zoé a bien mangé cette semaine.")"
  collect B3 "$SINCE"; judge B3 "$OUT/B3.attendu.json"
}

run_D4() {
  head_of D4 "« On n'aime pas trop la viande rouge. » — « on » = la table"
  expect D4 <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_kept": 0, "pref_kept": 1,
  "clar_created": 0, "q_count": 0,
  "n_count": 1, "n_text": {"absent": ["Léa", "Zoé", "Tom", "Marc", "Claire"]},
  "n_view_buttons": 1,
  "d_items": 1, "added": {"contains": ["food.exclude", "household", "viande"]},
  "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/D4.before.json"
  gen D4 "On n'aime pas trop la viande rouge." 3
  BILAN_MEAL=$(last_meal)
  collect D4 "$SINCE"; judge D4 "$OUT/D4.attendu.json"
}

run_B4() {
  head_of B4 "« Mon mari trouve qu'il y a trop de riz. » — un DEGRÉ: rien, et pas de question"
  expect B4 <<EOF
{ "http": 200,
  "clarify_kept": 0, "pref_kept": 0, "notes_kept": 0, "next_kept": 0,
  "skipped_degree": {"atLeast": 1}, "refused_unknown_member": 0,
  "clar_created": 0, "q_count": 0, "n_count": 0,
  "d_items": 0, "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/B4.before.json"
  local meal="$BILAN_MEAL"
  [ -n "$meal" ] || { echo "${YEL}   pas de plan à commenter${OFF}"; return; }
  feedback B4 "$meal" "$(body_of "$meal" "$(local_day)" "Mon mari trouve qu'il y a trop de riz.")"
  collect B4 "$SINCE"; judge B4 "$OUT/B4.attendu.json"
}

run_D3() {
  head_of D3 "« Les petites ne mangent pas de champignons. » — DEUX sujets, zéro question"
  expect D3 <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_kept": 0, "pref_kept": 2,
  "clar_created": 0, "q_count": 0,
  "n_count": 1, "n_text": {"contains": ["Léa", "Zoé"]},
  "d_items": 2,
  "added": {"contains": ["member:$LEA", "member:$ZOE", "champignon"], "absent": ["member:$TOM", "\"subject\": \"household\""]},
  "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/D3.before.json"
  gen D3 "Les petites ne mangent pas de champignons." 3
  BILAN_MEAL=$(last_meal)
  collect D3 "$SINCE"; judge D3 "$OUT/D3.attendu.json"
}

run_B5() {
  head_of B5 "« Les enfants ont détesté le {X}, sauf Tom. » — l'aliment est NOMMÉ: pas de question QUOI"
  local meal="$BILAN_MEAL"
  [ -n "$meal" ] || { echo "${YEL}   pas de plan à commenter${OFF}"; return; }
  # ⚠️ UN ALIMENT DU PLAN, ET PAS DÉJÀ EXCLU. Sinon la dédup rend `d_items: 0`
  # et le cas ressemble à un refus du classifieur.
  local food
  food=$(psql "
    select i->>'term' from student_generated_meals m,
      jsonb_array_elements(m.dishes) d, jsonb_array_elements(d->'ingredients') i
    where m.id='$meal' and i->>'term' is not null
      and lower(i->>'term') not in (
        select lower(x->>'text') from student_goals g,
          jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) x
        where g.user_id='$USER_ID')
    limit 1;" | tr -d '\n')
  if [ -z "$food" ]; then
    echo '{"_inconclusive":"aucun aliment du plan qui ne soit pas déjà exclu"}' > "$OUT/B5.obtenu.json"
    echo '{}' > "$OUT/B5.attendu.json"; judge B5 "$OUT/B5.attendu.json"; return
  fi
  echo "   aliment nommé: « $food »"
  expect B5 <<EOF
{ "http": 200,
  "clarify_kept": 0, "pref_kept": 2,
  "clar_created": 0, "q_count": 0,
  "n_count": 1, "n_text": {"contains": ["Léa", "Zoé"], "absent": ["Tom"]},
  "d_items": 2,
  "added": {"contains": ["member:$LEA", "member:$ZOE"], "absent": ["member:$TOM"]},
  $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/B5.before.json"
  feedback B5 "$meal" "$(body_of "$meal" "$(local_day)" "Les enfants ont détesté le $food, sauf Tom.")"
  collect B5 "$SINCE"; judge B5 "$OUT/B5.attendu.json"
}

# ── LE CŒUR DU CHANTIER: la question QUI, et le tap qui écrit ─────────────
run_D1() {
  head_of D1 "« Ma fille n'aime pas le poisson. » — DEUX filles: une question, puis un tap"
  expect D1 <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_proposed": 1, "clarify_kept": 1, "pref_kept": 0,
  "clarify_ask_reason": "asked",
  "clar_created": 1, "clar_about": {"set": ["who"]}, "clar_status": {"set": ["answered"]},
  "q_count": 1, "q_labels": {"set": ["Léa", "Zoé", "Personne de la liste"]},
  "q_payloads_ok": true,
  "tap_http": 200, "tap_handled": "keel_memory_clarification_answered",
  "n_count": 1, "n_text": {"contains": ["Léa", "poisson"], "absent": ["Zoé"]},
  "n_view_buttons": 1,
  "d_items": 1, "added": {"contains": ["food.exclude", "member:$LEA", "poisson"]},
  "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/D1.before.json"
  gen D1 "Ma fille n'aime pas le poisson." 3
  BILAN_MEAL=$(last_meal)

  # ⚠️ AUCUNE ANNONCE AVANT LE TAP. Une bulle « j'ai noté » ici voudrait dire
  # que le classifieur a rangé la ligne SANS attendre la réponse.
  local before_tap
  before_tap=$(notice_bubbles "$SINCE")
  local n_before
  n_before=$(python3 -c "import json,sys;print(len(json.loads(sys.argv[1])))" "$before_tap")
  echo "   annonces AVANT le tap: $n_before (attendu 0)"

  local q payload
  q=$(question_bubble "$SINCE")
  payload=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1])
if not q: print(''); raise SystemExit
for b in q.get('buttons') or []:
    if b.get('label') == 'Léa': print(b['payload']); raise SystemExit
print('')" "$q")
  if [ -z "$payload" ]; then
    echo "${YEL}   aucun bouton « Léa » — le tap n'a pas lieu${OFF}"
  else
    local bid
    bid=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['id'])" "$q")
    tap D1 "$bid" "$payload" "Léa"
  fi
  collect D1 "$SINCE"; judge D1 "$OUT/D1.attendu.json"
}

# ── LA QUESTION « QUOI », sur les aliments DU PLAN ────────────────────────
run_B1() {
  head_of B1 "« J'ai pas aimé la viande. » — la question QUOI, sur les viandes du plan"
  local meal="$BILAN_MEAL"
  # ── ON PRÉPARE LE TERRAIN, ET ON LE DIT ────────────────────────────────
  # ⚠️ AVANT LA GARDE « pas de plan », et c'est une faute déjà commise: placée
  # après, la préparation n'était jamais atteinte quand B1 tournait SEUL sur un
  # compte neuf — le cas sortait sur « pas de plan à commenter » sans jamais
  # créer celui dont il avait besoin.
  #
  # ⚠️ « J'ai pas aimé la viande » n'est AMBIGU que si le plan porte au moins
  # deux viandes — sinon le classifieur a raison de trancher, et le cas n'a
  # rien à mesurer. Un foyer nu rend spontanément des plans presque
  # végétariens: mesuré deux fois, deux INCONCLUSIVE. On demande donc un plan
  # qui en porte, par une note de brouillon ORDINAIRE.
  #
  # ⛔ CE N'EST PAS TRUQUER LE RÉSULTAT: cette note pose une envie (encart),
  # elle n'écrit aucune préférence et ne touche à aucune question. Le
  # `before` du cas est pris APRÈS elle, donc les deltas restent propres.
  if [ "${BANC_B1_SETUP:-1}" = "1" ]; then
    gen B1setup "On aimerait du poulet et du bœuf cette semaine." 3
    meal=$(last_meal); BILAN_MEAL="$meal"
  fi
  [ -n "$meal" ] || { echo "${YEL}   pas de plan à commenter${OFF}"; return; }
  # ⛔ LA PRÉCONDITION DU CAS, ET ELLE EST DURE: sans DEUX viandes au plan,
  # « la viande » n'est pas ambiguë et le classifieur a RAISON de trancher.
  # Un banc qui ne la vérifie pas compte un PASS pour un plan végétarien.
  # ⛔ LES PRÉPARATIONS SONT PLIÉES, ET C'EST LA CICATRICE MAISON QUE CE BANC A
  # RECOMMISE. Premier tir: « 0 viande » sur un plan dont un plat s'appelait
  # « Poulet rôti, riz, salade et haricots verts » — parce qu'en cuisine par
  # lots, le kilo de cuisses vit dans `preparations`, pas dans les ingrédients
  # du plat. Ne scanner que les plats manque très exactement la protéine.
  local meats
  meats=$(psql "
    select coalesce(string_agg(distinct t, ', '), '') from (
      select i->>'term' as t from student_generated_meals m,
        jsonb_array_elements(m.dishes) d, jsonb_array_elements(d->'ingredients') i
      where m.id='$meal'
      union all
      select i->>'term' from student_generated_meals m,
        jsonb_array_elements(m.preparations) pr, jsonb_array_elements(pr->'ingredients') i
      where m.id='$meal'
    ) x
    where t ~* '(boeuf|bœuf|veau|agneau|porc|poulet|dinde|canard|jambon|steak|lardon|saucisse|viande|escalope|merguez|chipolata|bacon|rôti|roti)';")
  local nmeats
  nmeats=$(python3 -c "
import sys
t=[x for x in sys.argv[1].split(', ') if x.strip()]
print(len(t))" "$meats")
  echo "   viandes du plan ($nmeats): $meats"
  if [ "$nmeats" -lt 2 ]; then
    python3 -c "
import json,sys
print(json.dumps({'_inconclusive':'le plan ne porte que %s viande(s) (%s): « la viande » n\'est pas ambiguë, le classifieur a raison de ne pas demander' % (sys.argv[1], sys.argv[2] or 'aucune')}))" \
      "$nmeats" "$meats" > "$OUT/B1.obtenu.json"
    echo '{}' > "$OUT/B1.attendu.json"; judge B1 "$OUT/B1.attendu.json"; return
  fi
  expect B1 <<EOF
{ "http": 200,
  "clarify_proposed": 1, "clarify_kept": 1, "clarify_ask_reason": "asked",
  "clar_created": 1, "clar_about": {"set": ["what"]}, "clar_status": {"set": ["answered"]},
  "q_count": 1, "q_payloads_ok": true,
  "tap_http": 200, "tap_handled": "keel_memory_clarification_answered",
  "n_count": 1, "n_view_buttons": 1,
  "d_items": 1, "added": {"contains": ["food.exclude", "household"]},
  "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/B1.before.json"
  feedback B1 "$meal" "$(body_of "$meal" "$(local_day)" "J'ai pas aimé la viande.")"

  local q
  q=$(question_bubble "$SINCE")
  # ⛔ LE VERDICT SUR LES BOUTONS EST ICI, PAS DANS LE JUGE: il faut la liste
  # des viandes du plan pour dire qu'un poisson proposé est un ÉCHEC.
  python3 - "$q" "$meats" <<'PY'
import json, re, sys
q = json.loads(sys.argv[1]) if sys.argv[1].strip() not in ("", "null") else None
meats = {m.strip().lower() for m in sys.argv[2].split(", ") if m.strip()}
if not q:
    print("   ⚠️ aucune bulle de question"); raise SystemExit
labels = [b.get("label", "") for b in q.get("buttons") or []]
picks = [l for l in labels if l not in ("Aucun de ceux-là", "Personne de la liste")]
bad = [l for l in picks if l.lower() not in meats]
print(f"   boutons: {labels}")
print(f"   ✓ tous dans les viandes du plan" if not bad
      else f"   ✗ HORS des viandes du plan: {bad} — le modèle a proposé ce que le plan ne montre pas comme viande")
PY
  local payload bid
  payload=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1]) if sys.argv[1].strip() not in ('','null') else None
if not q: print(''); raise SystemExit
for b in q.get('buttons') or []:
    if b.get('label') not in ('Aucun de ceux-là','Personne de la liste'):
        print(b['payload']); raise SystemExit
print('')" "$q")
  if [ -n "$payload" ]; then
    bid=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['id'])" "$q")
    local label
    label=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1])
for b in q.get('buttons') or []:
    if b.get('payload')==sys.argv[2]: print(b.get('label','')); raise SystemExit
print('')" "$q" "$payload")
    tap B1 "$bid" "$payload" "$label"
  else
    echo "${YEL}   aucun bouton d'aliment — le tap n'a pas lieu${OFF}"
  fi
  collect B1 "$SINCE"; judge B1 "$OUT/B1.attendu.json"
}

# ── LE PLAFOND: la troisième question du jour ne part PAS ─────────────────
run_P() {
  head_of P "la 3ᵉ question du même jour local — le plafond mord, et il se VOIT"
  expect P <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_kept": 1, "clarify_ask_reason": "daily_cap",
  "clar_created": 0, "q_count": 0, "n_count": 0,
  "d_items": 0, "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/P.before.json"
  # ⛔ LA PRÉCONDITION DE CE CAS EST QUE LE PLAFOND SOIT DÉJÀ ATTEINT, et elle
  # dépend des cas d'avant. Mesuré: une fois D3 corrigé, il ne pose plus de
  # question — le compte du jour est tombé à 1, et P mesurait alors une question
  # NORMALE en croyant mesurer un refus. Un FAIL aurait accusé le plafond de ne
  # pas mordre, alors qu'on ne lui avait rien demandé.
  local asked
  asked=$(psql "select count(*) from meal_precision_questions where user_id='$USER_ID' and ask_kind='memory_clarification' and local_date='$(local_day)';" | tr -d ' ')
  echo "   questions déjà posées aujourd'hui ($(local_day)): $asked / $CAP"
  if [ "${asked:-0}" -lt "$CAP" ]; then
    python3 -c "
import json,sys
print(json.dumps({'_inconclusive':
  'le plafond n\'est pas atteint (%s/%s posées aujourd\'hui): ce cas mesure un '
  'REFUS, et il n\'y a rien à refuser. Les cas d\'avant en ont posé moins que '
  'prévu.' % (sys.argv[1], sys.argv[2])}))" "$asked" "$CAP" > "$OUT/P.obtenu.json"
    echo '{}' > "$OUT/P.attendu.json"; judge P "$OUT/P.attendu.json"; return
  fi
  gen P "Ma fille adore les pâtes." 3
  BILAN_MEAL=$(last_meal)
  collect P "$SINCE"; judge P "$OUT/P.attendu.json"
}

# ═══════════════════════════════════════════════════════════════════════════
# JOURNÉE 2 — un autre fuseau, donc un autre jour local, donc un autre plafond
# ═══════════════════════════════════════════════════════════════════════════

run_D5() {
  head_of D5 "« Elle a horreur des épinards. » — « elle » ≠ celle qui tape; ÉCHAPPATOIRE"
  expect D5 <<EOF
{ "http": 200, "plans_delta": 1,
  "clarify_proposed": 1, "clarify_kept": 1, "clarify_ask_reason": "asked",
  "clar_created": 1, "clar_about": {"set": ["who"]}, "clar_status": {"set": ["declined"]},
  "q_count": 1, "q_labels": {"set": ["Léa", "Zoé", "Personne de la liste"]},
  "tap_http": 200, "tap_handled": "keel_memory_clarification_declined",
  "n_count": 0,
  "d_items": 0, "d_memo": 0, "d_encart": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/D5.before.json"
  gen D5 "Elle a horreur des épinards." 3
  BILAN_MEAL=$(last_meal)
  local q payload bid
  q=$(question_bubble "$SINCE")
  payload=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1]) if sys.argv[1].strip() not in ('','null') else None
if not q: print(''); raise SystemExit
for b in q.get('buttons') or []:
    if b.get('label') in ('Personne de la liste','Aucun de ceux-là'):
        print(b['payload']); raise SystemExit
print('')" "$q")
  if [ -n "$payload" ]; then
    bid=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['id'])" "$q")
    tap D5 "$bid" "$payload" "Personne de la liste"
  else
    echo "${YEL}   aucune échappatoire à taper${OFF}"
  fi
  collect D5 "$SINCE"; judge D5 "$OUT/D5.attendu.json"
}

run_B2() {
  head_of B2 "« Le plat de {jour} soir, plus jamais. » — le classifieur A le plan: pas de question"
  local meal="$BILAN_MEAL"
  [ -n "$meal" ] || { echo "${YEL}   pas de plan à commenter${OFF}"; return; }
  # La précondition: UN SEUL dîner ce soir-là, sinon « le plat de mardi soir »
  # est légitimement ambigu et le produit aurait raison de demander.
  local day dinners
  read -r day dinners <<< "$(psql "
    select d->>'day' || ' ' || count(*) from student_generated_meals m,
      jsonb_array_elements(m.dishes) d
    where m.id='$meal' and d->>'slot' = 'dinner'
    group by d->>'day' having count(*) = 1 order by d->>'day' limit 1;" | tr '|' ' ')"
  if [ -z "${day:-}" ]; then
    echo '{"_inconclusive":"aucun jour du plan ne porte EXACTEMENT un dîner"}' > "$OUT/B2.obtenu.json"
    echo '{}' > "$OUT/B2.attendu.json"; judge B2 "$OUT/B2.attendu.json"; return
  fi
  local fr
  fr=$(python3 -c "
import sys
print({'mon':'lundi','tue':'mardi','wed':'mercredi','thu':'jeudi','fri':'vendredi',
       'sat':'samedi','sun':'dimanche'}.get(sys.argv[1].lower(), sys.argv[1]))" "$day")
  echo "   jour visé: $day → « $fr » (1 dîner)"
  # ⟳ ATTENDU CORRIGÉ APRÈS LE PREMIER RUN — et c'est le DOC qui avait tort.
  # §8.3 disait « aucune question, le classifieur a le plan ». Il ne l'a pas: il
  # reçoit une liste PLATE de termes, SANS JOUR NI MOMENT. « Vendredi soir » lui
  # est réellement irrésolvable, et demander est la bonne réponse. Ce qui était
  # cassé, c'était le CONTENU des options — des ingrédients pour une phrase qui
  # désigne un plat. Le cas mesure donc désormais la QUALITÉ de la question.
  expect B2 <<EOF
{ "http": 200,
  "clarify_proposed": 1, "clarify_kept": 1, "clarify_ask_reason": "asked",
  "clar_created": 1, "clar_about": {"set": ["what"]},
  "q_count": 1, "q_payloads_ok": true,
  "n_count": 0,
  "d_items": 0, "d_memo": 0, $INVARIANTS }
EOF
  SINCE=$(now_iso); snapshot > "$OUT/B2.before.json"
  feedback B2 "$meal" "$(body_of "$meal" "$(local_day)" "Le plat de $fr soir, plus jamais.")"
  # ⛔ LE VERDICT SUR LE CONTENU DES BOUTONS EST ICI, PAS DANS LE JUGE: il faut
  # la liste des TITRES DE PLATS du plan pour dire qu'un ingrédient proposé est
  # un échec — et c'est très exactement le défaut mesuré au premier run.
  local titles
  titles=$(psql "select coalesce(string_agg(distinct d->>'title', ' ⏐ '), '')
                 from student_generated_meals m, jsonb_array_elements(m.dishes) d
                 where m.id='$meal';")
  python3 - "$(question_bubble "$SINCE")" "$titles" <<'PY'
import json, sys
raw = sys.argv[1].strip()
q = json.loads(raw) if raw not in ("", "null") else None
titles = {t.strip().lower() for t in sys.argv[2].split(" ⏐ ") if t.strip()}
if not q:
    print("   ⚠️ aucune bulle de question"); raise SystemExit
labels = [b.get("label", "") for b in q.get("buttons") or []]
picks = [l for l in labels if l not in ("Aucun de ceux-là", "Personne de la liste")]
bad = [l for l in picks if l.lower() not in titles]
print(f"   boutons: {picks}")
print("   ✓ tous sont des PLATS du plan" if picks and not bad
      else f"   ✗ PAS des plats du plan: {bad} — une phrase qui désigne un plat "
           "ne peut pas se répondre par un ingrédient")
PY
  collect B2 "$SINCE"; judge B2 "$OUT/B2.attendu.json"
}

# ── S: LE TAP PÉRIMÉ ──────────────────────────────────────────────────────
#
# ⚠️ LE SUPERSEDER N'EST PAS UNE SECONDE CLARIFICATION, ET C'EST LE PLAFOND
# QUI L'IMPOSE: deux par jour local, D5 en a pris une. On utilise donc une
# VRAIE bulle du produit — l'invitation au bilan de `keel-proactive-v1` — qui
# porte des boutons et périme donc la question.
#
# ⛔ SI ELLE NE PART PAS, ON NE TAPE PAS. Taper quand même mesurerait le
# chemin nominal en croyant mesurer le chemin périmé, et fermerait la ligne
# dont le cas I a besoin. INCONCLUSIVE est le seul verdict honnête.
run_S() {
  head_of S "un tap sur une question DÉPASSÉE par une bulle plus récente"
  SINCE=$(now_iso); snapshot > "$OUT/S.before.json"
  gen S "Ma fille ne veut plus de brocolis." 3
  BILAN_MEAL=$(last_meal)
  local q bid
  q=$(question_bubble "$SINCE")
  if [ "$(printf '%s' "$q" | tr -d ' ')" = "null" ] || [ -z "$q" ]; then
    echo '{"_inconclusive":"aucune question ouverte à périmer (le classifieur n’a pas hésité, ou le plafond a mordu)"}' > "$OUT/S.obtenu.json"
    echo '{}' > "$OUT/S.attendu.json"; judge S "$OUT/S.attendu.json"; return
  fi
  bid=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['id'])" "$q")
  echo "   question ouverte: $bid"

  # ── LE SUPERSEDER: une bulle du produit, avec des boutons ──────────────
  local BEFORE_SUP
  BEFORE_SUP=$(now_iso)
  curl -s -o "$OUT/S.proactive.json" -w "   proactive · HTTP %{http_code}\n" -X POST \
    "$URL/functions/v1/keel-proactive-v1" \
    -H "apikey: $ANON" -H "x-internal-secret: $SECRET" \
    -H "Content-Type: application/json" -d '{}' --max-time 300
  local SUP
  SUP=$(psql "select coalesce(json_agg(json_build_object('id',id,'purpose',metadata->>'purpose'))::text,'[]')
              from chat_messages where user_id='$USER_ID' and role='assistant' and scope='app'
                and created_at > '$BEFORE_SUP'
                and jsonb_array_length(coalesce(metadata->'buttons','[]'::jsonb)) > 0
                and not exists (
                  select 1 from jsonb_array_elements(coalesce(metadata->'buttons','[]'::jsonb)) b
                  where b->>'payload' like 'KEEL_VIEW_%');")
  local NSUP
  NSUP=$(python3 -c "import json,sys;print(len(json.loads(sys.argv[1])))" "$SUP")
  echo "   bulles à boutons depuis: $NSUP — $SUP"
  if [ "$NSUP" -lt 1 ]; then
    python3 -c "
import json
print(json.dumps({'_inconclusive':'keel-proactive-v1 n’a produit aucune bulle À BOUTONS: rien ne périme la question, et taper mesurerait le chemin nominal'}))" \
      > "$OUT/S.obtenu.json"
    echo '{}' > "$OUT/S.attendu.json"; judge S "$OUT/S.attendu.json"
    echo "   (la question reste ouverte — c'est elle que le cas I balaiera)"
    return
  fi

  expect S <<EOF
{ "tap_http": 200, "tap_handled": "keel_disarmed_button_tap",
  "d_items": 0, "d_memo": 0, "d_encart": 0, "n_count": 0, $INVARIANTS }
EOF
  local payload
  payload=$(python3 -c "
import json,sys
q=json.loads(sys.argv[1])
for b in q.get('buttons') or []:
    if b.get('label') not in ('Personne de la liste','Aucun de ceux-là'):
        print(b['payload']); raise SystemExit
print('')" "$q")
  local SINCE_TAP
  SINCE_TAP=$(now_iso); snapshot > "$OUT/S.before.json"
  tap S "$bid" "$payload" "Léa"
  BANC_NEEDS_TRACE=0 collect S "$SINCE_TAP"; judge S "$OUT/S.attendu.json"
  echo "   statut de la ligne: $(psql "select status from memory_clarifications where user_id='$USER_ID' order by created_at desc limit 1;")"
}

# ── I: LE SILENCE, ET SON COMPTEUR ────────────────────────────────────────
run_I() {
  head_of I "une question jamais tapée — la balayeuse la ferme, et la COMPTE"
  local open_before
  open_before=$(psql "select count(*) from memory_clarifications where user_id='$USER_ID' and status='open';" | tr -d ' ')
  echo "   questions ouvertes avant: $open_before"
  if [ "$open_before" -lt 1 ]; then
    echo '{"_inconclusive":"aucune question ouverte à balayer — les cas précédents les ont toutes fermées"}' > "$OUT/I.obtenu.json"
    echo '{}' > "$OUT/I.attendu.json"; judge I "$OUT/I.attendu.json"; return
  fi
  # ⛔ EN ISO-8601 AVEC UN SEUL FUSEAU, ET C'EST UNE FAUTE DÉJÀ COMMISE ICI.
  # `now()::text` de Postgres rend « 2026-09-06 01:23:45.678+00 » — avec un
  # DÉCALAGE. Remplacer l'espace par un « T » et coller un « Z » donnait
  # « …+00Z », que `new Date()` refuse; le pouls retombait alors sur l'heure
  # RÉELLE, ne balayait rien, et rendait quand même **HTTP 200**. Le cas
  # échouait donc en accusant la balayeuse de ne pas balayer.
  local FUTURE
  FUTURE=$(psql "select to_char((now() + interval '49 hours') at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');")
  echo "   horloge simulée: $FUTURE"
  : > "$OUT/I.pulse.log"
  docker logs --since 0m -f supabase_edge_runtime_Sophia_2 > "$OUT/I.pulse.log" 2>&1 &
  local LP=$!
  curl -s -o "$OUT/I.pulse.json" -w "   pouls · HTTP %{http_code}\n" -X POST \
    "$URL/functions/v1/keel-daily-pulse-v1" \
    -H "apikey: $ANON" -H "x-internal-secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "$(pulse_body "$FUTURE")" --max-time 300
  sleep 3; kill $LP 2>/dev/null; wait $LP 2>/dev/null
  # ⛔ LA LIGNE DE JOURNAL EST LA PREUVE QUE LA BALAYEUSE A TOURNÉ. Sans elle,
  # « rien n'a expiré » et « la balayeuse n'a jamais été appelée » se
  # ressemblent trait pour trait — et le pouls rend 200 dans les deux cas.
  local SWEPT
  SWEPT=$(grep -o '"tag":"keel.memory_clarification"[^}]*' "$OUT/I.pulse.log" | grep swept | tail -1)
  if [ -n "$SWEPT" ]; then echo "   journal: {$SWEPT}"; else
    echo "${YEL}   ⚠️ aucune ligne « swept » dans le journal du pouls${OFF}"; fi
  local open_after expired_after
  open_after=$(psql "select count(*) from memory_clarifications where user_id='$USER_ID' and status='open';" | tr -d ' ')
  expired_after=$(psql "select count(*) from memory_clarifications where user_id='$USER_ID' and status='expired';" | tr -d ' ')
  python3 -c "
import json,sys
print(json.dumps({'open_after': int(sys.argv[1]), 'expired_after_at_least_one': int(sys.argv[2])>=1}))" \
    "$open_after" "$expired_after" > "$OUT/I.obtenu.json"
  expect I <<'EOF'
{ "open_after": 0, "expired_after_at_least_one": true }
EOF
  judge I "$OUT/I.attendu.json"
}

# ── V: LA SONDE DE LIVRAISON ──────────────────────────────────────────────
#
# ⚠️ ENREGISTRÉE, JAMAIS JUGÉE. `delivery_reason = reply` est la seule mesure
# possible du plafond: dès le premier tap, la conversation est « active » dix
# heures et tout passe pour une autre raison. On la LIT, on ne la note pas.
run_V() {
  head_of V "la raison de livraison de la toute première annonce"
  psql "select metadata->>'purpose' || ' · ' || status || ' · ' || coalesce(metadata->>'delivery_reason','?')
        from outbound_messages
        where user_id='$USER_ID' and metadata->>'purpose' in ('keel_memory_written','keel_memory_clarification')
        order by created_at limit 6;" | sed 's/^/   /'
}

# ---------------------------------------------------------------------------
# LE DÉROULÉ
# ---------------------------------------------------------------------------
# ── LE SECRET DES FONCTIONS INTERNES ──────────────────────────────────────
#
# ⛔ CE N'EST **PAS** LA `Secret Key` DE `supabase status`. Mesuré: elle rend
# **403** sur `keel-daily-pulse-v1` comme sur `keel-proactive-v1`, et les cas S
# et I sont morts dessus. `ensureInternalRequest` ne retombe sur `SECRET_KEY`
# que si `INTERNAL_FUNCTION_SECRET` est ABSENT de l'environnement — or
# `supabase functions serve supabase/.env` le charge. C'est donc ce fichier-là
# qui fait foi, et le banc le lit lui-même plutôt que d'attendre qu'on devine.
SECRET="${BANC_INTERNAL_SECRET:-}"
if [ -z "$SECRET" ] && [ -f supabase/.env ]; then
  SECRET=$(grep "^INTERNAL_FUNCTION_SECRET=" supabase/.env | head -1 | cut -d= -f2- | tr -d "\"' \r")
  [ -n "$SECRET" ] && echo "   ✓ secret interne lu dans supabase/.env"
fi
if [ -n "$SECRET" ]; then
  PROBE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$URL/functions/v1/keel-daily-pulse-v1" -H "apikey: $ANON" \
    -H "x-internal-secret: $SECRET" -H "Content-Type: application/json" \
    -d '{"dry_run":true}' --max-time 120)
  # ⚠️ SONDÉ, PAS SUPPOSÉ. Un 403 silencieux fait rendre INCONCLUSIVE aux cas S
  # et I pour une raison qui n'a rien à voir avec eux — mesuré.
  if [ "$PROBE" != "200" ]; then
    echo "${YEL}   ⚠️ le secret interne est REFUSÉ (HTTP $PROBE): S et I seront INCONCLUSIVE${OFF}"
    SECRET=""
  else
    echo "   ✓ secret interne accepté par le pouls"
  fi
else
  echo "${YEL}⚠️ aucun secret interne: les cas S et I seront INCONCLUSIVE${OFF}"
fi

echo
echo "════════ BANC DES CLARIFICATIONS · $EMAIL ════════"
echo "sortie: $OUT"
# ⚠️ L'ARBRE EST PARTAGÉ PAR PLUSIEURS SESSIONS, et chaque écriture sous
# `supabase/functions/` fait redémarrer `functions serve`. Un redémarrage EN
# COURS de génération produit un 502 qui ressemble à une panne du produit. On
# note l'instant de départ pour pouvoir le DIRE dans le rapport, plutôt que
# d'attribuer au produit ce qui vient du poste.
RT_START="$RT_AT"

# ⚠️ LE JETON EXPIRE. Une heure de banc dépasse la durée d'un JWT: on relogue
# entre les journées plutôt que de lire un 401 comme un refus du produit.
# ⚠️ L'ORDRE N'EST PAS COSMÉTIQUE, ET LE PREMIER JET S'EST TROMPÉ. B1 demande
# un plan portant AU MOINS DEUX VIANDES; or D4 (« on n'aime pas trop la viande
# rouge ») et D2 (« pas de poisson ») s'accumulent, et le générateur avait rendu
# un plan ENTIÈREMENT végétarien — B1 devenait INCONCLUSIVE par la faute des cas
# d'avant, pas du produit. B1 passe donc AVANT les exclusions qui vident le plan.
for c in D2 B1 B3 D4 B4 D3 B5 D1 P; do
  want "$c" || continue
  JWT=$(login)
  "run_$c"
done

if want D5 || want B2; then
  echo
  echo "── BASCULE DE JOURNÉE ────────────────────────────────────"
  JWT=$(login)
  DAY1=$(local_day)
  for tz in Etc/GMT+12 Etc/GMT-12; do
    set_timezone "$tz" || continue
    [ "$(local_day)" != "$DAY1" ] && break
  done
  if [ "$(local_day)" = "$DAY1" ]; then
    echo "${YEL}   aucun fuseau ne rend un autre jour local que $DAY1 —${OFF}"
    echo "${YEL}   D5 et S partagent donc le plafond de la journée 1.${OFF}"
  fi
fi

for c in D5 B2 S I; do
  want "$c" || continue
  JWT=$(login)
  "run_$c"
done

want V && run_V

# ⛔ LE FUSEAU EST REMIS. Le laisser décalé ferait mentir tous les bancs
# suivants sur le même compte — et le décalage est invisible en base.
if [ -z "$ONLY" ] || [ "$ONLY" = "D5" ] || [ "$ONLY" = "S" ] || [ "$ONLY" = "B2" ]; then
  JWT=$(login); set_timezone "Europe/Paris" || true
fi

echo
echo "════════ COMPTE FINAL ════════"
for v in ${VERDICTS[@]+"${VERDICTS[@]}"}; do
  case "$v" in
    *PASS) echo "   ${GREEN}$v${OFF}";;
    *FAIL) echo "   ${RED}$v${OFF}";;
    *)     echo "   ${YEL}$v${OFF}";;
  esac
done
TOTAL=$((PASS + FAIL + INCONC))
echo
echo "   PASS $PASS/$TOTAL · FAIL $FAIL · INCONCLUSIVE $INCONC"
echo "   ⚠️ un INCONCLUSIVE n'est PAS un PASS: sa précondition est nommée ci-dessus."
RT_END=$(docker inspect -f '{{.State.StartedAt}}' supabase_edge_runtime_Sophia_2 2>/dev/null)
if [ "$RT_END" != "$RT_START" ]; then
  echo
  echo "${YEL}   ⚠️ LE RUNTIME A REDÉMARRÉ PENDANT LE BANC${OFF}"
  echo "${YEL}      $RT_START → $RT_END${OFF}"
  echo "${YEL}      Une session voisine a écrit sous supabase/functions/. Les cas${OFF}"
  echo "${YEL}      tombés en 502/000 sont à relire avant d'être imputés au produit.${OFF}"
fi
echo
echo "   les questions de ce compte:"
psql "select '   ' || about || ' · ' || status || ' · ' || source || ' · ' || (pending->>'text')
      from memory_clarifications where user_id='$USER_ID' order by created_at;"
[ "$FAIL" -eq 0 ] || exit 1
