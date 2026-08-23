-- ===========================================================================
-- QA 01-injection / VÉRIFICATION 1V — fixture indépendante (agent 1V)
-- ===========================================================================
-- Rejoue les deux checklists (solo + foyer) sur des VALEURS À MOI. Aucune
-- valeur n'est reprise de 1A ou 1B : chaque chaîne est choisie pour ne pas
-- pouvoir apparaître par hasard dans un prompt.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/01-injection/verification-1v/2026-08-19-0100-1v-fixture.sql
--
-- Mot de passe : 1234567
-- ⚠️ ENVOI DE MAIL NEUTRALISÉ le temps de la transaction (même geste que 00-base.sql).
--
-- La saisie passe par les MÊMES portes que les écrans (RPC `keel_household_*`
-- appelées sous le rôle `authenticated` avec les claims JWT du membre), sauf
-- `student_goals` / `student_safety_constraints` / `student_body_measures` que
-- les écrans écrivent en PostgREST direct.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa1v_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

-- ---------------------------------------------------------------- nettoyage
delete from auth.users where email like 'qa1v.%@keeltest.dev';
delete from public.coaches where id = '1e000000-0000-4000-8000-0000000000c1';

-- ---------------------------------------------------------------- comptes
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.name),
  now(), now(), '', '', '', '', '', '', '', ''
