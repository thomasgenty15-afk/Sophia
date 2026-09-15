-- 1V · delta F3 — on RETIRE le pistachio du chemin de composition, et rien d'autre.
-- But : obtenir un plan ÉCRIT (les deux runs précédents sont morts sur le verrou
-- binaire de sécurité) pour mesurer ce que le MOTEUR fait des grammes du modèle.
-- L'allergie « pistachio » de Peregrine RESTE déclarée : le bloc de sécurité
-- reste injecté, détaché de sa bouche, exactement comme aux runs F1/F2.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000002","role":"authenticated","aud":"authenticated"}';

select public.keel_household_set_member_habits(
  (select member_id from public.household_members where first_name='Odalric'),
  $j$[{"slot":"breakfast","kind":"own_usual","usual":"a spoonful of blackcurrant jam on toast"}]$j$::jsonb,
  'eats standing at the window') as habits_owner;

select public.keel_household_submit_envy(
  '2026-08-17',
  'the house is dreaming of a lemon and poppy seed traybake on Sunday') as envy;
commit;

select first_name, (select note from household_member_habits h where h.member_id=m.member_id) as note,
       (select slots from household_member_habits h where h.member_id=m.member_id) as slots
from household_members m where first_name='Odalric';
select body from household_envy_submissions where household_id=(select household_id from household_members where user_id='1e000000-0000-4000-8000-000000000002');
