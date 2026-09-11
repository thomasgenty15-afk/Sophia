#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LES QUATRE FOYERS DE LA CAMPAGNE 9 POINTS — 2026-09-04
# ══════════════════════════════════════════════════════════════════════════
#
#   bash 10-fixtures.sh solo|duo|quatre|cinq|all
#
# ⛔ CHAQUE CHAMP EST POSÉ PAR LA MÊME PORTE QUE L'ÉCRAN. Les RPC de foyer sont
# celles de `SetupPage.tsx :: addMouth`, dans SON ordre (add_member → corps →
# date → objectif → régime → allergies). Une fixture qui diverge du produit
# mesure autre chose.
#
# ⛔ LE DÉGOÛT N'EST PAS UNE RÈGLE DE MAISON. `keel_household_add_restriction`
# écrit dans `household_food_restrictions` — le VERROU domestique, qui REFUSE le
# plat et censure le « pourquoi ». Un goût (« Marc n'aime pas les champignons »)
# est un `food.exclude` dans `retained_items`, écrit par la porte
# `keel_write_retained_items` avec le JETON DE LA PERSONNE (elle lit
# `auth.uid()`, elle est morte sous service_role). C'est ce que fait
# `addWrittenFoodExclusions` côté écran.
#
# ⚠️ SEULES ÉCRITURES SQL DIRECTES: `profiles`, `student_body_measures`,
# `student_goals`, `coach_clients` — les quatre que l'entonnoir pose et
# qu'aucune RPC n'expose. Tout le reste passe par les RPC.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

WHICH="${1:-all}"

ensure_account() { # $1=email $2=nom complet -> exporte TOK et U
  TOK="$(login "$1")"
  if [ -z "$TOK" ]; then
    curl -s -X POST "$API_URL/auth/v1/signup" \
      -H "apikey: $ANON" -H 'content-type: application/json' \
      -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\",\"data\":{\"full_name\":\"$2\"}}" >/dev/null
    psqlq -c "update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()),
      confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''),
      email_change_token_new=coalesce(email_change_token_new,''), email_change=coalesce(email_change,''),
      email_change_token_current=coalesce(email_change_token_current,''),
      phone_change=coalesce(phone_change,''), phone_change_token=coalesce(phone_change_token,''),
      reauthentication_token=coalesce(reauthentication_token,'')
      where email='$1';" >/dev/null
    TOK="$(login "$1")"
  fi
  [ -z "$TOK" ] && { echo "⛔ pas de jeton pour $1"; exit 1; }
  U="$(psqlq -c "select id from auth.users where email='$1'")"
  [ -z "$U" ] && { echo "⛔ pas d'utilisateur pour $1"; exit 1; }
}

rpc() { # $1=nom $2=json
  curl -s -X POST "$API_URL/rest/v1/rpc/$1" -H "apikey: $ANON" \
    -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$2"
}
# ⛔ UNE RPC QUI REND {ok:false} N'EST PAS UNE RÉUSSITE — elles ne LÈVENT pas.
rpcx() {
  local out; out="$(rpc "$1" "$2")"
  case "$out" in *'"ok": false'*|*'"ok":false'*) echo "⛔ $1 → $out"; exit 1;; esac
  printf '%s' "$out"
}
mid_of() { rpc keel_household_roster '{}' \
  | python3 -c "import sys,json;print(next((r['member_id'] for r in json.load(sys.stdin) if r['first_name']=='$1'),''))"; }
