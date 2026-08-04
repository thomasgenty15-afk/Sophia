-- ===========================================================================
-- QA AGENT 5 — fixtures for `generate-week-plan-v1` + /app/plan
-- ===========================================================================
-- Idempotent. Run with:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-5-fixtures.sql
--
-- Two coaches (one PUBLISHED doctrine, one who never published) and ten
-- students, one per error path / cap / adversarial case. Deterministic UUIDs so
-- every assertion in the report can be re-run against the same rows.
--
-- Marc's doctrine deliberately contains a conviction that LOVES PEANUT BUTTER:
-- it is the collision the medical lock must survive (scenario 10).
-- ===========================================================================

begin;

-- --- 0. wipe any previous run of this fixture ------------------------------
delete from auth.users where email like 'a5.%@keeltest.dev';

-- --- 1. users --------------------------------------------------------------
-- The token columns are set to '' and NOT left NULL on purpose. GoTrue scans
-- them into Go strings, and a NULL makes the password grant fail with
-- `500 Database error querying schema` / `converting NULL to string is
-- unsupported` — which is the real shape of this repo's "local auth admin API
-- is broken" note. It is a fixture defect, not a product one.
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
  ('11111111-0000-4000-8000-000000000001'::uuid, 'a5.coach.marc@keeltest.dev'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'a5.coach.silent@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000001'::uuid, 'a5.nominal@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000002'::uuid, 'a5.nogoal@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000003'::uuid, 'a5.nocoach@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000004'::uuid, 'a5.nodoctrine@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000005'::uuid, 'a5.allergy@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000006'::uuid, 'a5.numeric@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000007'::uuid, 'a5.recomp@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000008'::uuid, 'a5.perf@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000009'::uuid, 'a5.health@keeltest.dev'),
  ('22222222-0000-4000-8000-000000000010'::uuid, 'a5.maint@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a5.%@keeltest.dev';

-- --- 2. profiles -----------------------------------------------------------
insert into public.profiles (id, email, keel_role, locale, timezone, whatsapp_opted_in, full_name)
select u.id, u.email,
       case when u.email like '%coach%' then 'coach' else 'student' end,
       'en-GB', 'Europe/London', false,
       initcap(split_part(split_part(u.email, '@', 1), '.', 2))
from auth.users u
where u.email like 'a5.%@keeltest.dev'
on conflict (id) do update
  set keel_role = excluded.keel_role,
      locale = excluded.locale,
      timezone = excluded.timezone;

-- --- 3. coaches ------------------------------------------------------------
-- `trial_seat_limit` raised: a trial coach is capped at 3 live seats by
-- `_trg_coach_clients_enforce_trial_cap()`, and this fixture needs nine.
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values
  ('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Marc', 'active', 50),
  ('33333333-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'Silent', 'active', 50)
on conflict (id) do update
  set display_name = excluded.display_name,
      trial_seat_limit = excluded.trial_seat_limit;

-- --- 4. Marc's PUBLISHED doctrine -----------------------------------------
-- 5 convictions, 2 interdits carrying `instead` + `surface_forms`, vocabulary,
-- 2 arbitrations, short voice. `peanut_butter_breakfast` is the trap.
delete from public.coach_doctrines
 where coach_id in ('33333333-0000-4000-8000-000000000001',
                    '33333333-0000-4000-8000-000000000002');

insert into public.coach_doctrines (
  coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice,
  content_locale, published_at, published_by
) values (
  '33333333-0000-4000-8000-000000000001', 1,
  $json$[
    {"key": "satiety_before_arithmetic",
     "claim": "Build every meal so it holds you to the next one. If you are hungry an hour later the meal was wrong, not your willpower.",
     "rationale": "Students who count and stay hungry quit in three weeks."},
    {"key": "protein_anchors_the_plate",
     "claim": "Every plate starts with its protein anchor, and the rest is built around it.",
     "rationale": "Deciding the anchor first removes the daily negotiation."},
    {"key": "cook_once_eat_twice",
     "claim": "Cook once and eat twice: dinner should leave tomorrow's lunch behind it.",
     "rationale": "The people who eat well midweek are the ones who cooked on Sunday."},
    {"key": "peanut_butter_breakfast",
     "claim": "Peanut butter on wholemeal toast is the cheapest honest breakfast there is, and it keeps you until lunch.",
     "rationale": "Fat and protein together in something nobody has to cook."},
    {"key": "the_evening_is_where_the_week_breaks",
     "claim": "The evening is where the week breaks. Protect it with something you actually want to eat.",
     "rationale": "A week is lost at 9pm, never at 9am."}
  ]$json$::jsonb,
  $json$[
    {"token": "intermittent_fasting",
     "surface_forms": ["intermittent fasting", "skip breakfast", "16:8", "fasting window", "skipping breakfast"],
     "reason": "students who skip the morning eat the whole week back at nine at night",
     "instead": "Marc has you eat something with an anchor within an hour of waking. The morning is where the day is won."},
    {"token": "six_small_meals",
     "surface_forms": ["six small meals", "6 small meals", "grazing", "eat every three hours", "snack between meals"],
     "reason": "grazing keeps you thinking about food all day",
     "instead": "Marc works in three real meals with nothing between them that needs deciding."}
  ]$json$::jsonb,
  $json$[
    {"term": "anchor", "meaning": "the protein the plate is built around"},
    {"term": "the gap", "meaning": "the stretch between lunch and dinner where the week usually breaks"}
  ]$json$::jsonb,
  $json$[
    {"situation": "A student says they ate the whole cupboard last night.",
     "coach_answer": "One evening is one evening. Tell me what the plate looked like at dinner, because that is usually where it started.",
     "source": "interview"},
    {"situation": "A student asks how many calories they should eat.",
     "coach_answer": "Nobody has measured you, so a number would be a guess wearing a lab coat. We work on anchors and on whether you got to dinner without raiding the cupboard.",
     "source": "interview"}
  ]$json$::jsonb,
  $json$ {"length": "short", "emojis": "light", "language": "English (en-GB)"} $json$::jsonb,
  'en-GB', now(), '11111111-0000-4000-8000-000000000001'
);

-- Silent coach: a DRAFT doctrine only. Publishing is what the student needs,
-- and an unpublished row proves `coach_has_no_doctrine` is about publication
-- and not about the row existing.
insert into public.coach_doctrines (
  coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice,
  content_locale, published_at
) values (
  '33333333-0000-4000-8000-000000000002', 1,
  $json$[{"key": "draft_only", "claim": "Never published."}]$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 'en-GB', null
);

-- --- 5. coach_clients ------------------------------------------------------
-- Everyone except `a5.nocoach` is linked. `a5.nodoctrine` goes to Silent.
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, seat_state)
select
  case when u.email = 'a5.nodoctrine@keeltest.dev'
       then '33333333-0000-4000-8000-000000000002'::uuid
       else '33333333-0000-4000-8000-000000000001'::uuid end,
  u.id, 'active', now(), 'trial'
from auth.users u
where u.email like 'a5.%@keeltest.dev'
  and u.email not like '%coach%'
  and u.email <> 'a5.nocoach@keeltest.dev';

-- --- 6. student_goals ------------------------------------------------------
-- `a5.nogoal` deliberately has NO row.
insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
values
  ('22222222-0000-4000-8000-000000000001', 'fat_loss',
   'I eat at the work canteen at midday every weekday, I train Tuesday and Thursday evenings, and I cook properly only at weekends.',
   '{"cooking_time_min": 20, "no_cook_days": ["tue","thu"]}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000003', 'health',
   'Nothing special, I just want to eat better.', '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000004', 'health',
   'I work shifts and eat at odd hours.', '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000005', 'fat_loss',
   'I have breakfast at home every morning and I eat at a canteen at midday.',
   '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000006', 'fat_loss',
   'I want precise macros, 1800 kcal a day, and tell me the grams of protein at each meal. I eat three meals and I train four times a week.',
   '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000007', 'recomposition',
   'I lift four times a week and work from home.', '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000008', 'performance',
   'I race on Sundays and train six days a week.', '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000009', 'health',
   'Desk job, two children, very little time in the evening.', '{}'::jsonb, 'en-GB'),
  ('22222222-0000-4000-8000-000000000010', 'maintenance',
   'Things are going fine, I just do not want to slip.', '{}'::jsonb, 'en-GB')
on conflict (user_id) do update
  set goal = excluded.goal,
      situation = excluded.situation,
      practical_constraints = excluded.practical_constraints;

-- --- 7. the medical constraint (scenario 10) ------------------------------
delete from public.student_safety_constraints
 where user_id = '22222222-0000-4000-8000-000000000005';
insert into public.student_safety_constraints (
  user_id, kind, allergen_ref, severity, declared_by, notes, content_locale
) values (
  '22222222-0000-4000-8000-000000000005', 'allergy', 'peanut', 'medical',
  'student', 'Anaphylactic. Carries an adrenaline pen.', 'en-GB'
);

commit;

-- --- verification ---------------------------------------------------------
select u.email,
       (g.user_id is not null) as has_goal,
       g.goal,
       c.display_name as coach,
       (d.published_at is not null) as coach_published,
       (s.user_id is not null) as has_medical_constraint
from auth.users u
left join public.student_goals g on g.user_id = u.id
left join public.coach_clients cc on cc.student_user_id = u.id and cc.status = 'active'
left join public.coaches c on c.id = cc.coach_id
left join public.coach_doctrines d on d.coach_id = c.id and d.published_at is not null
left join (select distinct user_id from public.student_safety_constraints) s on s.user_id = u.id
where u.email like 'a5.%@keeltest.dev' and u.email not like '%coach%'
order by u.email;
