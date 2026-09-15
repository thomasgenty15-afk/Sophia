-- ===========================================================================
-- QA AGENT 12 — fixtures for the SAFETY chain (crisis + disordered-eating floor)
-- ===========================================================================
-- Idempotent. Run with:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-12-fixtures.sql
--
-- One coach with a PUBLISHED doctrine, four students that differ ONLY by
-- `profiles.country`: GB / FR / US / NULL. That single column is the whole
-- point — the documented incident is "an American in crisis is handed 3114",
-- and the only way to prove the resolver is real is four identical students
-- who must receive four different sets of numbers.
--
-- `locale` is 'fr-FR' on the NULL-country student ON PURPOSE: it is the fleet
-- default (`profiles.locale not null default 'fr-FR'`), so it is the case that
-- silently served France to everyone before W4.2. If country resolution is
-- inert, this student gets 3114 and the fallback is a lie.
-- ===========================================================================

begin;

-- --- 0. wipe any previous run of this fixture ------------------------------
delete from auth.users where email like 'a12.%@keeltest.dev';

-- --- 1. users --------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change, phone_change_token,
  reauthentication_token,
  created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', '',
  now(), now()
from (values
  ('ac120000-0000-4000-8000-000000000001'::uuid, 'a12.coach@keeltest.dev'),
  ('ac120000-0000-4000-8000-000000000011'::uuid, 'a12.gb@keeltest.dev'),
  ('ac120000-0000-4000-8000-000000000012'::uuid, 'a12.fr@keeltest.dev'),
  ('ac120000-0000-4000-8000-000000000013'::uuid, 'a12.us@keeltest.dev'),
  ('ac120000-0000-4000-8000-000000000014'::uuid, 'a12.nocountry@keeltest.dev'),
  ('ac120000-0000-4000-8000-000000000015'::uuid, 'a12.floor@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a12.%@keeltest.dev';

-- --- 2. profiles -----------------------------------------------------------
-- The FOUR country cases. `locale` is held CONSTANT at 'en-GB' for GB/FR/US so
-- that the ONLY variable is `country`; the fifth row keeps the fleet default
-- 'fr-FR' with country NULL, which is the pre-W4.2 shape.
insert into public.profiles (
  id, email, keel_role, country, locale, timezone, whatsapp_opted_in, full_name
) values
  ('ac120000-0000-4000-8000-000000000001', 'a12.coach@keeltest.dev', 'coach',   'GB', 'en-GB', 'Europe/London', false, 'Ruth'),
  ('ac120000-0000-4000-8000-000000000011', 'a12.gb@keeltest.dev',    'student', 'GB', 'en-GB', 'Europe/London', true,  'Georgia'),
  ('ac120000-0000-4000-8000-000000000012', 'a12.fr@keeltest.dev',    'student', 'FR', 'en-GB', 'Europe/Paris',  true,  'Fabien'),
  ('ac120000-0000-4000-8000-000000000013', 'a12.us@keeltest.dev',    'student', 'US', 'en-GB', 'America/New_York', true, 'Ulysses'),
  ('ac120000-0000-4000-8000-000000000014', 'a12.nocountry@keeltest.dev', 'student', null, 'fr-FR', 'Europe/London', true, 'Nadia'),
  ('ac120000-0000-4000-8000-000000000015', 'a12.floor@keeltest.dev', 'student', 'GB', 'en-GB', 'Europe/London', true,  'Faye')
on conflict (id) do update
  set keel_role = excluded.keel_role,
      country = excluded.country,
      locale = excluded.locale,
      timezone = excluded.timezone,
      whatsapp_opted_in = excluded.whatsapp_opted_in,
      full_name = excluded.full_name;

-- --- 3. coach --------------------------------------------------------------
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values ('ac120000-0000-4000-8000-0000000000c1',
        'ac120000-0000-4000-8000-000000000001', 'Ruth', 'active', 50)
on conflict (id) do update
  set display_name = excluded.display_name,
      trial_seat_limit = excluded.trial_seat_limit;

-- --- 4. published doctrine -------------------------------------------------
delete from public.coach_doctrines
 where coach_id = 'ac120000-0000-4000-8000-0000000000c1';

insert into public.coach_doctrines (
  coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice,
  content_locale, published_at, published_by
) values (
  'ac120000-0000-4000-8000-0000000000c1', 1,
  $json$[
    {"key": "three_real_meals_anchor_the_day",
     "claim": "Three real meals a day, each built around a protein anchor. Nothing between them that needs deciding.",
     "rationale": "A decided plate at 7pm is what stops the 10pm raid."},
    {"key": "satiety_before_arithmetic",
     "claim": "If you are hungry an hour later the meal was wrong, not your willpower.",
     "rationale": "Counting while hungry is how people quit in three weeks."},
    {"key": "cook_once_eat_twice",
     "claim": "Dinner should leave tomorrow's lunch behind it.",
     "rationale": "Midweek is won on Sunday."},
    {"key": "the_evening_is_where_the_week_breaks",
     "claim": "Protect the evening with something you actually want to eat.",
     "rationale": "A week is lost at 9pm, never at 9am."}
  ]$json$::jsonb,
  $json$[
    {"token": "intermittent_fasting",
     "surface_forms": ["intermittent fasting", "skip breakfast", "16:8", "fasting window"],
     "reason": "students who skip the morning eat the whole week back at nine at night",
     "instead": "Ruth has you eat something with an anchor within an hour of waking."},
    {"token": "compensation_days",
     "surface_forms": ["compensation day", "detox day", "make up for it tomorrow", "eat nothing tomorrow"],
     "reason": "a day paid back is a day that will be paid back again",
     "instead": "Ruth has the next meal be a normal one, on time, with its anchor."}
  ]$json$::jsonb,
  $json$[
    {"term": "anchor", "meaning": "the protein the plate is built around"},
    {"term": "the gap", "meaning": "the stretch between lunch and dinner where the week usually breaks"}
  ]$json$::jsonb,
  $json$[
    {"situation": "A student says they ate the whole cupboard last night.",
     "coach_answer": "One evening is one evening. Tell me what dinner looked like, because that is usually where it started.",
     "source": "interview"},
    {"situation": "A student asks how many calories they should eat.",
     "coach_answer": "Nobody has measured you, so a number would be a guess wearing a lab coat.",
     "source": "interview"}
  ]$json$::jsonb,
  $json$ {"length": "short", "emojis": "light", "language": "English (en-GB)"} $json$::jsonb,
  'en-GB', now(), 'ac120000-0000-4000-8000-000000000001'
);

-- --- 5. coach_clients ------------------------------------------------------
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, seat_state)
select 'ac120000-0000-4000-8000-0000000000c1'::uuid, u.id, 'active', now(), 'trial'
from auth.users u
where u.email like 'a12.%@keeltest.dev' and u.email <> 'a12.coach@keeltest.dev';

-- --- 6. goals --------------------------------------------------------------
insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
select u.id, 'health',
       'Desk job, cooks in the evening, eats at a canteen at midday.',
       '{}'::jsonb, 'en-GB'
from auth.users u
where u.email like 'a12.%@keeltest.dev' and u.email <> 'a12.coach@keeltest.dev'
on conflict (user_id) do update
  set goal = excluded.goal, situation = excluded.situation;

-- --- 7. an ADOPTED week plan ----------------------------------------------
-- Needed so that "a durable effect exists to attempt" is true: without a plan
-- there is nothing to track and the zero-effect assertion would be vacuous.
insert into public.student_week_plans (
  user_id, week_start, generated_from, items, status, adopted_at, content_locale
)
select u.id,
       date_trunc('week', current_date)::date,
       '{"doctrine_version": 1, "seeded_by": "agent-12-fixtures"}'::jsonb,
       $json$[
         {"kind": "nutrition", "title": "Breakfast, built", "source_belief_key": "three_real_meals_anchor_the_day"},
         {"kind": "nutrition", "title": "Lunch with an anchor", "source_belief_key": "three_real_meals_anchor_the_day"},
         {"kind": "nutrition", "title": "Dinner you want to eat", "source_belief_key": "the_evening_is_where_the_week_breaks"},
         {"kind": "action", "title": "Cook once on Sunday"}
       ]$json$::jsonb,
       'adopted', now(), 'en-GB'
from auth.users u
where u.email like 'a12.%@keeltest.dev' and u.email <> 'a12.coach@keeltest.dev'
on conflict (user_id, week_start) do update
  set items = excluded.items, status = 'adopted', adopted_at = now();

commit;

-- --- verification ---------------------------------------------------------
select u.email,
       p.country,
       p.locale,
       p.timezone,
       (cc.id is not null) as linked,
       (d.published_at is not null) as coach_published,
       swp.status as plan_status
from auth.users u
join public.profiles p on p.id = u.id
left join public.coach_clients cc on cc.student_user_id = u.id and cc.status = 'active'
left join public.coaches c on c.id = cc.coach_id
left join public.coach_doctrines d on d.coach_id = c.id and d.published_at is not null
left join public.student_week_plans swp on swp.user_id = u.id
where u.email like 'a12.%@keeltest.dev'
order by u.email;
