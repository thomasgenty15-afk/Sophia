-- S6 — LES GRANTS PAR DÉFAUT · 5/8 · `student_generated_meals`
--
-- ⛔ LA TABLE CENTRALE DU PRODUIT. Elle porte `dishes`, `member_portions`,
--    `shopping_list`, `generated_from` — donc les grammages par bouche, les
--    contraintes qui ont mordu, et le foyer. C'est la sortie du moteur, et
--    c'est de la donnée de santé par ricochet.
--
-- CE QUE LES POLICIES UTILISENT, MESURÉ : `student_generated_meals_owner_read`
-- et `student_generated_meals_household_read`, toutes deux en `SELECT`, toutes
-- deux `TO authenticated`. AUCUNE policy d'écriture. Les 181 lignes de la base
-- ont toutes été écrites par `service_role` (`generate-meal-v1`,
-- `generate-household-meal-v1`, `accident_io.ts`).
--
-- LES CINQ LECTEURS DU FRONT, VÉRIFIÉS UN PAR UN AVANT LE REVOKE :
--   `planFeedback.ts:232` · `household.ts:1736` · `household.ts:1857` ·
--   `mealGeneration.ts:1298` · `onboarding.ts:1862` — **toutes des `.select()`**.
-- Plus `meal-document-v1/index.ts:126`, qui lit SOUS L'IDENTITÉ DE L'ÉLÈVE et
-- pas en `service_role` : c'est la RLS qui garantit qu'on ne fabrique pas le
-- PDF du repas d'un autre. Ce lecteur-là serait le premier à casser si le
-- `select` de `authenticated` partait — il ne part pas.

revoke all privileges on table public.student_generated_meals from anon, authenticated;

grant select on table public.student_generated_meals to anon, authenticated;

do $verif$
begin
  if has_table_privilege('anon', 'public.student_generated_meals', 'INSERT')
     or has_table_privilege('anon', 'public.student_generated_meals', 'UPDATE')
     or has_table_privilege('anon', 'public.student_generated_meals', 'DELETE')
     or has_table_privilege('anon', 'public.student_generated_meals', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.student_generated_meals', 'INSERT')
     or has_table_privilege('authenticated', 'public.student_generated_meals', 'UPDATE')
     or has_table_privilege('authenticated', 'public.student_generated_meals', 'DELETE')
     or has_table_privilege('authenticated', 'public.student_generated_meals', 'TRUNCATE')
  then
    raise exception 'S6/student_generated_meals : un droit d''écriture subsiste';
  end if;
  if not has_table_privilege('authenticated', 'public.student_generated_meals', 'SELECT') then
    raise exception 'S6/student_generated_meals : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
