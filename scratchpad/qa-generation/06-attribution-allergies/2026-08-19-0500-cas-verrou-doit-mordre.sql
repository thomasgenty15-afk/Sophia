-- ===========================================================================
-- LOT « attribution des allergies » — LE CAS OÙ LE PLAN DOIT ÊTRE REFUSÉ
-- ===========================================================================
-- ⛔ L'OBJET DE CE CAS EST DE MONTRER QUE LE VERROU MORD ENCORE.
-- Le 422 `empty_meal` n'est pas le défaut qu'on répare: c'est le comportement
-- CORRECT devant un plan qui NOMME un jeton médical. Si le correctif faisait
-- disparaître ce 422, il aurait desserré la ceinture au lieu de réparer
-- l'attribution.
--
-- CONSTRUCTION, ET ELLE EST ASSUMÉE COMME SYNTHÉTIQUE. On déclare à Ysoline
-- trois allergies médicales sur des mots qu'AUCUNE méthode de cuisine écrite
-- en anglais ne peut éviter d'écrire: `salt`, `water`, `oil`. Le modèle ne
-- peut pas obéir tout en composant — donc il désobéit, et c'est exactement la
-- situation pour laquelle la ceinture existe (« les consignes sont
-- consultatives, donc la garantie ne peut pas vivre dans le prompt »).
--
-- ⚠️ Ces trois libellés sont HORS CATALOGUE: ils ne sont donc reconnus que
-- sous le mot écrit (cran 3 de `householdAllergenRefs`), et c'est exactement
-- ce qu'on veut ici — aucun matcher maison, aucune extension inventée.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/06-attribution-allergies/2026-08-19-0500-cas-verrou-doit-mordre.sql
-- ===========================================================================
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"1e000000-0000-4000-8000-000000000012","role":"authenticated","aud":"authenticated"}';

select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Ysoline'), 'salt') as a1;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Ysoline'), 'water') as a2;
select public.keel_household_add_allergy(
  (select member_id from public.household_members where first_name='Ysoline'), 'oil') as a3;
commit;

select m.first_name, a.label
  from public.household_members m
  join public.household_member_allergies a using(member_id)
 where m.household_id=(select household_id from public.household_members
                        where user_id='1e000000-0000-4000-8000-000000000012')
 order by m.first_name, a.label;
