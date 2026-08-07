-- RETRAIT DES RÉSIDUS GRAND PUBLIC — ce qui est GARDÉ, et pourquoi.
--
-- Autorité : `docs/keel/RETRAIT-RESIDUS-GRAND-PUBLIC.md` (R6 : « Ce qui est
-- gardé exprès porte sa raison DANS LE DÉPÔT »), `docs/keel/MODEL.md`.
--
-- Cette migration ne supprime RIEN et ne modifie aucune donnée. Elle pose des
-- `comment on table` — et c'est son objet entier. Une table gardée sans raison
-- écrite sera re-proposée à la suppression dans six mois, ou supprimée à tort ;
-- le chantier de la carte de défense a montré qu'un inventaire seul ne suffit
-- pas à décider.
--
-- ── LES QUATRE RAISONS, ET CE QUI LES A ÉTABLIES ─────────────────────────────
--
-- [R-CASCADE]  `user_cycles` et `user_transformations` sont les racines d'une
--              cascade de ~25 tables. Deux de leurs enfants en `on delete
--              cascade` sont `user_attack_cards` et `user_potion_sessions`, que
--              le chantier interdit de toucher. Dropper la racine les viderait
--              sans erreur et sans bruit.
--
-- [R-CRON]     `process-checkins` (*/3 min) et `schedule-checkins-v2` (0 * * * *)
--              sont ACTIFS dans `cron.job` et traversent ces tables via
--              `momentum_state.ts`, `momentum_v2.ts`, `action_occurrences.ts`,
--              `weekly_progress_review.ts`, `checkin_scope.ts`.
--
-- [R-BRANCHE-FR] Arbitrage produit DÉJÀ RENDU, et marqué « à ne pas re-litiger » :
--              `docs/keel/BUILD_PLAN.md` arbitrage n°1 — « Les tables legacy
--              restent en base, vides pour les utilisateurs KEEL, VIVANTES POUR
--              LA BRANCHE FR. » Repris par
--              `20260803140000_pivot_drop_non_spine_legacy.sql` : « Les dropper
--              serait décider que la branche FR n'a plus d'utilisateurs — un
--              arbitrage produit, pas un nettoyage. »
--
-- [R-AUTRE-PROJET] Ce qui ne se prouve pas depuis ce dépôt. Le produit grand
--              public tourne encore, DEPUIS CE CODE, sur un autre projet
--              Supabase (`frontend/src/App.tsx:187`,
--              `dispatcher.prompts.ts:59`). La carte de défense n'a été
--              supprimée qu'après confirmation humaine explicite du 2026-08-07
--              sur ce point précis.
--
-- ── CE QUI A ÉTÉ RETIRÉ PAR AILLEURS, ET N'A PAS BESOIN DE MIGRATION ─────────
-- L'Architecte : ses trois tables étaient DÉJÀ droppées le 2026-08-03 par
-- `20260803140000`. Seul le code qui les lisait restait — parti dans le commit
-- « l'architecte s'en va ». `user_metric_entries` n'a jamais existé : ni en
-- base, ni dans une migration, alors qu'elle figurait à l'inventaire.

begin;

-- ── Colonne vertébrale B2C — plans d'action, transformations, cycles ─────────

comment on table public.user_cycles is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CASCADE: racine de ~25 tables, dont user_attack_cards et user_potion_sessions en ON DELETE CASCADE — la dropper les viderait. R-BRANCHE-FR: BUILD_PLAN arbitrage n°1, vivante pour la branche FR. Vide pour un élève KEEL: getActiveTransformationRuntime() court-circuite sans cycle actif, donc ZÉRO bloc de plan dans son prompt.';

comment on table public.user_transformations is
  'GARDÉE (retrait résidus grand public, 2026-08-08). Mêmes raisons que user_cycles: R-CASCADE (racine, enfants attack/potions) + R-BRANCHE-FR.';

comment on table public.user_plans_v2 is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-BRANCHE-FR. Porte le trigger trg_archive_pending_week_plans_on_plan_archive, qui archive les semaines d''habitudes en attente — le module TS qui doublonnait ce comportement (_shared/week_plan_lifecycle.ts) a été retiré, le trigger reste LA source.';

comment on table public.user_plan_items is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CRON + R-BRANCHE-FR. Le danger de la « projection concurrente » est DÉJÀ éteint: run.ts branche sur keelTurn.is_student (W4.7) — un élève KEEL reçoit le bloc KEEL, jamais celui-ci. Il n''y a pas deux blocs plan dans un prompt.';

comment on table public.user_plan_item_entries is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CRON + R-BRANCHE-FR. Enfant CASCADE de user_plan_items.';

comment on table public.user_victory_ledger is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CASCADE (enfant de user_cycles/user_transformations) + R-BRANCHE-FR.';

comment on table public.user_metrics is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CASCADE + R-BRANCHE-FR. Lue par getActiveTransformationRuntime() (progress_marker). À NE PAS confondre avec user_metric_entries, qui n''a jamais existé: ni table, ni migration — la lecture qui la visait a été retirée de momentum_state.ts.';

-- ── Habitudes — projection hebdomadaire des plan items ──────────────────────

comment on table public.user_habit_week_plans is
  'GARDÉE (retrait résidus grand public, 2026-08-08). R-CRON: process-checkins et schedule-checkins-v2 sont actifs et la lisent. R-CASCADE: enfant de user_plan_items. Coût prompt pour un élève KEEL: ZÉRO — le bloc currentWeekPlanContext qui la porte exige un plan V2 actif.';

