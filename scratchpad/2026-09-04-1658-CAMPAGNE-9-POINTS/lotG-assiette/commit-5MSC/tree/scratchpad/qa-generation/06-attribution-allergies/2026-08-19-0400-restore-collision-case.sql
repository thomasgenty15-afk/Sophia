-- ===========================================================================
-- LOT « attribution des allergies » — LE CAS CONSTRUIT DE 1V, REMIS EN ÉTAT
-- ===========================================================================
-- L'allergène d'UNE bouche est l'aliment habituel d'une AUTRE, pour que
-- « à tout le monde ou à personne » coûte visiblement quelque chose:
--
--   · Peregrine  — allergie MÉDICALE au pistachio (household_member_allergies)
--   · Odalric    — habitude déclarée: « a spoonful of pistachio butter on toast »
--   · la maison  — envie de la semaine: « a pistachio and lemon traybake »
--
-- C'est EXACTEMENT l'état des runs F1 (f0100001-…) et F2 (f0100002-…), que le
-- delta F3 avait désarmé (jam de cassis / pavot) pour obtenir un plan écrit.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/06-attribution-allergies/2026-08-19-0400-restore-collision-case.sql
-- ===========================================================================
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000002","role":"authenticated","aud":"authenticated"}';

select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Odalric'),
  $j$[{"slot":"breakfast","kind":"own_usual","usual":"a spoonful of pistachio butter on toast"}]$j$::jsonb,
  'eats standing at the window') as habits_owner;

select public.keel_household_submit_envy(
  '2026-08-17',
  'the house is dreaming of a pistachio and lemon traybake on Sunday') as envy;
commit;

select m.first_name, a.label as allergie
  from public.household_members m
  join public.household_member_allergies a using(member_id)
 where m.household_id=(select household_id from public.household_members
                        where user_id='1e000000-0000-4000-8000-000000000002');
select h.slots from public.household_member_habits h
  join public.household_members m using(member_id) where m.first_name='Odalric';
select body from public.household_envy_submissions
 where household_id=(select household_id from public.household_members
                      where user_id='1e000000-0000-4000-8000-000000000002');