add_member() { # prénom date objectif(json)
  rpcx keel_household_add_member "{\"p_first_name\":\"$1\",\"p_birth_date\":\"$2\",\"p_goal\":$3}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["member_id"])'; }
body() { # member h w gender activity day sport appetite
  rpcx keel_household_set_member_body "{\"p_member\":\"$1\",\"p_height_cm\":$2,\"p_weight_kg\":$3,\"p_gender\":\"$4\",\"p_activity_level\":\"$5\",\"p_day_activity\":\"$6\",\"p_sport_frequency\":\"$7\",\"p_activity_axes_asked\":true,\"p_takes_dessert\":null,\"p_takes_cheese\":null,\"p_takes_bread\":null,\"p_meal_structure_asked\":false,\"p_appetite\":\"$8\",\"p_appetite_asked\":true}" >/dev/null; }

# ── LE GOÛT, PAR LA PORTE DE L'ÉCRAN ──────────────────────────────────────
# Forme recopiée de `retainedItemToJson` (retainedItems.ts:791): dix clés, et
# `quote`/`value` écrits MÊME à null — « pas de citation » et « version qui ne
# connaissait pas le champ » se relisent pareil et ne se déboguent pas pareil.
dislike() { # $1=member_id  $2..=aliments
  local member="$1"; shift
  local today; today="$(psqlq -c "select to_char(current_date,'YYYY-MM-DD')")"
  local cur; cur="$(psqlq -c "select coalesce((practical_constraints->'retained_items')::text,'null') from student_goals where user_id='$U'")"
  local items
  items="$(python3 - "$member" "$today" "$cur" "$@" <<'PY'
import json,sys
member,today,cur = sys.argv[1],sys.argv[2],sys.argv[3]
foods = sys.argv[4:]
base = json.loads(cur) if cur and cur != 'null' else []
if not isinstance(base, list): base = []
seen = {i.get("text","").strip().lower() for i in base
        if i.get("kind")=="food.exclude" and i.get("subject")==f"member:{member}"}
for f in foods:
    if f.strip().lower() in seen: continue
    base.append({"kind":"food.exclude","scope":"durable","subject":f"member:{member}",
                 "text":f,"value":None,"source":"written","at":today,
                 "item":"","confidence":None,"quote":None})
print(json.dumps({"expected": json.loads(cur) if cur and cur!='null' else None, "items": base}))
PY
)"
  local expected new
  expected="$(printf '%s' "$items" | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin)["expected"]))')"
  new="$(printf '%s' "$items" | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin)["items"]))')"
  rpcx keel_write_retained_items "{\"p_expected\":$expected,\"p_items\":$new,\"p_expected_next\":null,\"p_next\":null,\"p_expected_notes\":null,\"p_notes\":null,\"p_origins\":null}" >/dev/null
}

# ── LE SOCLE DU MAÎTRE ────────────────────────────────────────────────────
# `practical_constraints`: le rythme, les DEUX réponses de P2 (style, courses)
# et l'inventaire. `diet_asked`/`allergy_check` disent que l'entonnoir a POSÉ
# la question — sans eux, l'écran la reposerait et le moteur lirait un silence.
socle() { # $1=nom $2=naissance $3=sexe $4=taille $5=activité $6=poids $7=objectif $8=style $9=courses ${10}=equipement_json ${11}=rythme_json
  psqlq <<SQL
update profiles set full_name='$1', birth_date='$2', gender='$3', height_cm=$4,
  activity_level='$5', locale='fr-FR', country='FR', timezone='Europe/Paris',
  onboarding_completed=true, access_tier='student',
  trial_start=now(), trial_end=now()+interval '14 days' where id='$U';
delete from student_body_measures where user_id='$U';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('$U', now(), current_date, 'weight', $6, 'setup', 'fr-FR');
insert into student_goals(user_id, goal, content_locale, practical_constraints)
values ('$U','$7','fr-FR', jsonb_build_object(
  'diet_asked', true,
  'allergy_check', jsonb_build_object('self', true, 'members', '[]'::jsonb),
  'eating_rhythm', '${11}'::jsonb,
  'cooking_style', '$8',
  'grocery_runs', $9,
  'kitchen_equipment', '${10}'::jsonb))
on conflict (user_id) do update set goal=excluded.goal,
  content_locale=excluded.content_locale,
  practical_constraints = coalesce(student_goals.practical_constraints,'{}'::jsonb) || excluded.practical_constraints,
  updated_at=now();
insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '$HOUSE_COACH','$U',(select email from auth.users where id='$U'),'active',now(),'trial',now()
where not exists (select 1 from coach_clients where student_user_id='$U');
SQL
}

