-- =========================================================================
-- MIGRATION ÉCRITE, **NON APPLIQUÉE**, ET DÉLIBÉRÉMENT HORS DE
-- `supabase/migrations/`.
--
-- Elle accompagne le retrait de la lane `generate-week-plan-v1`
-- (2026-08-19). Le retrait du CODE est fait ; celui de la TABLE ne l'est
-- pas, et c'est une décision : c'est le seul geste irréversible du lot.
-- 246 lignes de QA ne coûtent rien à garder, et cinq lecteurs vivants
-- s'appuient encore dessus.
--
-- ⛔ NE PAS DÉPLACER CE FICHIER DANS `supabase/migrations/` SANS AVOIR
--    D'ABORD FAIT LES QUATRE VÉRIFICATIONS DE LA SECTION 0.
-- ⛔ CE FICHIER NE PEUT PAS ÊTRE APPLIQUÉ TEL QUEL : les CINQ lecteurs
--    listés en section 1 tomberaient. Ils doivent partir AVANT, ou dans
--    le même lot.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 0. LES QUATRE VÉRIFICATIONS PRÉALABLES (cicatrices du dépôt)
-- -------------------------------------------------------------------------
--
-- ① VERSIONS DE MIGRATION EN DOUBLE — une version dupliquée bloque la
--    lignée entière :
--      ls supabase/migrations/ | cut -d_ -f1 | sort | uniq -d
--    (doit ne rien rendre)
--
-- ② MIGRATION HORS ORDRE = SAUTÉE EN SILENCE — le nom de ce fichier doit
--    être STRICTEMENT supérieur à la dernière version du registre.
--    Registre au 2026-08-19 : 20260818271500. Comparer disque et registre :
--      ls supabase/migrations/ | tail -5
--      select version from supabase_migrations.schema_migrations
--        order by version desc limit 5;
--
-- ③ LES CINQ LECTEURS SONT PARTIS (section 1). Sans ça, la synthèse du
--    coach et l'export RGPD lèvent sur une relation inexistante.
--
-- ④ `supabase migration up` SEULEMENT. Ni `db push`, ni `db reset` — ils
--    sont bloqués par le hook, et à raison.


-- -------------------------------------------------------------------------
-- 1. CE QUI DOIT PARTIR AVANT — les cinq lecteurs restants au 2026-08-19
-- -------------------------------------------------------------------------
--
--   1. supabase/functions/_shared/keel/coach_synthesis_io.ts:343
--      → le champ `weekPlan` du rapport de cohorte. Retirer aussi le TYPE
--        (`coach_synthesis.ts:230,317`) et le calcul de `planned` (:488),
--        qui lit `weekPlan?.adopted || composedMeals > 0`. ⚠️ SURFACE
--        VISIBLE PAR LE COACH — mais `composedMeals` porte déjà le compteur
--        seul depuis le commit 99697610.
--
--   2. supabase/functions/_shared/keel/hunger_signal_io.ts:195-217
--      → `countSatietyAdaptations`. 🔴 IL A SA PROPRE TÂCHE, et elle est à
--        prendre AVANT ce drop : la fonction doit lire
--        `student_generated_meals.generated_from`, qui porte la même clé.
--        ⚠️ MESURÉ LE 2026-08-19, ET C'EST UNE CORRECTION AU DOSSIER :
--        69 lignes sur 145 portent la clé `satiety_priority`, mais AUCUNE
--        ne vaut `true` — parce que `satiety_priority = signal.recurrent`
--        et qu'aucune persona QA n'a de faim récurrente. Rebrancher le
--        lecteur rendra donc TOUJOURS 0 tant qu'un décor ne produit pas de
--        faim récurrente. Sans ce décor, le correctif ressemblera à un
--        correctif qui ne marche pas.
--
--   3. supabase/functions/_shared/keel/following_io.ts:193
--      → 3ᵉ branche de `resolveStudentFollowing`, et la valeur
--        `adopted_week_plan` du type `FollowingSource`.
--
--   4. supabase/functions/account-export-v1/index.ts:806 + `SCOPE.studentWeekPlans`
--      → et `supabase/functions/keel_gdpr_lifecycle_test.ts`, qui tombe
--        sinon (cicatrice « le lifecycle RGPD ne réclame pas les tables
--        neuves » — ici c'est l'inverse, il réclame une table partie).
--
--   5. frontend/src/keel/api/weekPlan.ts (`loadWeekPlan`) → TodayPage.tsx:948
--      → avec `currentMonday`, `weekPlanDaySplit`, `WeekPlanRow`,
--        `WeekPlanItem` et le rendu `OwnWeekLine` / le prop `plan` de
--        `<OwnDay>`. ⚠️ `currentMonday` et `weekPlanDaySplit` sont importés
--        par `TodayPage` : les DÉPLACER, pas les tuer.
--
-- ET LES TESTS EN BASE, qui interrogent la table directement :
--   supabase/tests/keel/student_week_plan_test.sql
--   supabase/tests/keel/a13_isolation_rls_test.sql
--
-- ⚠️ NE PAS TOUCHER aux migrations DÉJÀ APPLIQUÉES qui citent la table dans
--    leurs commentaires, ni aux rapports de QA datés : ce sont des archives,
--    et les retirer EST le bug (cicatrice « références legacy qui doivent
--    survivre »).


