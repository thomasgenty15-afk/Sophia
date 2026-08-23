-- ===========================================================================
-- LOT « attribution des allergies » — FIXTURE PROPRE À CE LOT
-- ===========================================================================
-- ⚠️ POURQUOI UN FOYER À MOI PLUTÔT QUE CELUI DE 1V.
-- Mesuré pendant ce lot: un agent voisin lance des runs réels sur le MÊME
-- foyer (`1e000000-…-002`, `request_id` `a0100001-…`, 2026-08-18 23:12 UTC).
-- Deux lanes qui écrivent la même fixture se contaminent, et aucune des deux
-- mesures ne vaut ensuite quoi que ce soit. Ce foyer-ci est indépendant; le
-- foyer de 1V a été remis dans l'état où le voisin l'avait laissé.
--
-- LE CAS CONSTRUIT, identique à celui de 1V dans sa forme:
-- l'allergène d'une bouche est l'aliment habituel d'une autre, ET l'envie de
-- la maison le réclame. « À tout le monde ou à personne » coûte donc quelque
-- chose de visible.
--
--   · Ysoline   — SANS COMPTE, allergie MÉDICALE au pistachio
--                 (`household_member_allergies`, clée sur member_id)
--   · Bertille  — la maîtresse de maison, AVEC compte, allergie au celeriac
--                 (`student_safety_constraints`, clée sur user_id)
--                 et habitude déclarée: « pistachio butter on toast »
--   · Marceau   — MINEUR, 8 ans, aucune contrainte
--   · la maison — envie de la semaine: « a pistachio and lemon traybake »
--
-- Les DEUX provenances de contrainte sont donc exercées dans le même prompt:
-- c'est ce qui rend l'attribution mesurable (deux clés, deux bouches).
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/06-attribution-allergies/2026-08-19-0410-fixture-foyer-attribution.sql
--
-- Mot de passe : 1234567
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '1e000000-0000-4000-8000-000000000012'
\set coach '1e000000-0000-4000-8000-0000000000c1'

begin;

create temporary table _qaatr_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

delete from auth.users where email = 'qaatr.foyer@keeltest.dev';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) values (
  :'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qaatr.foyer@keeltest.dev', extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Bertille Vasseur"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u where u.email = 'qaatr.foyer@keeltest.dev';

update public.app_config set value = (select value from _qaatr_anon_key)
where key = 'edge_functions_anon_key';

commit;

-- ── rattachement au coach déjà publié de 1V (doctrine `Osric Thelwall`) ─────
select public.keel_attach_student_to_coach(
  '1e000000-0000-4000-8000-000000000012', '1e000000-0000-4000-8000-0000000000c1',
  'qaatr.foyer@keeltest.dev', 'GB');

update public.profiles set
  keel_role='student', full_name='Bertille Vasseur', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true,
  account_status='active', birth_date='1985-09-12', height_cm=171,
  gender='female', activity_level='on_feet'
where id = '1e000000-0000-4000-8000-000000000012';

-- ===========================================================================
-- LE FOYER — monté par les RPC que les écrans appellent
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000012","role":"authenticated","aud":"authenticated"}';

select public.keel_household_create('Vasseur Row') as created;

select public.keel_household_set_member_name(
  (select member_id from public.household_members where user_id = :'owner'),
  'Bertille') as renamed;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where user_id = :'owner'),
  171, 68, 'female', 'on_feet') as body_owner;
select public.keel_household_set_member_goal(
  (select member_id from public.household_members where user_id = :'owner'),
  'muscle_gain') as goal_owner;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where user_id = :'owner'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_owner;

-- ⚠️ LE CONFLIT VOULU nº1 : l'habitude de la maîtresse de maison EST
-- l'allergène d'une AUTRE bouche.
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where user_id = :'owner'),
  $j$[{"slot":"breakfast","kind":"own_usual","usual":"a spoonful of pistachio butter on toast"}]$j$::jsonb,
  'drinks her tea scalding') as habits_owner;

-- ── Ysoline : adulte SANS COMPTE, l'allergie médicale ──────────────────────
select public.keel_household_add_member('Ysoline', '1990-02-24', 'fat_loss') as add_ysoline;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Ysoline'),
  158, 52, 'female', 'sedentary') as body_ysoline;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Ysoline'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_ysoline;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Ysoline'),
  'pistachio') as allergy_ysoline;
-- LE CONTRASTE, dans le même prompt: un dégoût est déjà ATTACHÉ à sa bouche
-- (`- Ysoline: never serve fennel`) et le modèle l'applique. C'est le patron
-- que ce lot copie pour les contraintes dures.
select public.keel_household_add_restriction(
  (select member_id from public.household_members where first_name='Ysoline'),
  'fennel') as dislike_ysoline;

-- ── Marceau : MINEUR de 8 ans, aucune contrainte ───────────────────────────
select public.keel_household_add_member('Marceau', '2018-01-15', null) as add_marceau;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Marceau'),
  128, 26, 'male', 'on_feet') as body_marceau;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Marceau'),
  $j$[{"slot":"breakfast","size":"small"},{"slot":"lunch","size":"medium"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_marceau;

-- ⚠️ LE CONFLIT VOULU nº2 : l'envie de la maison RÉCLAME l'allergène.
select public.keel_household_submit_envy(
  '2026-08-17',
  'the house is dreaming of a pistachio and lemon traybake on Sunday') as envy;

reset role;
commit;

-- ── ce que les écrans écrivent en PostgREST direct ─────────────────────────
insert into public.student_goals (user_id, goal, situation, aspiration, target_weight_kg,
  target_pace_kg_per_week, content_locale, practical_constraints)
values ('1e000000-0000-4000-8000-000000000012','muscle_gain',
  'I cook for three and the oven door does not shut properly',
  'Walk the Cleveland Way in one go', 66, 0.3, 'en-GB',
  $json${
    "variety":"varied",
    "cook_days":["tue","sat"],
    "diet_asked":true,
    "budget_amount":140,
    "eating_rhythm":[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}],
    "cooking_time_min":50,
    "kitchen_equipment":["oven","stovetop","freezer","blender"],
    "recipe_difficulty":"keen"
  }$json$::jsonb)
on conflict (user_id) do update set
  goal=excluded.goal, situation=excluded.situation, aspiration=excluded.aspiration,
  practical_constraints = public.student_goals.practical_constraints || excluded.practical_constraints;

-- LA SECONDE PROVENANCE: la contrainte d'un TITULAIRE, clée sur user_id.
-- Sans elle, le prompt ne porterait qu'une seule des deux clés d'attribution
-- et le test ne mesurerait que la moitié du chemin.
insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, severity, declared_by, content_locale)
values ('1e000000-0000-4000-8000-000000000012','allergy','celeriac','medical','student','en-GB')
on conflict do nothing;

select m.first_name, m.role, m.user_id is not null as has_account, m.birth_date,
       b.height_cm, b.weight_kg,
       (select label from public.household_member_allergies a where a.member_id=m.member_id) as allergie
from public.household_members m
left join public.household_member_bodies b on b.member_id = m.member_id
where m.household_id = (select household_id from public.household_members
                         where user_id = '1e000000-0000-4000-8000-000000000012')
order by m.joined_at;
