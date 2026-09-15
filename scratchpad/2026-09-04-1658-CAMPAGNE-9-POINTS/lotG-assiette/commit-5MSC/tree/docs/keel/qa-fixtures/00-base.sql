-- ===========================================================================
-- KEEL QA — BASE FIXTURES (campagne 2026-08-05)
-- ===========================================================================
-- Idempotent. Ne touche QUE les comptes `qa0805.%@keeltest.dev`.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/keel/qa-fixtures/00-base.sql
--
-- Ce que ce fichier fabrique :
--   Coach MARC  (doctrine PUBLIÉE, en-GB) ─ Eva (en-GB/GB), Liam (fr-FR/FR)
--   Coach DANA  (AUCUNE doctrine, fr-FR)  ─ Sam (fr-FR/FR), Zoe (en-GB/GB)
--   Kai         (élève SANS coach du tout)
--   Eva porte une composition `student_generated_meals` avec 3 plats AUJOURD'HUI.
--
-- Chaque coach garde 1 SIÈGE LIBRE (plafond d'essai = 3).
-- Mot de passe de tous les comptes : 1234567
--
-- ⚠️ L'ENVOI DE MAIL EST NEUTRALISÉ LE TEMPS DE LA TRANSACTION.
--    `on_auth_user_email_confirmed_send_onboarding` poste vers le
--    `send-welcome-email` LOCAL, qui tourne avec EMAIL_DELIVERY_ENABLED=1 et
--    une vraie clé Resend : créer un compte confirmé ENVOIE UN VRAI MAIL.
--    On ne peut pas DISABLE le trigger (`auth.users` appartient à
--    supabase_auth_admin, pas à postgres). On emprunte donc la sortie que le
--    trigger se donne lui-même : anon_key vide => "skipping ... dispatch".
--    L'écriture est DANS la transaction, donc un abandon restaure la valeur.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

-- Verrouille la ligne et mémorise la vraie valeur pour la restaurer plus bas.
create temporary table _qa0805_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;

update public.app_config set value = '' where key = 'edge_functions_anon_key';

-- ---------------------------------------------------------------- nettoyage
delete from auth.users where email like 'qa0805.%@keeltest.dev';

-- ---------------------------------------------------------------- comptes auth
-- ⚠️ LES COLONNES DE JETON DOIVENT ÊTRE '' ET JAMAIS NULL.
--    GoTrue les scanne dans des `string` Go non-nullables. Un NULL donne
--    `converting NULL to string is unsupported`, remonté au client comme
--    HTTP 500 « Database error querying schema » — le compte existe, s'affiche
--    normalement en base, et ne peut PAS se connecter. Les anciens fichiers de
--    fixtures du dépôt (docs/nutrition-pivot/qa/agent-*.sql) omettent ces
--    colonnes et fabriquent donc des comptes inutilisables par le front.
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
  now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('08050000-0000-4000-8000-0000000000a1'::uuid, 'qa0805.coach.marc@keeltest.dev', 'Marc Vasseur'),
  ('08050000-0000-4000-8000-0000000000a2'::uuid, 'qa0805.coach.dana@keeltest.dev', 'Dana Whitfield'),
  ('08050000-0000-4000-8000-000000000011'::uuid, 'qa0805.eva@keeltest.dev',        'Eva'),
  ('08050000-0000-4000-8000-000000000012'::uuid, 'qa0805.liam@keeltest.dev',       'Liam'),
  ('08050000-0000-4000-8000-000000000021'::uuid, 'qa0805.sam@keeltest.dev',        'Sam'),
  ('08050000-0000-4000-8000-000000000022'::uuid, 'qa0805.zoe@keeltest.dev',        'Zoe'),
  ('08050000-0000-4000-8000-000000000031'::uuid, 'qa0805.kai@keeltest.dev',        'Kai')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'qa0805.%@keeltest.dev';

-- ---------------------------------------------------------------- coachs
insert into public.coaches (id, user_id, display_name, status, credential_type, coach_kind, trial_seat_limit)
values
  ('08050000-0000-4000-8000-0000000000c1', '08050000-0000-4000-8000-0000000000a1',
   'Marc Vasseur', 'active', 'certified_coach', 'human', 3),
  ('08050000-0000-4000-8000-0000000000c2', '08050000-0000-4000-8000-0000000000a2',
   'Dana Whitfield', 'active', 'rd', 'human', 3);

update public.profiles set
  keel_role = 'coach', full_name = 'Marc Vasseur', locale = 'en-GB',
  timezone = 'Europe/London', country = 'GB', onboarding_completed = true
where id = '08050000-0000-4000-8000-0000000000a1';

update public.profiles set
  keel_role = 'coach', full_name = 'Dana Whitfield', locale = 'fr-FR',
  timezone = 'Europe/Paris', country = 'FR', onboarding_completed = true
where id = '08050000-0000-4000-8000-0000000000a2';

-- ---------------------------------------------------------------- rattachements
-- `keel_attach_student_to_coach` est LE chemin canonique : il pose
-- status='active' ET consent_granted_at=now() dans la même écriture, donc le
-- CHECK `coach_clients_active_requires_consent` ne peut pas être violé.
select public.keel_attach_student_to_coach(
  '08050000-0000-4000-8000-000000000011', '08050000-0000-4000-8000-0000000000c1',
  'qa0805.eva@keeltest.dev', 'GB');
select public.keel_attach_student_to_coach(
  '08050000-0000-4000-8000-000000000012', '08050000-0000-4000-8000-0000000000c1',
  'qa0805.liam@keeltest.dev', 'FR');
select public.keel_attach_student_to_coach(
  '08050000-0000-4000-8000-000000000021', '08050000-0000-4000-8000-0000000000c2',
  'qa0805.sam@keeltest.dev', 'FR');
select public.keel_attach_student_to_coach(
  '08050000-0000-4000-8000-000000000022', '08050000-0000-4000-8000-0000000000c2',
  'qa0805.zoe@keeltest.dev', 'GB');

-- ---------------------------------------------------------------- profils élèves
-- APRÈS le rattachement : l'attach n'écrit `locale` que si `keel_role` est nul
-- et n'écrit `country` que s'il est nul. Ici on FIXE les valeurs voulues.
update public.profiles set
  keel_role='student', full_name='Eva',  locale='en-GB', timezone='Europe/London',
  country='GB', onboarding_completed=true, account_status='active'
where id='08050000-0000-4000-8000-000000000011';

update public.profiles set
  keel_role='student', full_name='Liam', locale='fr-FR', timezone='Europe/Paris',
  country='FR', onboarding_completed=true, account_status='active'
where id='08050000-0000-4000-8000-000000000012';

update public.profiles set
  keel_role='student', full_name='Sam',  locale='fr-FR', timezone='Europe/Paris',
  country='FR', onboarding_completed=true, account_status='active'
where id='08050000-0000-4000-8000-000000000021';

update public.profiles set
  keel_role='student', full_name='Zoe',  locale='en-GB', timezone='Europe/London',
  country='GB', onboarding_completed=true, account_status='active'
where id='08050000-0000-4000-8000-000000000022';

-- Kai : élève SANS AUCUN coach. Aucune ligne `coach_clients`.
update public.profiles set
  keel_role='student', full_name='Kai',  locale='fr-FR', timezone='Europe/Paris',
  country='FR', onboarding_completed=true, account_status='active'
where id='08050000-0000-4000-8000-000000000031';

-- ---------------------------------------------------------------- objectifs
insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
values
  ('08050000-0000-4000-8000-000000000011', 'fat_loss',
   'Desk job, trains twice a week, eats lunch at the office canteen.',
   '{"eating_rhythm":["breakfast","lunch","dinner"],"cooks":true}'::jsonb, 'en-GB'),
  ('08050000-0000-4000-8000-000000000012', 'muscle_gain',
   'Etudiant, sale de sport 4 fois par semaine, petit budget.',
   '{"eating_rhythm":["breakfast","lunch","snack_pm","dinner"],"cooks":true}'::jsonb, 'fr-FR'),
  ('08050000-0000-4000-8000-000000000021', 'maintenance',
   'Travaille de nuit, saute souvent le petit-dejeuner.',
   '{"eating_rhythm":["lunch","dinner"],"cooks":false}'::jsonb, 'fr-FR')
on conflict (user_id) do update set
  goal = excluded.goal, situation = excluded.situation,
  practical_constraints = excluded.practical_constraints,
  content_locale = excluded.content_locale;

-- ---------------------------------------------------------------- DOCTRINE (Marc)
-- 5 convictions (dont une portée `fat_loss`), 2 interdits AVEC `instead`,
-- vocabulaire, 2 arbitrages, voix, 2 aliments deconseilles, 1 Q/R.
insert into public.coach_doctrines (
  id, coach_id, version, content_locale,
  beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice,
  published_at, published_by
) values (
  '08050000-0000-4000-8000-0000000000d1',
  '08050000-0000-4000-8000-0000000000c1', 1, 'en-GB',
  $json$[
    {"key":"three_real_meals_anchor_the_day",
     "claim":"Three real meals anchor the day. We build the plate before we take anything off it.",
     "rationale":"what predicts results is regularity, not perfection"},
    {"key":"protein_and_something_that_grew",
     "claim":"Every plate starts with protein and something that grew. The rest follows.",
     "rationale":"fullness is built, not resisted"},
    {"key":"hunger_is_information",
     "claim":"Hunger is information, not a test of character. If the plan leaves you hungry, the plan is wrong, not you.",
     "rationale":null},
    {"key":"one_change_held_a_fortnight",
     "claim":"One change, held for a fortnight, beats five changes held for four days.",
     "rationale":null},
    {"key":"eat_before_you_train",
     "claim":"On a fat loss stretch we still eat before we train. The deficit comes from the day, never from the session.",
     "rationale":"an unfed session costs muscle and costs the session",
     "goal_scope":["fat_loss"]}
  ]$json$::jsonb,
  $json$[
    {"token":"intermittent_fasting",
     "surface_forms":["intermittent fasting","16:8","fasting window","eating window","time-restricted eating","skip breakfast","skipping breakfast","jeune intermittent","sauter le petit-dejeuner"],
     "reason":"it moves the problem to the evening and teaches you to override hunger instead of feeding it",
     "instead":"Marc keeps the three meals and builds breakfast first. If your mornings are rushed we shrink breakfast rather than drop it."},
    {"token":"calorie_counting",
     "surface_forms":["calorie counting","count calories","counting calories","kcal target","macros app","compter les calories","compter les kcal"],
     "reason":"a number on a screen replaces the signal you are here to learn to read",
     "instead":"Marc counts plates, not calories: protein, something that grew, and a starch sized to the day."}
  ]$json$::jsonb,
  $json$[
    {"term":"a built plate","meaning":"protein + a vegetable + a starch sized to the day"},
    {"term":"a held change","meaning":"one single change kept for fourteen days before anything else moves"}
  ]$json$::jsonb,
  $json$[
    {"situation":"The student ate out twice this week and calls it a failure.",
     "coach_answer":"Eating out is in the plan, not a breach of it. We look at the other nineteen meals.",
     "source":"interview"},
    {"situation":"The student asks to cut carbs entirely to speed up fat loss.",
     "coach_answer":"We size the starch to the day rather than remove it. The stretch you can hold beats the one you abandon in ten days.",
     "source":"interview",
     "goal_scope":["fat_loss"]}
  ]$json$::jsonb,
  $json${"discouraged":[
    {"term":"energy drink","surface_forms":["energy drink","red bull","monster","boisson energisante"],
     "reason":"it buys you an afternoon and sells you the next morning"},
    {"term":"meal replacement shake","surface_forms":["meal replacement","shake instead of lunch","substitut de repas"],
     "reason":"it replaces the meal you are learning to build"}
  ]}$json$::jsonb,
  $json$[
    {"question":"Can I have a glass of wine with dinner?",
     "answer":"Yes, and we put it in the plan rather than pretend it away. One or two in the week, with food, not instead of it.",
     "source":"coach_edit"}
  ]$json$::jsonb,
  $json${"address":"you","length":"short","emojis":"none","language":"English"}$json$::jsonb,
  now(), '08050000-0000-4000-8000-0000000000a1'
);

-- Coach DANA : AUCUNE ligne dans `coach_doctrines`. C'est le cas "sans doctrine".

-- ---------------------------------------------------------------- composition d'Eva
-- Plats du JOUR : le jeton de jour est calculé, pas ecrit en dur.
-- Tous les `term` d'ingredient correspondent a un `food_items.label` exact
-- (verifie par la requete de controle en fin de fichier).
delete from public.student_generated_meals
 where user_id = '08050000-0000-4000-8000-000000000011';

-- LA FENÊTRE EST OBLIGATOIRE DEPUIS `20260807090000_meal_plan_window`. Elle
-- démarre AUJOURD'HUI, dans le même fuseau que le jeton de jour calculé plus
-- bas: une fixture dont la fenêtre ne contiendrait pas ses propres plats serait
-- une fixture qui teste l'écran vide.
insert into public.student_generated_meals (
  id, user_id, starts_on, duration_days, scope, mode, meal_slot, servings,
  context, content_locale,
  pantry, dishes, preparations, cooking_sessions, shopping_list, generated_from
)
select
  '08050000-0000-4000-8000-0000000000e1',
  '08050000-0000-4000-8000-000000000011',
  d.start_date, 7::smallint,
  'several_days', 'to_shop', null, 1,
  'Office canteen at midday two days a week. Cooks on Wednesday evening.',
  'en-GB',
  '[]'::jsonb,
  -- dishes
  jsonb_build_array(
    jsonb_build_object(
      'title','Greek yogurt with oats, banana and almonds',
      'slot','breakfast', 'day', d.today,
      'method','Stir the oats into the yogurt, top with sliced banana and chopped almonds.',
      'why','A protein anchor at breakfast so the morning does not run on coffee alone.',
      'honours_belief_keys', jsonb_build_array('three_real_meals_anchor_the_day','protein_and_something_that_grew'),
      'uses','[]'::jsonb,
      'ingredients', jsonb_build_array(
        jsonb_build_object('term','Greek yogurt','quantity','200 g','in_pantry',false),
        jsonb_build_object('term','Oats','quantity','60 g','in_pantry',false),
        jsonb_build_object('term','Banana','quantity','1','in_pantry',false),
        jsonb_build_object('term','Almonds','quantity','20 g','in_pantry',false))
    ),
    jsonb_build_object(
      'title','Chicken, brown rice and broccoli bowl',
      'slot','lunch', 'day', d.today,
      'method','Reheat the roast chicken and rice, steam the broccoli, finish with olive oil and lemon.',
      'why','The built plate, made from Wednesday evening cooking so midday takes four minutes.',
      'honours_belief_keys', jsonb_build_array('protein_and_something_that_grew'),
      'uses', jsonb_build_array(jsonb_build_object('preparationId','prep_chicken_rice','servings',1)),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term','Broccoli','quantity','150 g','in_pantry',false),
        jsonb_build_object('term','Extra virgin olive oil','quantity','1 tbsp','in_pantry',false),
        jsonb_build_object('term','Lemon','quantity','half','in_pantry',false))
    ),
    jsonb_build_object(
      'title','Salmon with sweet potato and spinach',
      'slot','dinner', 'day', d.today,
      'method','Roast the salmon and sweet potato together, wilt the spinach in the pan at the end.',
      'why','Fatty fish once in the week, and a starch sized to a training day.',
      'honours_belief_keys', jsonb_build_array('protein_and_something_that_grew','eat_before_you_train'),
      'uses','[]'::jsonb,
      'ingredients', jsonb_build_array(
        jsonb_build_object('term','Salmon','quantity','150 g','in_pantry',false),
        jsonb_build_object('term','Sweet potato','quantity','200 g','in_pantry',false),
        jsonb_build_object('term','Spinach','quantity','100 g','in_pantry',false),
        jsonb_build_object('term','Extra virgin olive oil','quantity','1 tbsp','in_pantry',false))
    ),
    jsonb_build_object(
      'title','Chicken wrap with tomato and cucumber',
      'slot','lunch', 'day', d.tomorrow,
      'method','Shred the roast chicken into wholemeal bread with sliced tomato and cucumber.',
      'why','One cooking, a second meal that does not look like the first.',
      'honours_belief_keys', jsonb_build_array('protein_and_something_that_grew'),
      'uses', jsonb_build_array(jsonb_build_object('preparationId','prep_chicken_rice','servings',1)),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term','Wholemeal bread','quantity','2 slices','in_pantry',false),
        jsonb_build_object('term','Tomato','quantity','1','in_pantry',false),
        jsonb_build_object('term','Cucumber','quantity','80 g','in_pantry',false))
    )
  ),
  -- preparations
  jsonb_build_array(
    jsonb_build_object(
      'id','prep_chicken_rice', 'title','Roast chicken and brown rice, batch',
      'servingsMade', 3, 'cookOn', d.today,
      'method','Roast the chicken breasts with olive oil, cook the rice alongside, cool and box in three.',
      'ingredients', jsonb_build_array(
        jsonb_build_object('term','Chicken breast','quantity','600 g','in_pantry',false),
        jsonb_build_object('term','Brown rice','quantity','240 g dry','in_pantry',false),
        jsonb_build_object('term','Extra virgin olive oil','quantity','2 tbsp','in_pantry',false)))
  ),
  -- cooking_sessions
  jsonb_build_array(
    jsonb_build_object('day', d.today, 'preparationIds', jsonb_build_array('prep_chicken_rice'),
      'runThrough','Oven on, chicken in with the oil. Rice on the hob while it roasts. Box in three once cool.')
  ),
  -- shopping_list
  jsonb_build_array(
    jsonb_build_object('term','Chicken breast','quantity','600 g','aisle','protein'),
    jsonb_build_object('term','Salmon','quantity','150 g','aisle','protein'),
    jsonb_build_object('term','Greek yogurt','quantity','1 pot','aisle','dairy'),
    jsonb_build_object('term','Broccoli','quantity','1 head','aisle','produce'),
    jsonb_build_object('term','Sweet potato','quantity','400 g','aisle','produce'),
    jsonb_build_object('term','Spinach','quantity','1 bag','aisle','produce'),
    jsonb_build_object('term','Brown rice','quantity','500 g','aisle','grains'),
    jsonb_build_object('term','Oats','quantity','500 g','aisle','grains'),
    jsonb_build_object('term','Almonds','quantity','200 g','aisle','pantry')
  ),
  jsonb_build_object('fixture','qa0805','seeded_at', now(), 'today_token', d.today)
from (
  select
    lower(to_char((now() at time zone 'Europe/London')::date, 'Dy'))                 as today,
    lower(to_char((now() at time zone 'Europe/London')::date + 1, 'Dy'))             as tomorrow,
    (now() at time zone 'Europe/London')::date                                        as start_date
) as d;

-- ---------------------------------------------------------------- restauration
update public.app_config a
   set value = k.value
  from _qa0805_anon_key k
 where a.key = 'edge_functions_anon_key';

commit;
