#!/usr/bin/env bash
# ── FIXTURE FOYER « F » — l'état F1 : trois adultes, UN seul régime divergent ──
# ÉCRITURES DE FIXTURE : auth.users (admin API), profiles, student_goals,
# coach_clients, puis les RPC de foyer (households, household_members,
# household_member_bodies) — les MÊMES que `SetupPage.tsx :: addMouth`.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

TOK="$(login "$HH_EMAIL")"
if [ -z "$TOK" ]; then
  curl -s -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SRK" -H "authorization: Bearer $SRK" -H 'content-type: application/json' \
    -d "{\"email\":\"$HH_EMAIL\",\"password\":\"$FIX_PW\",\"email_confirm\":true,\"user_metadata\":{\"fixture\":\"EVAL-0823-FOYER\",\"full_name\":\"Marc Rousseau\"}}" >/dev/null
  TOK="$(login "$HH_EMAIL")"
fi
[ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
U="$(psqlq -c "select id from auth.users where email='$HH_EMAIL'")"
echo "maître ✓ $U (connexion par mot de passe, jeton ${#TOK} car.)"

psqlq <<SQL
update profiles set full_name='Marc Rousseau', birth_date='1985-03-08', gender='male',
  height_cm=176, activity_level='on_feet', locale='en-GB', country='GB',
  timezone='Europe/London', onboarding_completed=true, access_tier='student',
  trial_start=now(), trial_end=now()+interval '14 days' where id='$U';
delete from student_body_measures where user_id='$U';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('$U', now(), current_date, 'weight', 79.0, 'setup', 'en-GB');
insert into student_goals(user_id, goal, content_locale, practical_constraints)
values ('$U','maintenance','en-GB','{"diet_asked": true, "allergy_check": {"self": true, "members": []}, "eating_rhythm": [{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]}'::jsonb)
on conflict (user_id) do update set goal=excluded.goal, practical_constraints=excluded.practical_constraints, updated_at=now();
insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '00000000-0000-4000-8000-00000000d15c','$U','$HH_EMAIL','active',now(),'trial',now()
where not exists (select 1 from coach_clients where student_user_id='$U');
SQL

rpc() { # $1=nom $2=json
  curl -s -X POST "$API_URL/rest/v1/rpc/$1" -H "apikey: $ANON" \
    -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$2"
}

ROSTER="$(rpc keel_household_roster '{}')"
if [ "$(printf '%s' "$ROSTER" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" = "0" ]; then
  echo "foyer + $(rpc keel_household_create '{"p_name":"Rousseau (éval 2026-08-23)"}')"
fi

body() { # member height weight gender activity day sport appetite
  rpc keel_household_set_member_body "{\"p_member\":\"$1\",\"p_height_cm\":$2,\"p_weight_kg\":$3,\"p_gender\":\"$4\",\"p_activity_level\":\"$5\",\"p_day_activity\":\"$6\",\"p_sport_frequency\":\"$7\",\"p_activity_axes_asked\":true,\"p_takes_dessert\":null,\"p_takes_cheese\":null,\"p_takes_bread\":null,\"p_meal_structure_asked\":false,\"p_appetite\":\"$8\",\"p_appetite_asked\":true}" >/dev/null
}
add() { rpc keel_household_add_member "{\"p_first_name\":\"$1\",\"p_birth_date\":\"$2\",\"p_goal\":$3}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["member_id"])'; }
mid_of() { rpc keel_household_roster '{}' | python3 -c "import sys,json;print(next((r['member_id'] for r in json.load(sys.stdin) if r['first_name']=='$1'),''))"; }

OWN="$(mid_of Marc)"
[ -z "$OWN" ] && OWN="$(rpc keel_household_roster '{}' | python3 -c 'import sys,json;r=json.load(sys.stdin);print(r[0]["member_id"])')"
rpc keel_household_set_member_birth_date "{\"p_member\":\"$OWN\",\"p_birth_date\":\"1985-03-08\"}" >/dev/null
rpc keel_household_set_member_goal "{\"p_member\":\"$OWN\",\"p_goal\":\"maintenance\"}" >/dev/null
body "$OWN" 176 79 male on_feet seated 1_2 average

LEA="$(mid_of Lea)";  [ -z "$LEA" ]  && LEA="$(add Lea 1991-06-17 '"fat_loss"')"
body "$LEA" 165 68 female trains_some seated 3_4 average
rpc keel_household_set_member_diet "{\"p_member\":\"$LEA\",\"p_diet\":\"vegan\"}" >/dev/null

THEO="$(mid_of Theo)"; [ -z "$THEO" ] && THEO="$(add Theo 1988-11-02 '"muscle_gain"')"
body "$THEO" 183 84 male trains_hard physical_job 5_plus large

echo "── le roster relu depuis la base ──"
rpc keel_household_roster '{}' | python3 -m json.tool | head -60
