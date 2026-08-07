-- RETRAIT DES CARTES KEEL (W8) — lot 1 du retrait des résidus grand public.
--
-- Les « cartes » (gabarits de scripts anti-craquage, armées avant un contexte à
-- risque) sont un artefact du modèle W8, démonté au pivot nutrition. Depuis le
-- 2026-08-03 la chaîne entière était débranchée mais laissée en place, au motif
-- que le produit grand public tournait encore depuis ce code sur un autre
-- projet Supabase (`App.tsx`, « Démonté, pas détruit »).
--
-- POURQUOI ELLE PART MAINTENANT — les preuves, pas l'intuition :
--
--   1. CONFIRMATION HUMAINE du 2026-08-08 sur le point qui ne se prouve pas
--      depuis ce dépôt : le produit grand public (« coach de vie ») n'a
--      **0 utilisateur**. C'est la même épreuve qui avait autorisé le retrait
--      de la carte de défense le 2026-08-07 — étendue par l'humain à tout le
--      legacy : « il y a 0 utilisateurs dessus donc on peut supprimer tout ça ».
--      Cette confirmation RENVERSE le verdict « GARDÉE » posé la veille par
--      `20260808060000_retrait_residus_raisons_de_conservation.sql`
--      (R-AUTRE-PROJET) : les commentaires posés par elle partent avec les
--      tables.
--
--   2. AUCUN CRON. `keel-arm-cards` est absent de `cron.job` (débranché par
--      `20260803030000_pivot_disable_b2c_crons.sql`, vérifié le 2026-08-08 sur
--      les 21 jobs actifs).
--
--   3. ÉCRAN DÉMONTÉ. `/app/cards` redirige vers `/app/today` (`App.tsx`) —
--      la redirection survit, un lien en circulation ne doit pas mourir.
--
--   4. CODE RETIRÉ D'ABORD, dans le commit qui porte cette migration :
--      `keel-cards-v1/` (seule surface d'écriture), `CardsPage.tsx` +
--      `keel/api/cards.ts` (seule surface de lecture), `card_render_test.sql`,
--      branches d'export `account-export-v1` (motif recurring_meals : clé de
--      bundle conservée, tableau vide, zéro sonde). Après ce retrait, le grep
--      commentaires-exclus rend zéro appelant sur les quatre tables.
--
--   5. DONNÉES. En local : 0 ligne dans `student_cards`, `card_armings`,
--      `card_wins`; 16 gabarits seedés par migration dans `card_templates`.
--      Le cron d'armement étant débranché depuis le 2026-08-03, aucune donnée
--      élève ne peut s'être créée depuis.
--
-- CE QUI N'EST **PAS** TOUCHÉ (garde-fou anti-zèle) :
--   - `planned_deviations` : elle perd son lecteur `keel-cards-v1` mais garde
--     `evaluate-adherence-v1` et `CoachStudentPage.tsx`. VIVANTE dans KEEL.
--   - `slot_vocabulary` : table KEEL partagée (plan-template-v1, meal_ideas,
--     planned_deviations…). Seules les FK des tables card_* vers elle tombent,
--     avec les tables qui les portent.
--   - `upcoming_contexts` : lue par le chat; elle perd seulement le
--     `trigger_kind='upcoming_context'` qui pointait vers elle depuis
--     `card_armings`.
--
-- ORDRE — enfants d'abord, RESTRICT partout (pas de `cascade` sur les tables) :
-- si un objet inattendu dépend encore d'une de ces tables, cette migration doit
-- ÉCHOUER, pas emporter l'objet en silence.

begin;

drop table public.card_wins;
drop table public.card_armings;
drop table public.student_cards;
drop table public.card_templates;

-- Les quatre fonctions du rendu déterministe. `keel_student_cards_render`
-- portait le trigger `student_cards_render` (parti avec sa table);
-- `keel_card_body_slots_declared` et `keel_card_variables_valid` portaient les
-- CHECK de `card_templates` (partis avec elle); `keel_render_card` n'était
-- appelée que par les deux précédentes et le trigger. Vérifié dans `prosrc` :
-- aucune autre fonction ne les nomme.

drop function public.keel_student_cards_render();
drop function public.keel_render_card(p_body_template text, p_variables jsonb, p_values jsonb);
drop function public.keel_card_body_slots_declared(p_body text, p_variables jsonb);
drop function public.keel_card_variables_valid(p_variables jsonb);

-- Fail loud si une résurrection silencieuse a eu lieu entre l'écriture et le
-- déploiement de cette migration.
do $$
declare
  leftover text;
begin
  select string_agg(t, ', ') into leftover
  from unnest(array['card_templates','student_cards','card_armings','card_wins']) as t
  where to_regclass('public.' || t) is not null;
  if leftover is not null then
    raise exception 'drop_keel_cards: table(s) encore présente(s): %', leftover;
  end if;
end $$;

commit;
