-- ===========================================================================
-- AGENT 2A — étape ② « pondération », lane SOLO (`generate-meal-v1`).
-- ===========================================================================
-- Cinq élèves, UN coach. Les cinq partagent la même doctrine, le même pays, le
-- même fuseau et la même langue : tout ce que la question de pondération ne
-- fait pas varier est tenu constant, pour qu'un écart de sortie n'ait qu'une
-- cause possible.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/02-ponderation-solo/harness/2026-08-19-0110-2a-fixture.sql
--
-- Mot de passe : 1234567. Envoi de mail neutralisé le temps de la transaction.
--
-- ⚠️ CHAQUE CHAÎNE SAISIE EST INTROUVABLE PAR HASARD. C'est ce qui permet de
-- chercher un effet dans une sortie sans écrire un matcher.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa2a_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

delete from auth.users where email like 'qa2a.%@keeltest.dev';
delete from public.coaches where id = '2a000000-0000-4000-8000-0000000000c1';

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
  ('2a000000-0000-4000-8000-0000000000a1'::uuid, 'qa2a.coach@keeltest.dev', 'Bertrande Ashgrove'),
  ('2a000000-0000-4000-8000-000000000001'::uuid, 'qa2a.s1@keeltest.dev', 'Wilhelmina Trescothick'),
  ('2a000000-0000-4000-8000-000000000002'::uuid, 'qa2a.s2@keeltest.dev', 'Barnabas Quilligan'),
  ('2a000000-0000-4000-8000-000000000003'::uuid, 'qa2a.s3@keeltest.dev', 'Isolde Fennimore'),
  ('2a000000-0000-4000-8000-000000000004'::uuid, 'qa2a.s4@keeltest.dev', 'Cuthbert Warrilow'),
  ('2a000000-0000-4000-8000-000000000005'::uuid, 'qa2a.s5@keeltest.dev', 'Ottoline Grimsdyke')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u where u.email like 'qa2a.%@keeltest.dev';

insert into public.coaches (id, user_id, display_name, status, credential_type, coach_kind, trial_seat_limit)
values ('2a000000-0000-4000-8000-0000000000c1', '2a000000-0000-4000-8000-0000000000a1',
        'Bertrande Ashgrove', 'active', 'certified_coach', 'human', 12);

update public.profiles set
  keel_role='coach', full_name='Bertrande Ashgrove', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true
where id = '2a000000-0000-4000-8000-0000000000a1';

-- ---------------------------------------------------------------- doctrine
-- Deux interdits, choisis pour être CONTREDITS par une consigne écrite (S3) et
-- par une envie du moment (S4).
insert into public.coach_doctrines (
  coach_id, version, content_locale,
  beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice,
  published_at, published_by
) values (
  '2a000000-0000-4000-8000-0000000000c1', 1, 'en-GB',
  $json$[
    {"key":"a_warm_anchor_every_evening",
     "claim":"Every evening plate carries one warm anchor, even in August.",
     "rationale":"a cold plate at night is a cupboard raid at eleven"},
    {"key":"the_basket_decides_the_week",
     "claim":"The basket decides the week; willpower is not a plan.",
     "rationale":"what is not bought is not eaten"}
  ]$json$::jsonb,
  $json$[
    {"token":"cold_salad_dinners",
     "surface_forms":["cold salad dinner","salad only dinner","just a salad for dinner","no cooking at night"],
     "reason":"a plate with nothing warm on it is a plate you leave hungry at ten",
     "instead":"EVERY dinner carries one warm element: a broth, a roasted root, or a pan-warmed grain."},
    {"token":"weekend_batch_marathon",
     "surface_forms":["sunday meal prep","batch cook the whole week","cook everything on sunday"],
     "reason":"one Sunday of eight hours buys six days of grey boxes",
     "instead":"We cook twice in the week, on the two days they already stand in that kitchen."}
  ]$json$::jsonb,
  $json$[{"term":"a warm anchor","meaning":"the one hot thing the evening plate is built around"}]$json$::jsonb,
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
  now(), '2a000000-0000-4000-8000-0000000000a1'
);

-- ---------------------------------------------------------------- rattachements
select public.keel_attach_student_to_coach(u.id, '2a000000-0000-4000-8000-0000000000c1', u.email, 'GB')
from auth.users u where u.email like 'qa2a.s%@keeltest.dev';

-- ===========================================================================
-- SCÉNARIO 1 — TOUT REMPLI
-- ===========================================================================
update public.profiles set
  keel_role='student', full_name='Wilhelmina Trescothick', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1989-03-14', height_cm=168,
  gender='female', activity_level='on_feet'
where id = '2a000000-0000-4000-8000-000000000001';

insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
values
  ('2a000000-0000-4000-8000-000000000001', now(), '2026-08-18', 'weight', 61.4, 'setup'),
  ('2a000000-0000-4000-8000-000000000001', now(), '2026-08-18', 'waist',  74,   'plan_card');

insert into public.student_goals (
  user_id, goal, situation, aspiration, target_weight_kg, target_pace_kg_per_week,
  content_locale, practical_constraints
) values (
  '2a000000-0000-4000-8000-000000000001', 'muscle_gain',
  'I work two late shifts at the depot every week',
  'Carry my own kayak down to the water by spring',
  66, 0.25, 'en-GB',
  $json${
    "variety": "varied",
    "away_days": [{"day":"fri","kind":"away","slots":["lunch"]}],
    "cook_days": ["thu","sat"],
    "diet_asked": true,
    "budget_amount": 63,
    "eating_rhythm": [
      {"slot":"breakfast","size":"small"},
      {"slot":"lunch","size":"large"},
      {"slot":"dinner","size":"medium"}
    ],
    "fixed_intakes": [
      {"days":["mon","tue","wed","thu","fri","sat","sun"],"unit":"g",
       "label":"Vanilla whey shake","amount":31,
       "food_ref":"declared_vanilla_whey_shake","nutrition":"declared",
       "serving_grams":31,"protein_g_per_serving":24,"energy_kcal_per_serving":118}
    ],
    "cooking_time_min": 45,
    "kitchen_equipment": ["oven","stovetop","microwave","freezer"],
    "recipe_difficulty": "keen",
    "food_preferences": [
      "never put aubergine in my plan",
      "they like oats at breakfast"
    ],
    "food_preferences_origin": {
      "never put aubergine in my plan": {"item":"","at":"2026-08-15","source":"written"},
      "they like oats at breakfast": {"item":"2a000000-0000-4000-8000-0000000000f1","at":"2026-08-12","source":"memory"}
    }
  }$json$::jsonb
);

insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, substance_ref, medication_class, diet_ref, severity, declared_by, content_locale)
values
  ('2a000000-0000-4000-8000-000000000001','allergy','sesame',null,null,null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000001','intolerance',null,'lactose',null,null,'strict','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000001','dislike','beetroot',null,null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000001','medical',null,null,'levothyroxine',null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000001','diet',null,null,null,'pescatarian','strict','student','en-GB');

-- ===========================================================================
-- SCÉNARIO 2 — MINIMUM VITAL
-- ===========================================================================
-- Aucun corps, aucune contrainte, aucun régime, aucun budget, aucun temps,
-- aucun équipement DÉCLARÉ (la clé est absente : « on ne lui a rien demandé »),
-- aucun rythme. La question est le SILENCE.
update public.profiles set
  keel_role='student', full_name='Barnabas Quilligan', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date=null, height_cm=null,
  gender=null, activity_level=null
where id = '2a000000-0000-4000-8000-000000000002';

insert into public.student_goals (user_id, goal, content_locale, practical_constraints)
values ('2a000000-0000-4000-8000-000000000002', 'maintenance', 'en-GB', '{}'::jsonb);

-- ===========================================================================
-- SCÉNARIO 3 — CONTRADICTIONS VOLONTAIRES (quatre collisions construites)
-- ===========================================================================
--   ① l'ENVIE du moment réclame l'ALLERGÈNE MÉDICAL (tahini/sesame) ;
--   ② la même envie réclame ce que le RÉGIME interdit (poulet, végétarien) ;
--   ③ la CONSIGNE ÉCRITE réclame un INTERDIT du coach (dîner froid) ;
--   ④ le GOÛT CONFIRMÉ réclame le DÉGOÛT déclaré (beetroot).
update public.profiles set
  keel_role='student', full_name='Isolde Fennimore', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1989-03-14', height_cm=168,
  gender='female', activity_level='on_feet'
where id = '2a000000-0000-4000-8000-000000000003';

insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
values
  ('2a000000-0000-4000-8000-000000000003', now(), '2026-08-18', 'weight', 61.4, 'setup'),
  ('2a000000-0000-4000-8000-000000000003', now(), '2026-08-18', 'waist',  74,   'plan_card');

insert into public.student_goals (
  user_id, goal, content_locale, practical_constraints
) values (
  '2a000000-0000-4000-8000-000000000003', 'fat_loss', 'en-GB',
  $json${
    "cook_days": ["thu"],
    "diet_asked": true,
    "budget_amount": 70,
    "eating_rhythm": [
      {"slot":"breakfast","size":"small"},
      {"slot":"lunch","size":"medium"},
      {"slot":"dinner","size":"large"}
    ],
    "cooking_time_min": 40,
    "kitchen_equipment": ["oven","stovetop","microwave","freezer"],
    "food_preferences": [
      "dinner should be a cold salad, nothing warm, I cannot face a hot plate at night",
      "beetroot is what makes a salad worth eating"
    ],
    "food_preferences_origin": {
      "dinner should be a cold salad, nothing warm, i cannot face a hot plate at night": {"item":"","at":"2026-08-16","source":"written"},
      "beetroot is what makes a salad worth eating": {"item":"2a000000-0000-4000-8000-0000000000f3","at":"2026-08-11","source":"memory"}
    }
  }$json$::jsonb
);

insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, substance_ref, medication_class, diet_ref, severity, declared_by, content_locale)
values
  ('2a000000-0000-4000-8000-000000000003','allergy','sesame',null,null,null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000003','dislike','beetroot',null,null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000003','diet',null,null,null,'vegetarian','strict','student','en-GB');

