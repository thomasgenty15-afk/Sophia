-- ===========================================================================
-- QA AGENT 10 — fixtures for the Doctrine Copilot loop
-- ===========================================================================
-- Two coaches with DELIBERATELY CONTRADICTORY methods (scenario 8), one silent
-- coach (control arm of the A/B), one student each. Deterministic UUIDs.
--
--   Nadia  — three real meals, nothing between them. Forbids grazing.
--   Tomas  — eats every three hours. Forbids long gaps / three big meals.
--
-- A probe answered "eat little and often" for Nadia's student, or "three real
-- meals and nothing between" for Tomas's, is a tenancy leak, not a style
-- difference.
-- ===========================================================================

begin;

delete from auth.users where email like 'a10.%@keeltest.dev';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
from (values
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'a10.coach.nadia@keeltest.dev'),
  ('aa000000-0000-4000-8000-000000000002'::uuid, 'a10.coach.tomas@keeltest.dev'),
  ('aa000000-0000-4000-8000-000000000003'::uuid, 'a10.coach.silent@keeltest.dev'),
  ('bb000000-0000-4000-8000-000000000001'::uuid, 'a10.student.alex@keeltest.dev'),
  ('bb000000-0000-4000-8000-000000000002'::uuid, 'a10.student.ben@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a10.%@keeltest.dev';

insert into public.profiles (
  id, email, keel_role, locale, timezone, country, whatsapp_opted_in,
  onboarding_completed, phone_number, full_name
)
select u.id, u.email,
       case when u.email like '%coach%' then 'coach' else 'student' end,
       'en-GB', 'Europe/London', 'GB',
       u.email not like '%coach%',
       true,
       case
         when u.email = 'a10.student.alex@keeltest.dev' then '+447700900101'
         when u.email = 'a10.student.ben@keeltest.dev'  then '+447700900102'
         else null
       end,
       initcap(split_part(split_part(u.email, '@', 1), '.', 3))
from auth.users u
where u.email like 'a10.%@keeltest.dev'
on conflict (id) do update
  set keel_role = excluded.keel_role,
      locale = excluded.locale,
      timezone = excluded.timezone,
      country = excluded.country,
      phone_number = excluded.phone_number,
      onboarding_completed = excluded.onboarding_completed,
      whatsapp_opted_in = excluded.whatsapp_opted_in;

insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values
  ('cc000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Nadia', 'active', 50),
  ('cc000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000002', 'Tomas', 'active', 50),
  ('cc000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000003', 'Silent', 'active', 50)
on conflict (id) do update
  set display_name = excluded.display_name,
      trial_seat_limit = excluded.trial_seat_limit;

-- Alex -> Nadia, Ben -> Tomas. Nothing published yet: the A/B control arm is
-- the FIRST thing that runs, and it must run against a coach who has nothing.
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, seat_state)
values
  ('cc000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'active', now(), 'trial'),
  ('cc000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002', 'active', now(), 'trial');

insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
values
  ('bb000000-0000-4000-8000-000000000001', 'fat_loss',
   'Desk job, I eat lunch out most weekdays, I train twice a week in the evening.',
   '{}'::jsonb, 'en-GB'),
  ('bb000000-0000-4000-8000-000000000002', 'fat_loss',
   'Desk job, I eat lunch out most weekdays, I train twice a week in the evening.',
   '{}'::jsonb, 'en-GB')
on conflict (user_id) do update
  set goal = excluded.goal,
      situation = excluded.situation;

commit;

select p.email, p.keel_role, c.display_name as coach
from public.profiles p
left join public.coach_clients cc on cc.student_user_id = p.id and cc.status = 'active'
left join public.coaches c on c.id = cc.coach_id
where p.email like 'a10.%@keeltest.dev'
order by p.email;
