-- ===========================================================================
-- ÉTAPE ③ « plusieurs bouches, trois modes de cuisson » — FIXTURE PROPRE
-- ===========================================================================
-- ⚠️ UN FOYER À MOI, ET C'EST OBLIGATOIRE. Deux lanes qui écrivent la même
-- fixture se contaminent (mesuré par 06 sur le foyer de 1V). Celui-ci ne
-- partage RIEN avec `1e000000-…-002` (1V) ni `1e000000-…-012` (06).
--
-- ── LE FOYER, CONSTRUIT POUR QUE LA DIVERGENCE SOIT CALCULÉE, PAS ESPÉRÉE ──
-- `divergingMembers` (index.ts:3074) lève le barreau ② quand
-- `servingConflicts` OU `dietDiverges` mord. Les directions sont lues dans
-- `SERVING_DIRECTION` (household_portions.ts:233) :
--   fat_loss    → protein=full(4)   starch=smaller(1) vegetables=larger(5)
--   muscle_gain → protein=larger(5) starch=larger(5)  vegetables=balanced(3)
--   neutre      → les trois à balanced(3)
--   mineur sans objectif → CHILD_DIRECTION → AUCUN axe nommé (null)
-- `servingConflicts` ne mord qu'au-dessus de `balanced`.
--
--   · Aurèle    — maître, AVEC compte, `fat_loss`, omnivore
--                 ⇒ vegetables=larger(5) au-dessus du plafond de la table (3)
--                 ⇒ DIVERGE par le service
--   · Solveig   — SANS compte, adulte, `muscle_gain`, omnivore,
--                 ALLERGIE MÉDICALE au sésame (household_member_allergies)
--                 ⇒ protein=larger(5) au-dessus du plafond du régime (full=4)
--                 ⇒ DIVERGE par le régime (`dietDiverges`)
--   · Marceline — SANS compte, adulte, `muscle_gain`, omnivore,
--                 DÉGOÛT: fenouil (household_member_restrictions)
--                 ⇒ DIVERGE par le régime, comme Solveig
--   · Théodule  — MINEUR, 9 ans, aucun objectif, VÉGANE
--                 ⇒ porte le régime le PLUS STRICT de la table: la casserole
--                    commune descend au végane pour tout le monde.
--                    Ne diverge pas (son régime EST le plat commun).
--
-- ⇒ 3 bouches divergentes sur 4 ⇒ `ONE_SESSION_LINES_MANY` (le pluriel).
--
-- ⚠️ AUCUNE COLLISION ALLERGÈNE↔HABITUDE↔ENVIE. 1V a mesuré qu'une telle
-- collision rend 422 `empty_meal` (verrou binaire, meal_generation.ts:4354) et
-- qu'AUCUN plan ne sort. Ce lot doit mesurer des ASSIETTES: l'habitude et
-- l'envie ne nomment ni sésame ni fenouil. Le sésame est en revanche un
-- allergène *végane* (tahini, huile, graines) — la casserole descendue au
-- végane pousse naturellement vers lui, c'est donc une vraie épreuve.
--
-- ⚠️ TEMPS DE CUISINE: 2 jours × 50 min = 100 min/sem ≥ 90
-- (`SEPARATE_DISH_MIN_WEEKLY_MINUTES`) — sans ça le barreau ② est FORCÉ à
-- `one_dish` par le temps et les trois modes seraient indistinguables pour une
-- raison qui n'a rien à voir avec le mode.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/03-foyer-modes/2026-08-19-0330-3a-fixture-foyer-modes.sql
--
-- Mot de passe : 1234567
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '3a000000-0000-4000-8000-000000000001'
\set coach '1e000000-0000-4000-8000-0000000000c1'

begin;

create temporary table _qa3a_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

delete from auth.users where email = 'qa3a.foyer@keeltest.dev';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) values (
  :'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qa3a.foyer@keeltest.dev', extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Aurele Ducharme"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u where u.email = 'qa3a.foyer@keeltest.dev';

update public.app_config set value = (select value from _qa3a_anon_key)
where key = 'edge_functions_anon_key';

commit;

-- ── rattachement au coach déjà publié (doctrine `Osric Thelwall`, en-GB) ────
select public.keel_attach_student_to_coach(
  :'owner', :'coach', 'qa3a.foyer@keeltest.dev', 'GB');

update public.profiles set
  keel_role='student', full_name='Aurele Ducharme', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1987-04-02', height_cm=181,
  gender='male', activity_level='sedentary'
where id = :'owner';

-- ===========================================================================
-- LE FOYER — monté par les RPC que les écrans appellent
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated","aud":"authenticated"}';

select public.keel_household_create('Ducharme Mill') as created;

-- ── Aurèle : le maître, AVEC compte, fat_loss ──────────────────────────────
select public.keel_household_set_member_name(
  (select member_id from public.household_members where user_id = :'owner'),
  'Aurele') as renamed;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where user_id = :'owner'),
  181, 92, 'male', 'sedentary') as body_owner;