# ── LA BOUCHE DU MAÎTRE N'EST PAS UNE BOUCHE COMME LES AUTRES ─────────────
# Elle porte un `user_id`, et DEUX portes de foyer la refusent — `set_member_goal`
# et `set_member_diet` rendent `has_account`: sa direction vit sur
# `student_goals`, écrite par `socle`.
#
# ⛔ MAIS SON CORPS PASSE, ET IL LE DOIT. `keel_household_set_member_body`
# ACCEPTE le titulaire (mesuré: {"ok": true}), et c'est la SEULE table que le
# moteur lit pour dimensionner sa part: `mouthTargetKcal` est nourrie par
# `lineBodies`, c'est-à-dire `keel_household_bodies_for(p_household)`, clavée sur
# `member_id`. `profiles` + `student_body_measures` ne servent QUE le brief du
# modèle (`loadHouseholdMemberBodies`, clavée sur `user_id`). Un titulaire sans
# ligne de corps est donc un titulaire sans CIBLE — `structure.reason = no_body`,
# aucune boîte pesée, et la mesure du point 5 serait fausse pour la mauvaise
# raison. Vérifié en base le 2026-09-04: 36 titulaires sur 58 en portent une.
owner_date() { rpcx keel_household_set_member_birth_date "{\"p_member\":\"$1\",\"p_birth_date\":\"$2\"}" >/dev/null; }

RYTHME3='[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]'
EQUIP_FREEZER='["oven","stovetop","fridge","freezer"]'

