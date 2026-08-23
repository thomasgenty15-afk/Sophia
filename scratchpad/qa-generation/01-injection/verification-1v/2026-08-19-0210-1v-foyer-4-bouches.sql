-- ===========================================================================
-- QA 01-injection / VÉRIFICATION 1V — LE FOYER À QUATRE BOUCHES
-- ===========================================================================
-- Objet : mesurer l'EFFET du corps par bouche, pas sa présence au prompt.
--
-- Le foyer est construit pour que chaque écart mesuré n'ait qu'UNE cause :
--
--   · Odalric   — adulte, COMPTE, 183 cm / 79 kg, muscle_gain
--   · Peregrine — adulte, SANS COMPTE, 152 cm / 47 kg, muscle_gain
--        ⇒ MÊME objectif, MÊME rythme, MÊMES tailles de moments qu'Odalric.
--          Seule différence lisible au prompt : Odalric porte ses crochets de
--          corps, Peregrine n'en porte aucun. Un écart de grammes entre eux ne
--          peut venir que de là.
--   · Casimir   — MINEUR de 16 ans, SANS COMPTE, 178 cm / 70 kg, aucun objectif
--   · Wilfrid   — MINEUR de 7 ans,  SANS COMPTE, 122 cm / 23 kg, aucun objectif
--        ⇒ MÊME rythme, MÊMES tailles. Le prompt ne dit ni l'âge ni le corps
--          d'un mineur : leurs deux lignes doivent être identiques au prénom
--          près. Un écart de grammes entre eux ne peut venir que du modèle.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/01-injection/verification-1v/2026-08-19-0210-1v-foyer-4-bouches.sql
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '1e000000-0000-4000-8000-000000000002'

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000002","role":"authenticated","aud":"authenticated"}';

-- ── Peregrine : aligner objectif ET rythme sur ceux du maître ──────────────
select public.keel_household_set_member_goal(
  (select member_id from public.household_members where first_name='Peregrine'),
  'muscle_gain') as goal_peregrine;

select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Peregrine'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_peregrine;

-- ── Wilfrid : 7 ans, petit corps, rythme aligné sur celui de l'ado ─────────
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Wilfrid'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_wilfrid;

-- ── Casimir : l'ADOLESCENT de 16 ans, grand corps, aucune direction ────────
select public.keel_household_add_member('Casimir', '2010-02-11', null) as add_casimir;
select public.keel_household_set_member_body(
  (select member_id from public.household_members where first_name='Casimir'),
  178, 70, 'male', 'on_feet') as body_casimir;
select public.keel_household_set_member_rhythm(
  (select member_id from public.household_members where first_name='Casimir'),
  $j$[{"slot":"breakfast","size":"medium"},{"slot":"lunch","size":"large"},{"slot":"dinner","size":"medium"}]$j$::jsonb
) as rhythm_casimir;
select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Casimir'),
  '{}'::jsonb, 'puts hot sauce on everything') as habits_casimir;

reset role;
commit;

-- ── Wilfrid a SEPT ans : la date de naissance passe par la table, la RPC de
--    l'écran ne rend pas la modification d'une date déjà posée.
update public.household_members set birth_date = '2019-03-04'
 where first_name = 'Wilfrid'
   and household_id = (select household_id from public.household_members
                        where user_id = '1e000000-0000-4000-8000-000000000002');
update public.household_member_bodies set height_cm = 122, weight_kg = 23
 where member_id = (select member_id from public.household_members where first_name='Wilfrid');

select m.first_name, m.role, m.user_id is not null as has_account, m.birth_date, m.goal,
       b.height_cm, b.weight_kg, b.gender, b.activity_level,
       public.keel_household_member_age(m.member_id) as age_state
from public.household_members m
left join public.household_member_bodies b using(member_id)
where m.household_id = (select household_id from public.household_members
                         where user_id = '1e000000-0000-4000-8000-000000000002')
order by m.joined_at;
