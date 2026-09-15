-- ===========================================================================
-- ÉTAPE ⑤ « le plan est-il bon POUR TOUT LE MONDE ? » — FIXTURE PROPRE
-- ===========================================================================
-- ⚠️ UN FOYER À MOI. Il ne partage RIEN avec `3a…` (étape ③), `1e…-002` (1V),
-- `1e…-012` (06) ni la fixture du lot ceinture-régime (07). Deux lanes qui
-- écrivent la même fixture se contaminent — mesuré deux fois cette nuit.
--
-- ── LE FOYER, MONTÉ SUR LE CAHIER DES CHARGES DE L'ÉTAPE ⑤ ────────────────
-- Il faut, et il y a : un ENFANT, un adulte qui S'ENTRAÎNE, un RÉGIME et une
-- ALLERGIE, et quelqu'un qui MANGE DEHORS plusieurs midis.
--
--   · Roxane  — maîtresse du foyer, AVEC compte, 38 a, 166/61, `on_feet`,
--               `fat_loss`, omnivore, aucune contrainte.
--               ⇒ vegetables=larger(5) > plafond de la table (3)
--               ⇒ DIVERGE par le service (`servingConflicts`)
--   · Ivar    — adulte SANS compte, 40 a, 186/88, **trains_hard**,
--               `muscle_gain`, omnivore.
--               ⇒ **MANGE DEHORS 3 MIDIS** (mer, jeu, ven — `kind:eating_out`)
--               ⇒ protein=larger(5) > plafond `full`(4) d'une casserole
--                  descendue au végane ⇒ DIVERGE par le régime (`dietDiverges`)
--   · Lubna   — adulte SANS compte, 34 a, 160/57, sédentaire, aucun objectif,
--               **VÉGANE** + **ALLERGIE MÉDICALE au gluten** (cœliaque).
--               ⇒ elle porte le régime le PLUS STRICT : la casserole commune
--                  est SON plat, donc elle ne diverge pas.
--               ⇒ sa présence est l'épreuve de la CEINTURE DE RÉGIME livrée
--                  cette nuit (une bouche végane ne doit entrer dans aucune
--                  boîte d'une préparation carnée).
--   · Zoe     — **ENFANT de 7 ans**, 122/23, aucun objectif, omnivore,
--               dégoût : champignon.
--               ⇒ CHILD_DIRECTION, aucun axe nommé, ne diverge pas.
--               ⇒ épreuve du dimensionnement par le corps (23 kg vs 88 kg) et
--                  de l'interdit « aucun chiffre de corps de mineur ».
--
-- ⇒ 2 bouches divergentes sur 4 ⇒ `ONE_SESSION_LINES_MANY` (le pluriel).
--
-- ── LA CUISINE EST VOLONTAIREMENT PAUVRE ──────────────────────────────────
-- `kitchen_equipment` = stovetop + microwave + blender. **NI FOUR, NI
-- CONGÉLATEUR.** C'est une épreuve de l'utilisateur lambda : « un plat me
-- demande-t-il un ustensile que je n'ai pas ? ». ⚠️ `kitchenEquipmentPromptLines`
-- n'est branchée QUE sur la lane solo (`kitchen_equipment.ts:26-28`) — la lane
-- foyer collecte et n'injecte pas. La fixture le pose pour le MESURER.
--
-- ── LE TEMPS NE DOIT PAS PLAFONNER TOUT SEUL ──────────────────────────────
-- 2 jours de cuisine × 50 min = 100 min/sem ≥ 90
-- (`SEPARATE_DISH_MIN_WEEKLY_MINUTES`, `household_portions.ts:842`). Sous le
-- seuil, `one_dish` serait FORCÉ et la divergence disparaîtrait pour une raison
-- qui n'a rien à voir avec la qualité du plan.
--
-- ── AUCUNE COLLISION ALLERGÈNE ↔ ENVIE ────────────────────────────────────
-- L'envie de la semaine ne nomme ni gluten, ni blé, ni pain, ni pâtes : une
-- collision rend `422 empty_meal` et AUCUN plan ne sort (mesuré par 1V).
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/05-qualite-foyer/2026-08-19-0340-5a-fixture-foyer-qualite.sql
--
-- Mot de passe : 1234567
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '5a000000-0000-4000-8000-000000000001'
\set coach '1e000000-0000-4000-8000-0000000000c1'

begin;

create temporary table _qa5a_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

delete from auth.users where email = 'qa5a.foyer@keeltest.dev';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) values (
  :'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qa5a.foyer@keeltest.dev', extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Roxane Vasseur"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u where u.email = 'qa5a.foyer@keeltest.dev';

update public.app_config set value = (select value from _qa5a_anon_key)
where key = 'edge_functions_anon_key';

commit;

-- ── rattachement au coach déjà publié (doctrine `1e…c1`, en-GB) ────────────
select public.keel_attach_student_to_coach(
  :'owner', :'coach', 'qa5a.foyer@keeltest.dev', 'GB');

-- ⚠️ `profiles.locale` vaut `fr-FR` par défaut : une fixture qui ne l'écrit pas
-- produit un faux défaut de langue (cicatrice du dépôt).
update public.profiles set
  keel_role='student', full_name='Roxane Vasseur', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1988-02-14', height_cm=166,
  gender='female', activity_level='on_feet'
where id = :'owner';

-- ===========================================================================
-- LE FOYER — monté par les RPC que les écrans appellent
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a000000-0000-4000-8000-000000000001","role":"authenticated","aud":"authenticated"}';

select public.keel_household_create('Vasseur Wharf') as created;

-- ── Roxane : la maîtresse, AVEC compte, fat_loss ───────────────────────────
select public.keel_household_set_member_name(
  (select member_id from public.household_members where user_id = :'owner'),
  'Roxane') as renamed;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where user_id = :'owner'),
  166, 61, 'female', 'on_feet') as body_owner;
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