from (values
  ('1e000000-0000-4000-8000-0000000000a1'::uuid, 'qa1v.coach@keeltest.dev', 'Osric Thelwall'),
  ('1e000000-0000-4000-8000-000000000001'::uuid, 'qa1v.solo@keeltest.dev',  'Zephyrine Okonkwo'),
  -- ⚠️ VOULU : le profil du maître de foyer porte « Quenneville », JAMAIS le
  -- prénom que l'écran tapera. C'est ce qui rend la ligne #1 décisive.
  ('1e000000-0000-4000-8000-000000000002'::uuid, 'qa1v.foyer@keeltest.dev', 'Quenneville')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u where u.email like 'qa1v.%@keeltest.dev';

-- ---------------------------------------------------------------- coach
insert into public.coaches (id, user_id, display_name, status, credential_type, coach_kind, trial_seat_limit)
values ('1e000000-0000-4000-8000-0000000000c1', '1e000000-0000-4000-8000-0000000000a1',
        'Osric Thelwall', 'active', 'certified_coach', 'human', 6);

update public.profiles set
  keel_role='coach', full_name='Osric Thelwall', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true
where id = '1e000000-0000-4000-8000-0000000000a1';

-- ---------------------------------------------------------------- doctrine
-- Chaque `reason` et chaque `instead` porte une chaîne introuvable ailleurs.
insert into public.coach_doctrines (
  coach_id, version, content_locale,
  beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice,
  published_at, published_by
) values (
  '1e000000-0000-4000-8000-0000000000c1', 1, 'en-GB',
  $json$[
    {"key":"name_the_plate_out_loud",
     "claim":"Every week starts with a plate you can name out loud, never with a number.",
     "rationale":"a plate you can picture is a plate you will actually cook"},
    {"key":"one_loud_vegetable",
     "claim":"One loud vegetable on every plate, and it is the first thing in the basket.",
     "rationale":"the basket decides the week, willpower does not"},
    {"key":"starch_follows_the_session",
     "claim":"On a muscle gain stretch the starch goes where the training is.",
     "rationale":"an unfuelled session is a session paid for twice",
     "goal_scope":["muscle_gain"]}
  ]$json$::jsonb,
  $json$[
    {"token":"plain_salad_dinners",
     "surface_forms":["salad only dinner","just a salad for dinner","cold salad dinner","light salad supper"],
     "reason":"a plate with nothing warm on it is a plate you leave hungry at ten",
     "instead":"EVERY dinner carries one warm element, even in July: a broth, a roasted root, or a pan-warmed grain."},
    {"token":"weekend_batch_marathon",
     "surface_forms":["sunday meal prep","batch cook the whole week","cook everything on sunday"],
     "reason":"one Sunday of eight hours buys six days of grey boxes",
     "instead":"We cook twice in the week, on the two days they already stand in that kitchen."}
  ]$json$::jsonb,
  $json$[{"term":"a loud vegetable","meaning":"a vegetable you would notice with your eyes shut"}]$json$::jsonb,
  $json$[
    {"situation":"The student ate out twice this week and calls it a failure.",
     "coach_answer":"Eating out is inside the plan. We look at the other nineteen plates.",
     "source":"interview"}
  ]$json$::jsonb,
  $json${"discouraged":[
    {"term":"breakfast cereal bar","surface_forms":["cereal bar","breakfast bar"],
     "reason":"it is a biscuit wearing a tracksuit"}
  ]}$json$::jsonb,
  $json$[{"question":"What if I hate breakfast?","answer":"Then breakfast is small and warm, not absent."}]$json$::jsonb,
  $json${"language":"English","tone":"plain, short sentences"}$json$::jsonb,
  now(), '1e000000-0000-4000-8000-0000000000a1'
);

-- ---------------------------------------------------------------- rattachements
select public.keel_attach_student_to_coach(
  '1e000000-0000-4000-8000-000000000001', '1e000000-0000-4000-8000-0000000000c1',
  'qa1v.solo@keeltest.dev', 'GB');
select public.keel_attach_student_to_coach(
  '1e000000-0000-4000-8000-000000000002', '1e000000-0000-4000-8000-0000000000c1',
  'qa1v.foyer@keeltest.dev', 'GB');

update public.profiles set
  keel_role='student', full_name='Zephyrine Okonkwo', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1971-11-02', height_cm=191,
  gender='male', activity_level='sedentary'
where id = '1e000000-0000-4000-8000-000000000001';

update public.profiles set
  keel_role='student', full_name='Quenneville', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1988-04-03', height_cm=183,
  gender='male', activity_level='on_feet'
where id = '1e000000-0000-4000-8000-000000000002';

-- ===========================================================================
-- LANE SOLO — Zephyrine
-- ===========================================================================
insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
values
  ('1e000000-0000-4000-8000-000000000001', now(), '2026-08-19', 'weight', 102.7, 'setup'),
  ('1e000000-0000-4000-8000-000000000001', now(), '2026-08-19', 'waist',  104,   'plan_card');

insert into public.student_goals (
  user_id, goal, situation, aspiration, target_weight_kg, target_pace_kg_per_week,
  content_locale, practical_constraints
) values (
  '1e000000-0000-4000-8000-000000000001', 'fat_loss',
  'I drive a night-shift lorry three nights a week',
  'Carry a full rucksack up Pen y Fan without stopping',
  88, 0.55, 'en-GB',
  $json${
    "variety": "repeat",
    "away_days": [{"day":"fri","kind":"away","slots":["dinner"]}],
    "cook_days": ["mon","fri"],
    "diet_asked": true,
    "allergy_check": {"self": true, "members": []},
    "budget_amount": 88,
    "eating_rhythm": [
      {"slot":"breakfast","size":"large"},
      {"slot":"lunch","size":"small"},
      {"slot":"dinner","size":"medium"}
    ],
    "fixed_intakes": [
      {"days":["mon","wed","fri"],"unit":"g","label":"Barleycup malt drink",
       "amount":44,"food_ref":"declared_barleycup_malt_drink","nutrition":"declared",
       "serving_grams":44,"protein_g_per_serving":7,"energy_kcal_per_serving":152}
    ],
    "cooking_time_min": 25,
    "kitchen_equipment": ["oven","microwave","freezer","air_fryer","pressure_cooker","blender"],
    "recipe_difficulty": "simple"
  }$json$::jsonb
);

insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, medication_class, diet_ref, severity, declared_by, notes, content_locale)
values
  ('1e000000-0000-4000-8000-000000000001','allergy','celeriac',null,null,'medical','student',null,'en-GB'),
  ('1e000000-0000-4000-8000-000000000001','intolerance','fructose',null,null,'strict','student',
   'cooked apple is fine, raw apple is not','en-GB'),
  ('1e000000-0000-4000-8000-000000000001','dislike','okra',null,null,'preference','student',null,'en-GB'),
  ('1e000000-0000-4000-8000-000000000001','medical',null,'warfarin',null,'medical','student',null,'en-GB'),
  ('1e000000-0000-4000-8000-000000000001','diet',null,null,'vegetarian','strict','student',null,'en-GB');

-- Séance d'activité (A8 : écran complet, aucun lecteur de prompt d'après 1A)
insert into public.student_activity_sessions (user_id, local_date, kind, duration_min, intensity, source)
values ('1e000000-0000-4000-8000-000000000001','2026-08-19','cardio',97,'hard','app');

update public.app_config set value = (select value from _qa1v_anon_key)
where key = 'edge_functions_anon_key';

commit;

select p.id, p.email, p.full_name, p.keel_role,
       (select count(*) from public.coach_clients c where c.student_user_id=p.id and c.status='active') coachs
from public.profiles p where p.email like 'qa1v.%@keeltest.dev' order by p.email;
