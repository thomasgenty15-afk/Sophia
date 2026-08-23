-- ===========================================================================
-- DELTA — LA CIBLE D'IVAR, ET RIEN D'AUTRE
-- ===========================================================================
-- Le compteur `box_sizing.mouths` rend, sur TOUS mes runs de base :
--   {"minor": 1, "sized": 1, "no_pace": 1, "no_direction": 1}
-- c'est-à-dire : UNE seule bouche sur quatre est dimensionnée sur une
-- DIRECTION. Les trois autres sont dimensionnées sur leur seul entretien.
--
--   · Zoe    → `minor`        (voulu : on ne dérive rien du corps d'un mineur)
--   · Lubna  → `no_direction` (voulu : aucun objectif déclaré)
--   · Ivar   → `no_pace`      ⚠️ **il a déclaré `muscle_gain`**
--
-- `memberTargetFactor` (household_portions.ts:1804-1839) refuse la direction
-- quand il n'y a pas d'allure : `keel_household_set_member_target` n'a jamais
-- été appelée pour lui. Autrement dit : **dire « je prends du muscle » ne change
-- rien à la taille de l'assiette** tant que personne n'a tapé un poids visé et
-- une allure pour cette bouche-là.
--
-- Ce delta ne change QUE ça. Le foyer, les régimes, l'allergie, les dégoûts,
-- les absences et les contraintes pratiques sont intacts — pour que l'écart
-- observé n'ait qu'une seule cause possible.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/05-qualite-foyer/2026-08-19-0400-5a-delta-cible-ivar.sql
-- ===========================================================================

\set ON_ERROR_STOP on
\set owner '5a000000-0000-4000-8000-000000000001'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a000000-0000-4000-8000-000000000001","role":"authenticated","aud":"authenticated"}';

select public.keel_household_set_member_target(
  (select member_id from public.household_members where first_name='Ivar'
     and household_id=(select household_id from public.household_members where user_id=:'owner')),
  92, 0.25) as target_ivar;

reset role;
commit;

-- ── RELU ───────────────────────────────────────────────────────────────────
select first_name, goal, target_weight_kg, target_pace_kg_per_week
from public.household_members
where household_id=(select household_id from public.household_members where user_id=:'owner')
order by first_name;
