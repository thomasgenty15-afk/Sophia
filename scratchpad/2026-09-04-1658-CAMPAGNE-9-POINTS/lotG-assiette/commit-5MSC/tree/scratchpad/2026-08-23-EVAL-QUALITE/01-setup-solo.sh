#!/usr/bin/env bash
# ── FIXTURE SOLO « S » — le socle S1 ──────────────────────────────────────
# ÉCRITURES DE FIXTURE (notées dans le rapport) :
#   auth.users (admin API), profiles, student_body_measures, student_goals,
#   coach_clients.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

echo "── ① le compte ─────────────────────────────────────────"
TOK="$(login "$SOLO_EMAIL")"
if [ -z "$TOK" ]; then
  curl -s -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SRK" -H "authorization: Bearer $SRK" -H 'content-type: application/json' \
    -d "{\"email\":\"$SOLO_EMAIL\",\"password\":\"$FIX_PW\",\"email_confirm\":true,\"user_metadata\":{\"fixture\":\"EVAL-0823-SOLO\",\"full_name\":\"Evan Solo\"}}" >/dev/null
  TOK="$(login "$SOLO_EMAIL")"
fi
[ -z "$TOK" ] && { echo "⛔ pas de jeton"; exit 1; }
UID_="$(psqlq -c "select id from auth.users where email='$SOLO_EMAIL'")"
echo "   ✓ connecté par mot de passe · $UID_ (jeton ${#TOK} car.)"

echo "── ② le socle S1 en base ───────────────────────────────"
psqlq <<SQL
update profiles set
  full_name='Evan Solo', birth_date='1990-05-12', gender='male',
  height_cm=178, activity_level='sedentary', day_activity=null, sport_frequency=null,
  locale='en-GB', country='GB', timezone='Europe/London',
  onboarding_completed=true, access_tier='student',
  trial_start=now(), trial_end=now()+interval '14 days'
where id='$UID_';

delete from student_body_measures where user_id='$UID_';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('$UID_', now(), current_date, 'weight', 82.0, 'setup', 'en-GB');

delete from student_safety_constraints where user_id='$UID_';

insert into student_goals(user_id, goal, content_locale, practical_constraints)
values ('$UID_', 'maintenance', 'en-GB', '{"diet_asked": true, "allergy_check": {"self": true, "members": []}, "eating_rhythm": [{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]}'::jsonb)
on conflict (user_id) do update set
  goal=excluded.goal, content_locale=excluded.content_locale,
  practical_constraints=excluded.practical_constraints, updated_at=now();

insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '00000000-0000-4000-8000-00000000d15c', '$UID_', '$SOLO_EMAIL', 'active', now(), 'trial', now()
where not exists (select 1 from coach_clients where student_user_id='$UID_');
SQL

echo "── ③ relecture depuis la base ──────────────────────────"
psqlq -c "select p.email, p.birth_date, p.gender, p.height_cm, p.activity_level, p.locale, p.country,
 (select value_si from student_body_measures b where b.user_id=p.id and b.kind='weight' order by measured_at desc limit 1) as weight,
 (select goal from student_goals g where g.user_id=p.id) as goal,
 (select count(*) from student_safety_constraints s where s.user_id=p.id and s.status='active') as constraints,
 (select count(*) from coach_clients c where c.student_user_id=p.id and c.status='active') as coach
 from profiles p where p.id='$UID_'"
