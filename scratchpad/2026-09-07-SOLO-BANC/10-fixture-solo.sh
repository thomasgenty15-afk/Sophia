#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LE FOYER D'UNE BOUCHE — banc solo, 2026-09-07
#
#   bash 10-fixture-solo.sh
#
# Patron: `2026-09-04-1658-CAMPAGNE-9-POINTS/10-fixtures.sh :: fixture_duo`,
# SANS le second membre. Chaque champ est posé par la MÊME porte que l'écran
# (`SetupPage.tsx :: addMouth`), dans SON ordre. Une fixture qui diverge du
# produit mesure autre chose.
#
# ⛔ LA BOUCHE DU TITULAIRE N'EST PAS UNE BOUCHE COMME LES AUTRES. Elle porte un
# `user_id`, et les portes de foyer qui écrivent une DIRECTION la refusent avec
# `has_account` — `set_member_goal`, `set_member_diet`, et surtout
# `set_member_rhythm` / `set_member_fixed_intakes`. Son rythme et son shaker
# vivent donc dans `student_goals.practical_constraints`, écrits par `socle`.
# Son CORPS, lui, passe par la RPC et il le DOIT: `mouthTargetKcal` est nourrie
# par `keel_household_bodies_for`, clavée sur `member_id`. Un titulaire sans
# ligne de corps est un titulaire sans CIBLE (`structure.reason = no_body`).
#
# ⛔ LES HABITUDES PASSENT PAR LA RPC, ELLES. `keel_household_set_member_habits`
# n'écrit aucune direction: elle accepte le titulaire.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

TOK="$(login "$SOLO_EMAIL")"
if [ -z "$TOK" ]; then
  curl -s -X POST "$API_URL/auth/v1/signup" \
    -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "{\"email\":\"$SOLO_EMAIL\",\"password\":\"$FIX_PW\",\"data\":{\"full_name\":\"Alex Solo\"}}" >/dev/null
  psqlq -c "update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()),
    confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''),
    email_change_token_new=coalesce(email_change_token_new,''), email_change=coalesce(email_change,''),
    email_change_token_current=coalesce(email_change_token_current,''),
    phone_change=coalesce(phone_change,''), phone_change_token=coalesce(phone_change_token,''),
    reauthentication_token=coalesce(reauthentication_token,'')
    where email='$SOLO_EMAIL';" >/dev/null
  TOK="$(login "$SOLO_EMAIL")"
fi
[ -z "$TOK" ] && { echo "⛔ pas de jeton pour $SOLO_EMAIL"; exit 1; }
U="$(psqlq -c "select id from auth.users where email='$SOLO_EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas d'utilisateur"; exit 1; }
echo "══ SOLO — une bouche · $SOLO_EMAIL · $U"

rpc() { curl -s -X POST "$API_URL/rest/v1/rpc/$1" -H "apikey: $ANON" \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$2"; }
# ⛔ UNE RPC QUI REND {ok:false} N'EST PAS UNE RÉUSSITE — elles ne LÈVENT pas.
rpcx() {
  local out; out="$(rpc "$1" "$2")"
  case "$out" in *'"ok": false'*|*'"ok":false'*) echo "⛔ $1 → $out"; exit 1;; esac
  printf '%s' "$out"
}

# ── LE RYTHME: QUATRE MOMENTS, AUCUNE TAILLE ──────────────────────────────
# ⛔ PAS DE `size`. `parseEatingRhythm` (`meal_generation.ts:484`) rend `null`
# quand la clé manque, et c'est ce qu'on veut: la nouvelle méthode dérive le
# poids du créneau de `SLOT_DAY_WEIGHT` et du drapeau « léger », jamais d'une
# taille déclarée. Une `size` posée ici ferait compter « léger » DEUX FOIS.
#
# ⛔ `snack_pm` EST DÉCLARÉ EXPRÈS: sans lui le shaker n'aurait pas de créneau
# où se retrancher, et `fixedIntakeSlotKcal` compterait un `loose` au lieu d'un
# `declared`. C'est le cas nominal du lot 2 qu'on veut sur le banc.
RYTHME='[{"slot":"breakfast"},{"slot":"lunch"},{"slot":"snack_pm"},{"slot":"dinner"}]'
EQUIP='["oven","stovetop","fridge","freezer"]'

