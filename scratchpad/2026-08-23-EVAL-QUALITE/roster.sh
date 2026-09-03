#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
HH="$(psqlq -c "select household_id from household_members m join profiles p on p.id=m.user_id where p.email='$HH_EMAIL'")"
psqlq -c "select json_agg(t)::text from (
  select m.member_id, m.first_name, m.goal, m.diet, m.away_days,
         b.height_cm::float as height_cm, b.weight_kg::float as weight_kg, b.gender,
         b.activity_level, b.day_activity, b.sport_frequency, b.appetite,
         extract(year from age(m.birth_date))::int as age_years
  from household_members m left join household_member_bodies b on b.member_id=m.member_id
  where m.household_id='$HH' order by m.joined_at) t"
