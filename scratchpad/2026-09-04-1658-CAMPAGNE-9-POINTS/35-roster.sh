#!/usr/bin/env bash
# Le roster tel que l'analyseur d'énergie le veut. $1 = solo|duo|quatre|cinq
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
case "$1" in solo) E="$SOLO_EMAIL";; duo) E="$DUO_EMAIL";; quatre) E="$QUATRE_EMAIL";; cinq) E="$CINQ_EMAIL";; *) exit 2;; esac
U="$(psqlq -c "select id from auth.users where email='$E'")"
psqlq -c "select json_agg(t)::text from (
  select m.member_id, m.first_name,
         coalesce(m.goal, (select goal from student_goals g where g.user_id=m.user_id)) as goal,
         m.diet, m.away_days,
         b.height_cm::float as height_cm, b.weight_kg::float as weight_kg, b.gender,
         b.activity_level, b.day_activity, b.sport_frequency, b.appetite,
         extract(year from age(m.birth_date))::int as age_years
    from household_members m left join household_member_bodies b on b.member_id=m.member_id
   where m.household_id = public.keel_household_of('$U') order by m.joined_at) t"
