-- ===========================================================================
-- DELTA ③.D — LE DÉGOÛT PORTE SUR UN ALIMENT QUE LE MENU RÉCLAME
-- ===========================================================================
-- ⚠️ POURQUOI UN DELTA, ET PAS LA FIXTURE D'ORIGINE.
-- Question ③ du lot: « un dégoût d'une bouche impose-t-il son goût à tout le
-- monde, ou est-il contourné ? » — MESURÉ sur `fennel`, la réponse ne vaut
-- RIEN: le fenouil n'est apparu dans AUCUN des 4 premiers plans, donc son
-- absence n'apprend pas si la règle a mordu ou si le plat n'en voulait pas.
-- C'est très exactement la scorie que 1B a nommée sur l'allergie (D-6).
--
-- LE DELTA: le dégoût devient `sweet potato`, un aliment que le modèle a mis
-- de lui-même dans 3 plans sur 4 (casserole végane + envie « smoky and
-- slow-cooked »). L'absence devient alors une MESURE, et la présence aussi:
--   · absent de TOUTE la table  ⇒ le dégoût d'une bouche impose son goût
--   · absent de la SEULE assiette de Marceline ⇒ contourné
--
-- ⛔ RIEN D'AUTRE NE BOUGE. Même foyer, mêmes 4 bouches, mêmes objectifs,
-- même allergie, même envie, même fenêtre. Un seul octet de différence.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/03-foyer-modes/2026-08-19-0410-3a-delta-degout.sql
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '3a000000-0000-4000-8000-000000000001'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated","aud":"authenticated"}';

select public.keel_household_remove_restriction(id) as removed
from public.household_food_restrictions
where member_id = (select member_id from public.household_members where first_name='Marceline')
  and label = 'fennel';

select public.keel_household_add_restriction(
  (select member_id from public.household_members where first_name='Marceline'),
  'sweet potato') as dislike_marceline_v2;

reset role;
commit;

select m.first_name,
       (select string_agg(x.label, ',') from public.household_food_restrictions x where x.member_id=m.member_id) as degouts
from public.household_members m
where m.household_id = (select household_id from public.household_members where user_id = :'owner')
order by m.joined_at;
