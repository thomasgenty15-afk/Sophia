-- RETRAIT DE LA CASCADE PLAN / TRANSFORMATION — lots 4+5+6 du retrait des
-- résidus grand public. LA colonne vertébrale du produit B2C « coach de vie ».
--
-- 21 tables : les 10 du cœur (plans, items, entries, 3× habitudes,
-- transformations, cycles, victoires, métriques) et les 11 satellites que la
-- cartographie FK a révélés (inspirations, recommandations d'outils, revues de
-- niveau, demandes de revue, soutien professionnel, rendez-vous, aspects,
-- feedback de clôture). Le document d'autorité l'exige : des tables liées par
-- FK partent ENSEMBLE, ou pas du tout — un `on delete cascade` traversé sans le
-- savoir vide une table voisine sans erreur et sans bruit.
--
-- POURQUOI ELLE PART — les preuves, pas l'intuition :
--
--   1. DÉCISION HUMAINE du 2026-08-08 : le produit grand public a
--      **0 utilisateur** (« il y a 0 utilisateurs dessus donc on peut supprimer
--      tout ça »), et « Retirer les deux » sur attaque/potions a levé le
--      dernier verrou de cascade (R-CASCADE de 20260808060000). Les verdicts
--      « GARDÉE » de la veille sont RENVERSÉS par cette décision — leurs
--      commentaires partent avec les tables.
--
--   2. CODE RETIRÉ OU ÉTRANGLÉ D'ABORD, dans les commits qui précèdent :
--      - chaînes de génération : v2-plan-distribution, v2-intake-*,
--        v2-transformation-materialization, v2-phase1, v2-lab-context,
--        v2-week-activation — ZÉRO importeur, supprimées ;
--      - `getActiveTransformationRuntime` (v2-runtime) rend le runtime vide
--        qu'un élève KEEL a toujours reçu — l'UNIQUE point d'entrée du runtime
--        est étranglé, plus aucun consommateur ne touche la base ;
--      - la lane track du routeur sort par son chemin d'échec existant
--        (ceintures anti-commit-fantôme intactes) sans toucher la base ;
--      - momentum_state, momentum_v2, morning nudge, rendez-vous, pulse,
--        handoff, memorizer : lectures vidées ou entrées étranglées, datées ;
--      - export RGPD : motif recurring_meals (clés de bundle conservées,
--        vides, zéro sonde).
--
--   3. DONNÉES : 0 ligne dans les 21 tables en local (vérifié table par
--      table le 2026-08-08).
--
--   4. CRONS : `keel-week-rollover-v1` (rollover du plan V2 malgré son nom)
--      est déprogrammé ICI ; sa fonction edge est supprimée. Les 20 autres
--      jobs actifs ne touchent aucune de ces tables.
--
--   5. VUES : zéro définition ne les nomme. PROSRC : les 4 fonctions SQL qui
--      les nomment sont retirées ici même (2 fonctions de triggers portés par
--      les tables droppées, 1 RPC sans appelant, 1 stats admin sans appelant).
--
-- CE QUI N'EST **PAS** TOUCHÉ :
--   - `system_runtime_snapshots` (infrastructure du chat, GARDÉE) : ses
--     colonnes cycle_id/transformation_id RESTENT (des écrivains vivants les
--     posent, à null désormais, et l'historique les porte) — seules les deux
--     contraintes FK tombent.
--   - la chaîne 1:1 KEEL (`plan_versions`, `plan_commitments`, …), les tables
--     KEEL (`student_week_plans`, …), `planned_deviations`.
--
-- ORDRE — satellites puis enfants puis racines, RESTRICT partout : un
-- dépendant inattendu doit faire ÉCHOUER la migration.

begin;

-- ── 0. Le cron du rollover hebdo du plan V2 ─────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keel-week-rollover-v1') then
    perform cron.unschedule('keel-week-rollover-v1');
  end if;
end $$;

-- ── 1. system_runtime_snapshots garde ses colonnes, perd ses FK ─────────────
alter table public.system_runtime_snapshots
  drop constraint if exists system_runtime_snapshots_cycle_id_fkey,
  drop constraint if exists system_runtime_snapshots_transformation_id_fkey;

-- ── 2. Les satellites (zéro référence code sauf rendez-vous, étranglé) ──────
drop table public.user_level_tool_recommendation_events;
drop table public.user_level_tool_recommendations;
drop table public.user_plan_level_generation_events;
drop table public.user_plan_level_reviews;
drop table public.user_plan_review_requests;
drop table public.user_professional_support_events;
drop table public.user_professional_support_recommendations;
drop table public.user_inspiration_items;
drop table public.user_rendez_vous;
drop table public.user_transformation_aspects;
drop table public.user_transformation_closure_feedback;

-- ── 3. Le cœur, enfants d'abord ─────────────────────────────────────────────
-- (le premier passage a échoué en RESTRICT — exactement son rôle :
-- user_victory_ledger.plan_item_id pendait de user_plan_items, le ledger part
-- donc AVANT les items.)
drop table public.user_habit_week_reschedule_events;
drop table public.user_habit_week_occurrences;
drop table public.user_habit_week_plans;
drop table public.user_victory_ledger;
drop table public.user_plan_item_entries;
drop table public.user_plan_items;
drop table public.user_plans_v2;
drop table public.user_metrics;
-- FK CIRCULAIRE: user_cycles.active_transformation_id -> user_transformations
-- pendant que user_transformations.cycle_id -> user_cycles. La contrainte du
-- côté cycles tombe d'abord, sinon aucun des deux drops ne peut passer.
alter table public.user_cycles
  drop constraint if exists user_cycles_active_transformation_fk;
drop table public.user_transformations;
drop table public.user_cycles;

-- ── 4. Les fonctions SQL que prosrc a attrapées ─────────────────────────────
-- Les deux premières portaient les triggers des tables droppées (partis avec
-- elles) ; les deux autres n'ont AUCUN appelant dans le code (vérifié
-- commentaires exclus).
drop function if exists public.guard_v2_plan_item_activation();
drop function if exists public.archive_pending_week_plans_when_parent_plan_archived();
drop function if exists public.unlock_transformation_principle(p_user_id uuid, p_transformation_id uuid, p_principle text);
drop function if exists public.get_admin_user_stats(period_start timestamptz);

-- ── 5. Fail loud ────────────────────────────────────────────────────────────
do $$
declare
  leftover text;
begin
  select string_agg(t, ', ') into leftover
  from unnest(array[
    'user_plans_v2','user_plan_items','user_plan_item_entries',
    'user_habit_week_plans','user_habit_week_occurrences',
    'user_habit_week_reschedule_events','user_transformations','user_cycles',
    'user_victory_ledger','user_metrics','user_inspiration_items',
    'user_level_tool_recommendations','user_level_tool_recommendation_events',
    'user_plan_level_generation_events','user_plan_level_reviews',
    'user_plan_review_requests','user_professional_support_events',
    'user_professional_support_recommendations','user_rendez_vous',
    'user_transformation_aspects','user_transformation_closure_feedback'
  ]) as t
  where to_regclass('public.' || t) is not null;
  if leftover is not null then
    raise exception 'drop_plan_transformation_cascade: table(s) restante(s): %', leftover;
  end if;
  raise notice 'retrait-résidus: la cascade plan/transformation (21 tables) est partie';
end $$;

commit;