-- ── Ivar : adulte SANS compte, s'entraîne dur, muscle_gain, DEHORS 3 MIDIS ──
select public.keel_household_add_member('Ivar', '1985-09-03', 'muscle_gain') as add_ivar;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Ivar'),
  186, 88, 'male', 'trains_hard') as body_ivar;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Ivar'),
  'omnivore') as diet_ivar;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Ivar'),
  $j$[{"slot":"lunch","size":"large"},{"slot":"dinner","size":"large"}]$j$::jsonb
) as rhythm_ivar;
-- ⚠️ `kind: eating_out` — le TROISIÈME état de présence. Sans le jeton, la
-- ligne est lue `away` (le silence), et « il déjeune dehors » deviendrait
-- « il n'est pas là », ce qui n'est pas la même chose.
select public.keel_household_set_member_away(
  (select member_id from public.household_members where first_name='Ivar'),
  $j$[{"day":"wed","slots":["lunch"],"kind":"eating_out","source":"household"},
      {"day":"thu","slots":["lunch"],"kind":"eating_out","source":"household"},
      {"day":"fri","slots":["lunch"],"kind":"eating_out","source":"household"}]$j$::jsonb
) as away_ivar;
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Ivar'),
  $j$[]$j$::jsonb,
  'lifts on Wednesday and Saturday evenings, straight after work') as habits_ivar;

-- ── Lubna : adulte SANS compte, VÉGANE + ALLERGIE MÉDICALE au gluten ───────
select public.keel_household_add_member('Lubna', '1992-01-27', null) as add_lubna;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Lubna'),
  160, 57, 'female', 'sedentary') as body_lubna;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Lubna'),
  'vegan') as diet_lubna;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Lubna'),
  $j$[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_lubna;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Lubna'),
  'gluten') as allergy_lubna;

-- ── Zoe : ENFANT de 7 ans, aucun objectif, dégoût : champignon ─────────────
select public.keel_household_add_member('Zoe', '2019-05-06', null) as add_zoe;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Zoe'),
  122, 23, 'female', 'on_feet') as body_zoe;
select public.keel_household_set_member_diet(
  (select member_id from public.household_members where first_name='Zoe'),
  'omnivore') as diet_zoe;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Zoe'),
  $j$[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_zoe;
select public.keel_household_add_restriction(
  (select member_id from public.household_members where first_name='Zoe'),
  'mushroom') as dislike_zoe;

-- L'envie de la semaine — anonyme par conception, SANS allergène ni gluten.
select public.keel_household_submit_envy(
  '2026-08-17',
  'we want something warm and comforting that reheats well at work') as envy;

reset role;
commit;

-- ── ce que les écrans écrivent en PostgREST direct ─────────────────────────
-- ⚠️ 2 jours × 50 min = 100 min/sem > 90. NI FOUR NI CONGÉLATEUR : c'est voulu.
insert into public.student_goals (user_id, goal, situation, aspiration, target_weight_kg,
  target_pace_kg_per_week, content_locale, practical_constraints)
values (:'owner','fat_loss',
  'Four of us, one small hob, and nobody home before seven',
  'Walk the Thames Path end to end next spring', 57, 0.3, 'en-GB',
  $json${
    "variety":"varied",
    "cook_days":["wed","sat"],
    "diet_asked":true,
    "budget_amount":95,
    "eating_rhythm":[{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"large"}],
    "cooking_time_min":50,
    "kitchen_equipment":["stovetop","microwave","blender"],
    "recipe_difficulty":"simple"
  }$json$::jsonb)
on conflict (user_id) do update set
  goal=excluded.goal, situation=excluded.situation, aspiration=excluded.aspiration,
  target_weight_kg=excluded.target_weight_kg,
  target_pace_kg_per_week=excluded.target_pace_kg_per_week,
  practical_constraints = public.student_goals.practical_constraints || excluded.practical_constraints;

-- ── LE FOYER, RELU ─────────────────────────────────────────────────────────
select m.first_name, m.role, m.user_id is not null as has_account, m.birth_date,
       m.goal, m.diet, b.height_cm, b.weight_kg, b.activity_level,
       (select string_agg(label, ',') from public.household_member_allergies a where a.member_id=m.member_id) as allergies,
       (select string_agg(label, ',') from public.household_member_restrictions r where r.member_id=m.member_id) as degouts,
       m.away_days
from public.household_members m
left join public.household_member_bodies b on b.member_id = m.member_id
where m.household_id = (select household_id from public.household_members where user_id = :'owner')
order by m.joined_at;