comment on table public.user_habit_week_occurrences is
  'GARDÉE (retrait résidus grand public, 2026-08-08). Mêmes raisons que user_habit_week_plans. Lue aussi par _shared/off_schedule_credit.ts (crédit des complétions hors planning).';

comment on table public.user_habit_week_reschedule_events is
  'GARDÉE (retrait résidus grand public, 2026-08-08). Enfant CASCADE de user_habit_week_occurrences: part avec elle ou pas du tout.';

-- ── Rappels récurrents — verdict produit, et il penche vers garder ──────────

comment on table public.user_recurring_reminders is
  'GARDÉE (retrait résidus grand public, 2026-08-08). Le document d''autorité annonçait un verdict « produit, pas technique »: il est aussi technique, et il est net. 5 lectures dans la fonction edge dédiée classify-recurring-reminder, 8 dans process-checkins (cron actif */3 min), 2 dans le loader du chat. scheduled_checkins — infrastructure du chat, gardée — pointe ici (recurring_reminder_id). Le bloc de prompt « RAPPELS RÉCURRENTS CONFIGURÉS » (749 car., injecté sur mention explicite) porte des gardes acquises sur incident (BF-STATUS-01): il couvre son SEUL périmètre et interdit de répondre « aucun rappel » depuis cette section.';

-- ── Attaque et potions — INDÉCIDABLE SANS L'HUMAIN, ne pas trancher seul ────

comment on table public.user_attack_cards is
  'NE PAS SUPPRIMER SANS DÉCISION HUMAINE (retrait résidus grand public, 2026-08-08). Travail RÉCENT et NON DÉPLOYÉ: _shared/attack-keyword-support.ts (mots-clés d''attaque, E2E local vert, importé par sophia-brain/router/run.ts). Résidu ou chantier en pause? La question est produit. Tant qu''elle n''a pas de réponse, user_cycles et user_transformations ne peuvent pas être droppées non plus: cette table en est un enfant ON DELETE CASCADE.';

comment on table public.user_potion_sessions is
  'NE PAS SUPPRIMER SANS DÉCISION HUMAINE (retrait résidus grand public, 2026-08-08). Travail récent non déployé (sas d''admission des potions). Traverse 12+ modules dont run.ts, companion.ts, watcher.ts, checkin_scope.ts, response_visibility_formatting.ts. Enfant ON DELETE CASCADE de user_cycles/user_transformations: bloque leur suppression au même titre que user_attack_cards.';

-- ── Cartes KEEL (W8) — l'épreuve « autre projet » n'est pas franchissable ───

comment on table public.card_templates is
  'GARDÉE — épreuve non franchissable depuis ce dépôt (retrait résidus grand public, 2026-08-08). R-AUTRE-PROJET: frontend/src/App.tsx:187 dit que CardsPage.tsx, keel/api/cards.ts, keel-cards-v1, le cron keel-arm-cards et les quatre tables card_* restent EN PLACE parce que le produit grand public tourne depuis ce même code ailleurs. « Démonté, pas détruit. » La route /app/cards redirige vers /app/today et le cron keel-arm-cards est absent de cron.job, mais aucun des deux ne prouve ce qui tourne sur l''autre projet.';

comment on table public.student_cards is
  'GARDÉE — voir card_templates (R-AUTRE-PROJET). Exportée par account-export-v1 et couverte par keel_gdpr_lifecycle_test.ts: la retirer sans retirer sa branche d''export casserait l''export au moment exact où quelqu''un exerce un droit.';

comment on table public.card_armings is
  'GARDÉE — voir card_templates (R-AUTRE-PROJET). Enfant CASCADE de student_cards. Couverte par le lifecycle RGPD.';

comment on table public.card_wins is
  'GARDÉE — voir card_templates (R-AUTRE-PROJET). Enfant CASCADE de student_cards. Couverte par le lifecycle RGPD.';

-- ── Le piège nº1 du chantier ────────────────────────────────────────────────

comment on table public.planned_deviations is
  'GARDÉE — VIVANTE DANS KEEL, ce n''est pas un résidu (retrait résidus grand public, 2026-08-08). Trois lecteurs: evaluate-adherence-v1/index.ts:170, keel-cards-v1/index.ts:410, frontend/src/keel/pages/CoachStudentPage.tsx:224. Elle figurait à l''inventaire des tables « hors KEEL » et aurait été supprimée à tort: c''est le piège nº1 nommé par le document d''autorité. Exportée par account-export-v1.';

-- ── Fail loud ───────────────────────────────────────────────────────────────
-- Une migration qui pose des raisons doit échouer si une table qu'elle
-- prétend documenter n'existe pas: un commentaire posé sur rien est pire que
-- pas de commentaire, il fait croire que la question a été tranchée.

do $$
declare
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(array[
    'user_cycles','user_transformations','user_plans_v2','user_plan_items',
    'user_plan_item_entries','user_victory_ledger','user_metrics',
    'user_habit_week_plans','user_habit_week_occurrences',
    'user_habit_week_reschedule_events','user_recurring_reminders',
    'user_attack_cards','user_potion_sessions','card_templates',
    'student_cards','card_armings','card_wins','planned_deviations'
  ]) as t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'retrait-résidus: table(s) documentée(s) mais absente(s): %', missing;
  end if;

  raise notice 'retrait-résidus: 18 tables gardées portent désormais leur raison';
end $$;

commit;
