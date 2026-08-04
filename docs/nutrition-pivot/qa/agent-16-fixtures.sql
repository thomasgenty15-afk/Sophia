-- ===========================================================================
-- QA AGENT 16 — seed for the integral week ("Julie")
-- ===========================================================================
-- Idempotent. Only touches rows prefixed a16 / a16.*@keeltest.dev.
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < seed.sql
--
-- Julie  : Europe/Paris, fat_loss, canteen at midday, en-GB, opted in.
-- Nora   : same coach, generates a plan and NEVER adopts it (H3 probe).
-- Coach  : Marc, doctrine PUBLISHED (5 convictions, 2 interdits with `instead`,
--          vocabulary, 2 arbitrations, short voice). The doctrine deliberately
--          contains `peanut_butter_breakfast`: it is the collision the medical
--          lock must survive once Julie declares a peanut allergy on Wednesday.
-- ===========================================================================

begin;

delete from auth.users where email like 'a16.%@keeltest.dev';

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
  ('a1600000-0000-4000-8000-000000000001'::uuid, 'a16.coach.marc@keeltest.dev'),
  ('a1600000-0000-4000-8000-000000000011'::uuid, 'a16.julie@keeltest.dev'),
  ('a1600000-0000-4000-8000-000000000012'::uuid, 'a16.nora@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a16.%@keeltest.dev';

-- profiles ------------------------------------------------------------------
-- `handle_new_user()` has already created the rows; we set the KEEL fields.
update public.profiles set
  keel_role = 'coach', full_name = 'Marc', locale = 'en-GB', timezone = 'Europe/Paris'
where id = 'a1600000-0000-4000-8000-000000000001';

update public.profiles set
  keel_role = 'student', full_name = 'Julie', locale = 'en-GB',
  timezone = 'Europe/Paris', phone_number = '+33600000916',
  phone_verified_at = now(), phone_invalid = false,
  whatsapp_opted_in = true, whatsapp_opted_out_at = null,
  onboarding_completed = true
where id = 'a1600000-0000-4000-8000-000000000011';

update public.profiles set
  keel_role = 'student', full_name = 'Nora', locale = 'en-GB',
  timezone = 'Europe/Paris', phone_number = '+33600000917',
  phone_verified_at = now(), phone_invalid = false,
  whatsapp_opted_in = true, whatsapp_opted_out_at = null,
  onboarding_completed = true
where id = 'a1600000-0000-4000-8000-000000000012';

-- coach ---------------------------------------------------------------------
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values ('a1600000-0000-4000-8000-0000000000aa', 'a1600000-0000-4000-8000-000000000001', 'Marc', 'active', 50)
on conflict (id) do update set display_name = excluded.display_name,
                               trial_seat_limit = excluded.trial_seat_limit;

delete from public.coach_doctrines where coach_id = 'a1600000-0000-4000-8000-0000000000aa';
insert into public.coach_doctrines (
  coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice,
  content_locale, published_at, published_by
) values (
  'a1600000-0000-4000-8000-0000000000aa', 1,
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
  'en-GB', now(), 'a1600000-0000-4000-8000-000000000001'
);

insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, seat_state, started_at)
values
  ('a1600000-0000-4000-8000-0000000000aa', 'a1600000-0000-4000-8000-000000000011', 'active', now(), 'trial', now()),
  ('a1600000-0000-4000-8000-0000000000aa', 'a1600000-0000-4000-8000-000000000012', 'active', now(), 'trial', now());

-- Julie's goal and situation (typed by her in the app on Monday morning) ------
insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
values
  ('a1600000-0000-4000-8000-000000000011', 'fat_loss',
   'I eat at the work canteen every weekday at midday, I train Tuesday and Thursday evenings, and I only really cook at the weekend.',
   '{"cooking_time_min": 20, "canteen_lunch": true}'::jsonb, 'en-GB'),
  ('a1600000-0000-4000-8000-000000000012', 'fat_loss',
   'I work from home and eat whatever is in the fridge.', '{}'::jsonb, 'en-GB')
on conflict (user_id) do update set goal = excluded.goal, situation = excluded.situation;

commit;

select 'seeded' as step, p.full_name, p.id, p.keel_role, p.timezone, p.locale,
       p.phone_number, p.whatsapp_opted_in
from public.profiles p
where p.id in ('a1600000-0000-4000-8000-000000000001',
               'a1600000-0000-4000-8000-000000000011',
               'a1600000-0000-4000-8000-000000000012')
order by p.keel_role, p.full_name;