-- -------------------------------------------------------------------------
-- 2. CE QUE LE DROP EMPORTE — inventaire relevé en base le 2026-08-19
-- -------------------------------------------------------------------------
--
--   246 lignes (245 comptes de test + 1 compte de développement ; zéro
--        utilisateur réel — dont 221 en `status = 'adopted'`)
--
--   4 CHECK :
--     · student_week_plans_doctrine_traceable_check   ← LA GARANTIE B27
--     · student_week_plans_kind_closed_check
--     · student_week_plans_status_check
--     · student_week_plans_check
--
--   3 index : student_week_plans_pkey
--             student_week_plans_user_id_week_start_key
--             student_week_plans_user_week_idx
--
--   1 trigger : student_week_plans_set_updated_at (générique tg_set_updated_at)
--
--   1 policy RLS : student_week_plans_owner_all (for all, user_id = auth.uid())
--                  — aucune policy coach
--
--   0 vue, 0 vue matérialisée, 0 tâche cron, 0 clé étrangère entrante.
--
-- ⚠️ CE QUE LE PRODUIT PERD DÉFINITIVEMENT AVEC LE PREMIER CHECK :
--    le seul endroit où une consigne NOMME la conviction du coach qu'elle
--    applique et où la BASE refuse la ligne qui ne la nomme pas.
--    `student_generated_meals.generated_from.belief_keys` porte la
--    provenance du PLAN, jamais d'une LIGNE, et aucun CHECK ne l'exige.
--    C'est écrit dans `docs/keel/MODEL.md` — le drop ne doit pas effacer
--    cette trace.


-- =========================================================================
-- 3. LA MIGRATION ELLE-MÊME
-- =========================================================================

begin;

-- ⚠️ FILET : si la table portait encore une donnée d'un compte NON test au
-- moment de l'application, on s'arrête. Le dossier a mesuré 245/246 comptes
-- de test + 1 compte de développement le 2026-08-19 — mais une migration
-- s'applique un autre jour, sur une autre base, et « c'était vrai en QA »
-- n'est pas une garantie de production.
do $$
declare
  n_reels bigint;
begin
  select count(*) into n_reels
  from public.student_week_plans p
  join auth.users u on u.id = p.user_id
  where split_part(u.email, '@', 2) not in ('test.dev', 'example.com')
    and u.email <> 'thomasgenty15@gmail.com';

  if n_reels > 0 then
    raise exception
      'ARRÊT: % ligne(s) de student_week_plans appartiennent à des comptes qui '
      'ne sont ni des fixtures de test ni le compte de développement. Le retrait '
      'a été décidé sur la mesure « zéro utilisateur réel ». Cette mesure est '
      'fausse ici: relire le dossier avant de continuer.', n_reels;
  end if;
end $$;

-- `cascade` est VOLONTAIREMENT ABSENT. Aucune clé étrangère n'entre dans
-- cette table (vérifié le 2026-08-19) : si `drop table` échoue faute de
-- `cascade`, c'est qu'une dépendance est APPARUE depuis, et elle doit être
-- lue avant d'être emportée. Un `cascade` posé par précaution supprimerait
-- en silence l'objet qu'on aurait justement voulu voir.
drop table public.student_week_plans;

commit;


-- -------------------------------------------------------------------------
-- 4. APRÈS L'APPLICATION — le nettoyage qui ne peut pas vivre dans ce fichier
-- -------------------------------------------------------------------------
--
-- Deux fonctions SQL citent la table dans leurs COMMENTAIRES seulement
-- (aucune ne la lit) :
--     keel_free_signup_available
--     keel_attach_student_to_coach
-- Les recréer pour ce seul motif ferait une migration de plus, sur du
-- commentaire. À grouper avec le prochain vrai changement de ces fonctions.
--
-- Et le garde-fou de couverture des tests en base :
--     supabase/tests/keel/free_signup_adversarial_test.sql:20,82
-- cite `generate-week-plan-v1` en prose. C'est une ARCHIVE de raisonnement,
-- pas un appelant : la laisser.