-- ===========================================================================
-- SCÉNARIO 4 — TEMPS ET ARGENT AU PLANCHER
-- ===========================================================================
-- Un seul jour de cuisine, 15 minutes, 18 de budget, CINQ moments par jour,
-- ni four ni congélateur — et une envie qui demande exactement l'inverse.
update public.profiles set
  keel_role='student', full_name='Cuthbert Warrilow', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1979-06-02', height_cm=181,
  gender='male', activity_level='on_feet'
where id = '2a000000-0000-4000-8000-000000000004';

insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
values ('2a000000-0000-4000-8000-000000000004', now(), '2026-08-18', 'weight', 88.2, 'setup');

insert into public.student_goals (
  user_id, goal, situation, content_locale, practical_constraints
) values (
  '2a000000-0000-4000-8000-000000000004', 'fat_loss',
  'I am on a hospital ward, twelve-hour shifts, four days a week', 'en-GB',
  $json${
    "variety": "repeat",
    "cook_days": ["sat"],
    "budget_amount": 18,
    "eating_rhythm": [
      {"slot":"breakfast","size":"small"},
      {"slot":"snack_am","size":"small"},
      {"slot":"lunch","size":"medium"},
      {"slot":"snack_pm","size":"small"},
      {"slot":"dinner","size":"large"}
    ],
    "cooking_time_min": 15,
    "kitchen_equipment": ["stovetop","microwave"],
    "recipe_difficulty": "simple"
  }$json$::jsonb
);

-- ===========================================================================
-- SCÉNARIO 5 — BEAUCOUP D'EXCLUSIONS
-- ===========================================================================
-- Neuf lignes, trois sévérités, un régime végane. Le cas où la LISTE PLATE
-- coûte le plus : trois dégoûts y sont rendus comme des allergies médicales.
update public.profiles set
  keel_role='student', full_name='Ottoline Grimsdyke', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1966-01-20', height_cm=159,
  gender='female', activity_level='sedentary'
where id = '2a000000-0000-4000-8000-000000000005';

insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
values ('2a000000-0000-4000-8000-000000000005', now(), '2026-08-18', 'weight', 70.9, 'setup');

insert into public.student_goals (
  user_id, goal, aspiration, content_locale, practical_constraints
) values (
  '2a000000-0000-4000-8000-000000000005', 'maintenance',
  'Walk the Ridgeway end to end in the spring', 'en-GB',
  $json${
    "variety": "varied",
    "cook_days": ["thu","sat"],
    "diet_asked": true,
    "budget_amount": 55,
    "eating_rhythm": [
      {"slot":"breakfast","size":"medium"},
      {"slot":"lunch","size":"medium"},
      {"slot":"dinner","size":"medium"}
    ],
    "cooking_time_min": 50,
    "kitchen_equipment": ["oven","stovetop","microwave","freezer"],
    "recipe_difficulty": "keen"
  }$json$::jsonb
);

insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, substance_ref, medication_class, diet_ref, severity, declared_by, content_locale)
values
  ('2a000000-0000-4000-8000-000000000005','allergy','peanut',null,null,null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','allergy','shellfish',null,null,null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','allergy','mustard',null,null,null,'strict','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','intolerance',null,'gluten',null,null,'strict','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','intolerance',null,'fructose',null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','dislike','coriander',null,null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','dislike','olive',null,null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','dislike','aubergine',null,null,null,'preference','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','medical',null,null,'warfarin',null,'medical','student','en-GB'),
  ('2a000000-0000-4000-8000-000000000005','diet',null,null,null,'vegan','strict','student','en-GB');

update public.app_config set value = (select value from _qa2a_anon_key)
where key = 'edge_functions_anon_key';

commit;

select p.email, p.full_name, p.height_cm, g.goal,
       (select count(*) from public.student_safety_constraints s
         where s.user_id=p.id and s.status='active') contraintes,
       (select count(*) from public.coach_clients c
         where c.student_user_id=p.id and c.status='active') coachs
from public.profiles p
left join public.student_goals g on g.user_id = p.id
where p.email like 'qa2a.s%@keeltest.dev' order by p.email;