# ── LE SHAKER, MIROIR EXACT DE `shakerIntakeJson` ─────────────────────────
# `api/mouthProfile.ts:384`. Dix clés, dans cet ordre. `days: []` = tous les
# jours; `replaces_meal: false` MÊME avec un moment nommé (A5): un shaker au
# goûter nomme un moment et ne remplace rien. `food_ref` est dérivé du libellé
# par `declaredSlugFor` — `declared_` + le libellé sans accent ni espace.
SHAKER='[{"food_ref":"declared_mon_shaker","label":"mon shaker","amount":30,"unit":"g","days":[],"nutrition":"declared","serving_grams":30,"protein_g_per_serving":24,"energy_kcal_per_serving":120,"slot":"snack_pm","replaces_meal":false}]'

psqlq <<SQL
update profiles set full_name='Alex Solo', birth_date='1990-03-15', gender='male',
  height_cm=170, activity_level='trains_some', locale='fr-FR', country='FR',
  timezone='Europe/Paris', onboarding_completed=true, access_tier='student',
  trial_start=now(), trial_end=now()+interval '14 days' where id='$U';
delete from student_body_measures where user_id='$U';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('$U', now(), current_date, 'weight', 70.0, 'setup', 'fr-FR');
insert into student_goals(user_id, goal, content_locale, practical_constraints)
values ('$U','maintenance','fr-FR', jsonb_build_object(
  'diet_asked', true,
  'allergy_check', jsonb_build_object('self', true, 'members', '[]'::jsonb),
  'eating_rhythm', '$RYTHME'::jsonb,
  'fixed_intakes', '$SHAKER'::jsonb,
  'cooking_style', 'balanced',
  'grocery_runs', 2,
  'kitchen_equipment', '$EQUIP'::jsonb))
on conflict (user_id) do update set goal=excluded.goal,
  content_locale=excluded.content_locale,
  practical_constraints = coalesce(student_goals.practical_constraints,'{}'::jsonb) || excluded.practical_constraints,
  updated_at=now();
insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '$HOUSE_COACH','$U',(select email from auth.users where id='$U'),'active',now(),'trial',now()
where not exists (select 1 from coach_clients where student_user_id='$U');
SQL

# ── LE FOYER, PUIS LA SEULE BOUCHE ────────────────────────────────────────
N="$(rpc keel_household_roster '{}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
[ "$N" = "0" ] && rpcx keel_household_create '{"p_name":"Foyer Solo (banc)"}' >/dev/null
OWN="$(rpc keel_household_roster '{}' \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print(next((x["member_id"] for x in r if x.get("user_id")),r[0]["member_id"] if r else ""))')"
[ -z "$OWN" ] && { echo "⛔ pas de bouche titulaire"; exit 1; }

rpcx keel_household_set_member_birth_date "{\"p_member\":\"$OWN\",\"p_birth_date\":\"1990-03-15\"}" >/dev/null
rpcx keel_household_set_member_body "{\"p_member\":\"$OWN\",\"p_height_cm\":170,\"p_weight_kg\":70,\"p_gender\":\"male\",\"p_activity_level\":\"trains_some\",\"p_day_activity\":\"seated\",\"p_sport_frequency\":\"1_2\",\"p_activity_axes_asked\":true,\"p_takes_dessert\":null,\"p_takes_cheese\":null,\"p_takes_bread\":null,\"p_meal_structure_asked\":false,\"p_appetite\":\"average\",\"p_appetite_asked\":true}" >/dev/null

# ── LE DÎNER LÉGER, AVEC DU PAIN À CÔTÉ ───────────────────────────────────
# ⚠️ `light` N'EST PAS ENCORE GARDÉ EN BASE au lot 0. La seule contrainte sur
# `slots` est `keel_habit_extras_ok`, qui ne regarde QUE `extras`: la clé passe
# telle quelle, non validée. Le lot 2 pose `household_member_habits_light_check`
# — cette fixture est alors relue par la contrainte, et doit continuer à passer.
# ⚠️ `kind: "household_dish"` NE SURVIT PAS à `parseMemberHabits` (:164), et
# c'est voulu: l'entrée est MUETTE pour le prompt et PARLANTE pour le calcul
# (`parseMemberExtras`, et demain `parseMemberLight`).
rpcx keel_household_set_member_habits "{\"p_member\":\"$OWN\",\"p_slots\":[{\"slot\":\"dinner\",\"kind\":\"household_dish\",\"usual\":\"\",\"extras\":[\"bread\"],\"light\":true}],\"p_note\":null}" >/dev/null

echo "   bouche titulaire: $OWN"
psqlq -c "select 'goal='||goal||' · rythme='||(practical_constraints->'eating_rhythm')::text
  from student_goals where user_id='$U';"
psqlq -c "select 'habitudes='||slots::text from household_member_habits where member_id='$OWN';"
echo "✓ fixture solo posée — vérifie avec 15-verif-solo.sh"
