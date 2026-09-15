-- ===========================================================================
-- QA 01-injection / VÉRIFICATION 1V — le FOYER, monté par les portes de l'app
-- ===========================================================================
-- Chaque geste passe par la RPC que l'écran appelle, sous le rôle
-- `authenticated` avec les claims JWT du maître : mêmes gardes, mêmes refus.
--
-- ⚠️ LE PIÈGE VOULU : `profiles.full_name` du maître vaut « Quenneville ».
-- `keel_household_create` recopie donc « Quenneville » dans
-- `household_members.first_name`. On appelle ENSUITE
-- `keel_household_set_member_name(member,'Odalric')` — exactement ce que le
-- correctif D-1 fait faire à `SetupPage.saveSelf()` — SANS toucher au profil.
-- Si le prompt porte « Odalric » et zéro « Quenneville », la source du prénom
-- est bien la ligne du roster, et la ligne #1 est vérifiée sur MA valeur.
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '1e000000-0000-4000-8000-000000000002'

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000002","role":"authenticated","aud":"authenticated"}';

select public.keel_household_create('Thelwall Cottage') as created;

-- le maître : renommé par la porte du prénom, le profil reste « Quenneville »
select public.keel_household_set_member_name(
  (select member_id from public.household_members
    where user_id = :'owner'), 'Odalric') as renamed;

select public.keel_household_set_member_body(
  (select member_id from public.household_members where user_id = :'owner'),
  183, 79, 'male', 'on_feet') as body_owner;

select public.keel_household_set_member_goal(
  (select member_id from public.household_members where user_id = :'owner'),
  'muscle_gain') as goal_owner;

select public.keel_household_set_member_target(
  (select member_id from public.household_members where user_id = :'owner'),
  86, 0.35) as target_owner;

select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where user_id = :'owner'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_owner;

-- ⚠️ LE CONFLIT VOULU : l'habitude du maître EST l'allergène d'une autre bouche.
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where user_id = :'owner'),
  $j${"breakfast":"a spoonful of pistachio butter on toast"}$j$::jsonb,
  'eats standing at the window') as habits_owner;

-- ⚠️ DOUBLE DÉCLARATION VOULUE : le maître déclare « celeriac » des DEUX côtés
-- (compte + fiche de foyer). C'est le §7 Q5 que 1B n'a pas exercé.
select public.keel_household_add_allergy(
  (select member_id from public.household_members where user_id = :'owner'),
  'celeriac') as allergy_owner_household;

-- ── Peregrine : adulte, SANS compte, corps volontairement petit ────────────
select public.keel_household_add_member('Peregrine', '1992-06-17', 'fat_loss') as add_peregrine;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Peregrine'),
  152, 47, 'female', 'sedentary') as body_peregrine;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Peregrine'),
  $j$[{"slot":"lunch","size":"large"},{"slot":"snack_pm","size":"small"},{"slot":"dinner","size":"small"}]$j$::jsonb
) as rhythm_peregrine;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Peregrine'),
  'pistachio') as allergy_peregrine;
select public.keel_household_add_restriction(
  (select member_id from public.household_members where first_name='Peregrine'),
  'fennel') as dislike_peregrine;
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Peregrine'),
  '{}'::jsonb, 'will not eat anything the colour of a carrot') as habits_peregrine;

-- ── Wilfrid : MINEUR (9 ans), sans compte, note seule ──────────────────────
select public.keel_household_add_member('Wilfrid', '2017-05-20', null) as add_wilfrid;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Wilfrid'),
  134, 29.5, 'male', 'on_feet') as body_wilfrid;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Wilfrid'),
  $j$[{"slot":"breakfast","size":"small"},{"slot":"lunch","size":"medium"},{"slot":"snack_pm","size":"small"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_wilfrid;
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Wilfrid'),
  '{}'::jsonb, 'only eats bread with the crust cut off') as habits_wilfrid;
select public.keel_household_set_member_away(
  (select member_id from public.household_members where first_name='Wilfrid'),
  $j$[{"day":"sat","kind":"away","slots":["dinner"]}]$j$::jsonb) as away_wilfrid;

-- ── L'envie de la semaine (lundi ISO de la fenêtre) ────────────────────────
select public.keel_household_submit_envy(
  '2026-08-17',
  'the house is dreaming of a pistachio and lemon traybake on Sunday') as envy;

reset role;
commit;

-- ── Ce que les écrans du foyer écrivent en PostgREST direct ────────────────
insert into public.student_goals (user_id, goal, situation, aspiration, target_weight_kg,
  target_pace_kg_per_week, content_locale, practical_constraints)
values ('1e000000-0000-4000-8000-000000000002','muscle_gain',
  'I share this kitchen with a lodger on Thursdays',
  'Get back on the tandem with my father', 86, 0.35, 'en-GB',
  $json${
    "variety":"varied",
    "cook_days":["tue","sat"],
    "diet_asked":true,
    "budget_amount":152,
    "eating_rhythm":[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}],
    "cooking_time_min":55,
    "kitchen_equipment":["oven","stovetop","freezer","air_fryer","blender"],
    "recipe_difficulty":"keen"
  }$json$::jsonb)
on conflict (user_id) do update set
  goal=excluded.goal, situation=excluded.situation, aspiration=excluded.aspiration,
  target_weight_kg=excluded.target_weight_kg, target_pace_kg_per_week=excluded.target_pace_kg_per_week,
  practical_constraints = public.student_goals.practical_constraints || excluded.practical_constraints;

-- la double déclaration, côté COMPTE cette fois
insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, severity, declared_by, content_locale)
values ('1e000000-0000-4000-8000-000000000002','allergy','celeriac','medical','student','en-GB')
on conflict do nothing;

select m.first_name, m.role, m.user_id is not null as has_account, m.birth_date, m.goal,
       b.height_cm, b.weight_kg, b.gender
from public.household_members m
left join public.household_member_bodies b on b.member_id = m.member_id
order by m.joined_at;
