#!/usr/bin/env bash
# ── LA NOTE DE RYTHME, TIRÉE EN RÉEL ──────────────────────────────────────
#
# ⛔ UNE CONSIGNE DE PROMPT RÉGRESSE EN RÉEL. C'est la loi que
# `household_restriction_lock.ts` a tirée d'un run, et le défaut que ce lot
# ferme en est la seconde démonstration. Un test vert ne prouve donc RIEN ici:
# il faut envoyer la phrase et regarder ce que le classifieur en fait.
#
#   bash 60-note.sh "<la note>"
set -uo pipefail
source "$(dirname "$0")/00-env.sh"
NOTE="${1:?donne la note}"
EMAIL="$DUO_EMAIL"
U="$(psqlq -c "select id from auth.users where email='$EMAIL'")"

echo "══ note : « $NOTE »"
echo "── état AVANT ──"
psqlq -c "select coalesce(string_agg(kind||'/'||coalesce(allergen_ref,'?')||'/'||severity||'/'||status,', '),'(aucune contrainte dure)')
  from student_safety_constraints where user_id='$U';"
psqlq -c "select coalesce(string_agg(i->>'kind'||':'||(i->>'text'),' | '),'(aucun retained_item)')
  from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) i
 where g.user_id='$U';"

TOK="$(login "$EMAIL")"; [ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
CP0="$(codeprint generate-household-meal-v1)"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%S)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$CAMP_DIR/note-${STAMP}.json"
echo "   empreinte AVANT=$CP0 · début $(date -u +%H:%M:%SZ)"

# ⛔ `replace_current`, ET SURTOUT PAS `draft` — DÉFAUT D'INSTRUMENT PAYÉ ICI.
# Ma première version tirait en `intent: draft` et rendait « aucune contrainte
# écrite » sur les DEUX cas: celui qui doit écrire comme celui qui ne doit pas.
# Motif: sur un brouillon, la fonction REND (l. 8569) avant le site d'appel du
# classifieur (l. 9243) — la note est lue, rien n'est jamais rangé. Le banc
# mesurait donc un silence de chemin, pas un verdict de consigne.
#
# ⚠️ C'EST LA CONTRE-ÉPREUVE QUI L'A DIT, pas la relecture: « une garde a besoin
# d'un cas qui PASSE ». Sans le cas légitime, mon « ✅ aucune contrainte » aurait
# été publié comme une preuve.
LAST="$(psqlq -c "select id from student_generated_meals where user_id='$U' and plan_kind='household' and retired_at is null order by created_at desc limit 1")"
# ⚠️ ET `prepare_next` QUAND AUCUN PLAN NE VIT. `replace_current` EXIGE
# `replaces` et rend 400 sans lui — ma fixture n'a que des brouillons derrière
# elle, donc aucune ligne vivante à remplacer. Les deux intentions écrivent, et
# c'est tout ce que ce banc demande.
if [ -n "$LAST" ]; then INTENT=replace_current; else INTENT=prepare_next; fi
echo "   intent=$INTENT replaces=${LAST:-∅}"
BODY="$(python3 -c "
import json,sys
intent, last = sys.argv[2], sys.argv[3]
print(json.dumps({'operation':'compose','window':{'kind':'days','count':3},
 'intent': intent, 'replaces': (last or None),
 'context':None,'cooking_shape':None,'preferences':None,
 'draft_note': sys.argv[1]}))" "$NOTE" "$INTENT" "$LAST")"
R="$(curl -s -o "$OUT" -w '%{http_code} %{time_total}' --max-time 900 \
  -X POST "$API_URL/functions/v1/generate-household-meal-v1" \
  -H "apikey: $ANON" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$BODY")"
CP1="$(codeprint generate-household-meal-v1)"
echo "   http=${R%% *} · ${R##* } s · empreinte APRÈS=$CP1 $([ "$CP0" = "$CP1" ] && echo '✓' || echo '⛔ LE CODE A CHANGÉ')"

echo "── état APRÈS ──"
echo -n "   contraintes dures : "
psqlq -c "select coalesce(string_agg(kind||'/'||coalesce(allergen_ref,'?')||'/'||severity||'/'||status,', '),'(AUCUNE ✅)')
  from student_safety_constraints where user_id='$U';"
echo -n "   retained_items    : "
psqlq -c "select coalesce(string_agg(i->>'kind'||':'||(i->>'text'),' | '),'(aucun)')
  from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) i
 where g.user_id='$U';"
# ⚠️ LE JOURNAL EST INDICATIF, LA BASE EST L'AUTORITÉ — cicatrice payée ici.
# `docker logs --since` a laissé passer les lignes de tirs PRÉCÉDENTS, et j'ai
# lu « written: 1 » sur un run qui n'avait rien écrit. Les deux lectures d'état
# ci-dessus (AVANT / APRÈS, en SQL) sont ce qui tranche; ce bloc-ci ne sert qu'à
# voir la forme de ce que le classifieur a proposé.
echo "── indicatif: le journal (peut porter des lignes de tirs précédents) ──"
docker logs supabase_edge_runtime_Sophia_2 --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' | grep -F "$U" \
  | grep -iE "draft_note|safety" | head -5
