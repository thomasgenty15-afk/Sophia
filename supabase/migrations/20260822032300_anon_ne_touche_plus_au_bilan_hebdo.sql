-- S6 — LES GRANTS PAR DÉFAUT · 4/8 · `weekly_reviews`
--
-- ⛔ ON QUITTE LES RÉFÉRENTIELS. `weekly_reviews` porte de la donnée
--    PERSONNELLE : `biofeedback`, `outcomes`, `logging_coverage`,
--    `core_adherence_pct`. C'est ce qu'un élève a ressenti et ce qu'il a tenu.
--
-- CE QUE LES POLICIES UTILISENT, MESURÉ : `weekly_reviews_owner_read` et
-- `weekly_reviews_select_coach`, toutes deux en `SELECT`, toutes deux
-- `TO authenticated`. Il n'existe AUCUNE policy `INSERT`, `UPDATE` ou `DELETE`
-- sur cette table — les écritures passent toutes par `service_role`
-- (`week_review_io.ts`, `weekly_flow_io.ts`), qui n'est pas touché ici.
--
-- Donc : `anon` et `authenticated` gardent `select`, et rien d'autre.
--
-- ⛔ ET C'EST LÀ QUE LE DÉFAUT SE VOIT LE MIEUX. Avant ce commit,
--    `authenticated` portait `DELETE` sur cette table sans qu'aucune policy
--    `DELETE` n'existe : la RLS refusait, en rendant « 0 ligne » et AUCUNE
--    erreur. Le jour où quelqu'un ajoute une policy `USING (true)` pour
--    déboguer, le `DELETE` devient réel — et le droit, lui, était déjà là
--    depuis le premier jour de la table. Un droit accordé « au cas où » est
--    une porte qu'on a laissée déverrouillée en comptant sur le chien.

revoke all privileges on table public.weekly_reviews from anon, authenticated;

grant select on table public.weekly_reviews to anon, authenticated;

do $verif$
begin
  if has_table_privilege('anon', 'public.weekly_reviews', 'INSERT')
     or has_table_privilege('anon', 'public.weekly_reviews', 'UPDATE')
     or has_table_privilege('anon', 'public.weekly_reviews', 'DELETE')
     or has_table_privilege('anon', 'public.weekly_reviews', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.weekly_reviews', 'INSERT')
     or has_table_privilege('authenticated', 'public.weekly_reviews', 'UPDATE')
     or has_table_privilege('authenticated', 'public.weekly_reviews', 'DELETE')
     or has_table_privilege('authenticated', 'public.weekly_reviews', 'TRUNCATE')
  then
    raise exception 'S6/weekly_reviews : un droit d''écriture subsiste';
  end if;
  -- La lecture est ce que le front FAIT (keelClient.ts:222, CoachStudentPage,
  -- StudentProgressPage, StudentWeekPlanPage). L'emporter viderait quatre
  -- écrans sans une seule erreur rouge côté serveur.
  if not has_table_privilege('authenticated', 'public.weekly_reviews', 'SELECT') then
    raise exception 'S6/weekly_reviews : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