ensure_household() { # $1=nom du foyer
  local n; n="$(rpc keel_household_roster '{}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
  [ "$n" = "0" ] && rpcx keel_household_create "{\"p_name\":\"$1\"}" >/dev/null
}
owner_mid() { rpc keel_household_roster '{}' \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print(next((x["member_id"] for x in r if x.get("user_id")),r[0]["member_id"] if r else ""))'; }

# ══════════════════════════════════════════════════════════════════════════
fixture_solo() {
  echo "══ SOLO — une bouche, lane generate-meal-v1, fat_loss"
  ensure_account "$SOLO_EMAIL" "Evan Neuf"
  socle "Evan Neuf" "1990-05-12" male 180 sedentary 82.0 fat_loss balanced 2 "$EQUIP_FREEZER" "$RYTHME3"
  # ⚠️ LE RYTHME DE PERTE: sans lui le moteur retombe sur DEFAULT_PACE et
  # l'écran traite la personne comme quelqu'un qui ne vise rien (87 % de la base).
  psqlq -c "update student_goals set target_pace_kg_per_week=0.5, target_weight_kg=75
    where user_id='$U';" >/dev/null
  psqlq -c "select 'solo', goal, target_pace_kg_per_week, practical_constraints->>'cooking_style',
    practical_constraints->>'grocery_runs' from student_goals where user_id='$U';"
}

fixture_duo() {
  echo "══ DUO — maître (maintenance, dégoût champignons) + Marc (fat_loss)"
  ensure_account "$DUO_EMAIL" "Julie Duo"
  socle "Julie Duo" "1989-02-20" female 166 trains_some 62.0 maintenance balanced 2 "$EQUIP_FREEZER" "$RYTHME3"
  ensure_household "Foyer Duo (9 points)"
  local OWN MARC
  OWN="$(owner_mid)"
  owner_date "$OWN" 1989-02-20
  body "$OWN" 166 62 female trains_some seated 1_2 average
  MARC="$(mid_of Marc)"; [ -z "$MARC" ] && MARC="$(add_member Marc 1986-09-02 '"fat_loss"')"
  body "$MARC" 181 80 male trains_some seated 1_2 average
  psqlq -c "update household_members set target_pace_kg_per_week=0.5, target_weight_kg=74
    where member_id='$MARC';" >/dev/null
  dislike "$OWN" "champignons"
  # L'ENVIE — elle vit sur la SEMAINE ISO du départ du plan, jamais sur le profil.
  rpcx keel_household_submit_envy "{\"p_week_start\":\"$(psqlq -c "select to_char(date_trunc('week',current_date),'YYYY-MM-DD')")\",\"p_body\":\"Des raviolis aux champignons cette semaine.\"}" >/dev/null
  rpc keel_household_roster '{}' | python3 -m json.tool | head -30
}

fixture_quatre() {
  echo "══ QUATRE — maître (fat_loss) + Claire + Léo (mineur) + Nora (vegan)"
  ensure_account "$QUATRE_EMAIL" "Paul Quatre"
  socle "Paul Quatre" "1984-07-03" male 180 on_feet 82.0 fat_loss balanced 2 "$EQUIP_FREEZER" "$RYTHME3"
  psqlq -c "update student_goals set target_pace_kg_per_week=0.5, target_weight_kg=76 where user_id='$U';" >/dev/null
  ensure_household "Foyer Quatre (9 points)"
  local OWN CLAIRE LEO NORA
  OWN="$(owner_mid)"
  owner_date "$OWN" 1984-07-03
  body "$OWN" 180 82 male on_feet seated 1_2 average
  CLAIRE="$(mid_of Claire)"; [ -z "$CLAIRE" ] && CLAIRE="$(add_member Claire 1987-11-14 '"maintenance"')"
  body "$CLAIRE" 167 60 female trains_some seated 1_2 average
  LEO="$(mid_of Leo)"; [ -z "$LEO" ] && LEO="$(add_member Leo 2014-03-05 '"maintenance"')"
  body "$LEO" 148 38 male trains_some on_feet 3_4 average
  NORA="$(mid_of Nora)"; [ -z "$NORA" ] && NORA="$(add_member Nora 1996-01-22 '"maintenance"')"
  body "$NORA" 164 58 female trains_some seated 1_2 average
  rpcx keel_household_set_member_diet "{\"p_member\":\"$NORA\",\"p_diet\":\"vegan\"}" >/dev/null
  rpc keel_household_roster '{}' | python3 -m json.tool | head -40
}

fixture_cinq() {
  echo "══ CINQ — maître (fat_loss) + Marc (muscle_gain) + Léa (végé) + Tom (œuf) + Zoé (arachide)"
  ensure_account "$CINQ_EMAIL" "Sonia Cinq"
  socle "Sonia Cinq" "1985-06-11" female 168 trains_some 70.0 fat_loss keen 3 "$EQUIP_FREEZER" "$RYTHME3"
  psqlq -c "update student_goals set target_pace_kg_per_week=0.5, target_weight_kg=64 where user_id='$U';" >/dev/null
  ensure_household "Foyer Cinq (9 points)"
  local OWN MARC LEA TOM ZOE
  OWN="$(owner_mid)"
  owner_date "$OWN" 1985-06-11
  body "$OWN" 168 70 female trains_some seated 1_2 average
  MARC="$(mid_of Marc)"; [ -z "$MARC" ] && MARC="$(add_member Marc 1983-09-02 '"muscle_gain"')"
  body "$MARC" 183 84 male trains_hard physical_job 5_plus large
  psqlq -c "update household_members set target_pace_kg_per_week=0.5, target_weight_kg=88 where member_id='$MARC';" >/dev/null
  LEA="$(mid_of Lea)"; [ -z "$LEA" ] && LEA="$(add_member Lea 2010-04-18 '"maintenance"')"
  body "$LEA" 158 46 female trains_some on_feet 3_4 average
  rpcx keel_household_set_member_diet "{\"p_member\":\"$LEA\",\"p_diet\":\"vegetarian\"}" >/dev/null
  TOM="$(mid_of Tom)"; [ -z "$TOM" ] && TOM="$(add_member Tom 2012-11-20 '"maintenance"')"
  body "$TOM" 145 38 male trains_some on_feet 1_2 average
  rpcx keel_household_add_allergy "{\"p_member\":\"$TOM\",\"p_label\":\"oeuf\"}" >/dev/null
  ZOE="$(mid_of Zoe)"; [ -z "$ZOE" ] && ZOE="$(add_member Zoe 2017-06-21 '"maintenance"')"
  body "$ZOE" 122 24 female on_feet on_feet none small
  rpcx keel_household_add_allergy "{\"p_member\":\"$ZOE\",\"p_label\":\"arachide\"}" >/dev/null
  dislike "$MARC" "champignons" "lentilles"
  rpcx keel_household_submit_envy "{\"p_week_start\":\"$(psqlq -c "select to_char(date_trunc('week',current_date),'YYYY-MM-DD')")\",\"p_body\":\"Des raviolis aux champignons, et une pizza vendredi soir.\"}" >/dev/null
  rpc keel_household_roster '{}' | python3 -m json.tool | head -50
}

case "$WHICH" in
  solo) fixture_solo;;
  duo) fixture_duo;;
  quatre) fixture_quatre;;
  cinq) fixture_cinq;;
  all) fixture_solo; fixture_duo; fixture_quatre; fixture_cinq;;
  *) echo "usage: $0 solo|duo|quatre|cinq|all"; exit 2;;
esac