select public.keel_household_set_member_goal(
  (select member_id from public.household_members where user_id = :'owner'),
  'fat_loss') as goal_owner;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where user_id = :'owner'),
  'omnivore') as diet_owner;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where user_id = :'owner'),
  $j$[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"large"}]$j$::jsonb
) as rhythm_owner;
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where user_id = :'owner'),
  $j$[]$j$::jsonb,
  'eats his dinner very late on Thursdays') as habits_owner;

-- ── Solveig : adulte SANS COMPTE, muscle_gain, ALLERGIE MÉDICALE au sésame ──
select public.keel_household_add_member('Solveig', '1992-11-08', 'muscle_gain') as add_solveig;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Solveig'),
  163, 55, 'female', 'trains_hard') as body_solveig;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Solveig'),
  'omnivore') as diet_solveig;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Solveig'),
  $j$[{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_solveig;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Solveig'),
  'sesame') as allergy_solveig;

-- ── Marceline : adulte SANS COMPTE, muscle_gain, DÉGOÛT: fenouil ───────────
select public.keel_household_add_member('Marceline', '1979-06-21', 'muscle_gain') as add_marceline;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Marceline'),
  170, 74, 'female', 'on_feet') as body_marceline;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Marceline'),
  'omnivore') as diet_marceline;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Marceline'),
  $j$[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"large"}]$j$::jsonb
) as rhythm_marceline;
select public.keel_household_add_restriction(
  (select member_id from public.household_members where first_name='Marceline'),
  'fennel') as dislike_marceline;

-- ── Théodule : MINEUR de 9 ans, aucun objectif, VÉGANE ─────────────────────
select public.keel_household_add_member('Theodule', '2017-03-30', null) as add_theodule;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Theodule'),
  134, 29, 'male', 'on_feet') as body_theodule;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Theodule'),
  'vegan') as diet_theodule;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Theodule'),
  $j$[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_theodule;

-- L'envie de la semaine — anonyme par conception, et SANS allergène.
select public.keel_household_submit_envy(
  '2026-08-17',
  'the house is after something smoky and slow-cooked this week') as envy;

reset role;
commit;

-- ── ce que les écrans écrivent en PostgREST direct ─────────────────────────
-- ⚠️ 2 jours de cuisine × 50 min = 100 min/sem, au-dessus du seuil de 90 de
-- `SEPARATE_DISH_MIN_WEEKLY_MINUTES`. Sous le seuil, `one_dish` serait FORCÉ
-- et les trois modes seraient indistinguables pour la mauvaise raison.
insert into public.student_goals (user_id, goal, situation, aspiration, target_weight_kg,
  target_pace_kg_per_week, content_locale, practical_constraints)
values (:'owner','fat_loss',
  'Four of us at the table and only one oven',
  'Row the length of Coniston without stopping', 84, 0.4, 'en-GB',
  $json${
    "variety":"varied",
    "cook_days":["wed","sat"],
    "diet_asked":true,
    "budget_amount":115,
    "eating_rhythm":[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"large"}],
    "cooking_time_min":50,
    "kitchen_equipment":["oven","stovetop","freezer"],
    "recipe_difficulty":"keen"
  }$json$::jsonb)
on conflict (user_id) do update set
  goal=excluded.goal, situation=excluded.situation, aspiration=excluded.aspiration,
  target_weight_kg=excluded.target_weight_kg,
  target_pace_kg_per_week=excluded.target_pace_kg_per_week,
  practical_constraints = public.student_goals.practical_constraints || excluded.practical_constraints;

-- ── LE FOYER, RELU ─────────────────────────────────────────────────────────
select m.first_name, m.role, m.user_id is not null as has_account, m.birth_date,
       m.goal, m.diet,
       b.height_cm, b.weight_kg,
       (select string_agg(label, ',') from public.household_member_allergies a where a.member_id=m.member_id) as allergies,
       (select string_agg(label, ',') from public.household_member_restrictions r where r.member_id=m.member_id) as degouts
from public.household_members m
left join public.household_member_bodies b on b.member_id = m.member_id
where m.household_id = (select household_id from public.household_members where user_id = :'owner')
order by m.joined_at;
