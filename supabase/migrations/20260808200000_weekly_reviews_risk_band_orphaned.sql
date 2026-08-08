-- ============================================================================
-- L3 — `weekly_reviews.risk_band` EST ORPHELINE, ET ELLE RESTE. VOICI POURQUOI.
-- ============================================================================
--
-- Cette migration ne change AUCUNE donnée et AUCUN schéma. Elle pose un
-- commentaire — c'est-à-dire la seule chose qu'un `\d+ weekly_reviews` rendra
-- au prochain qui se demandera à quoi sert cette colonne.
--
-- ── CE QU'ELLE EST ──────────────────────────────────────────────────────────
-- `risk_band` appartient à l'ANCIENNE weekly review 1:1 — la même ligne portait
-- `student_narrative`, `coach_draft_reply`, `lapse_context`,
-- `top_failing_commitment_id`. Cette surface a été retirée avec le coaching
-- 1:1. La TABLE, elle, a survécu: le bilan alimentaire hebdo la réutilise.
-- Son écrivain (`_shared/keel/week_review_io.ts`) n'écrit QUE `week_facts`,
-- `week_facts_computed_at` et `content_locale`.
--
-- ── LES QUATRE ÉPREUVES D'ABSENCE, FAITES LE 2026-08-08 ─────────────────────
--   1. CODE    — chaque payload d'`insert`/`update` sur `weekly_reviews` a été
--                ouvert et lu (3 écrivains: `week_review_io.ts`,
--                `weekly_flow_io.ts`, et le repli de course de chacun). Aucun
--                ne porte `risk_band`. ⚠️ Un grep « `risk_band` sur la même
--                ligne qu'un `insert` » ne PEUT PAS voir une écriture qui passe
--                par un objet `payload`; c'est l'erreur qui avait faussé le
--                premier diagnostic, et elle est la raison de cette note.
--   2. PROSRC  — `select prosrc from pg_proc where prosrc ilike '%risk_band%'`
--                → 0 ligne. Aucun trigger non plus sur la table.
--   3. VUES    — aucune vue ni vue matérialisée ne projette la colonne, et
--                aucune ne lit `weekly_reviews`.
--   4. BASE    — 3 lignes non-NULL sur 4 en local, toutes des comptes de QA
--                (`@keeltest.dev`, `@test.dev`). Aucune ligne de production.
--
-- ── POURQUOI ON NE LA DROPPE PAS ────────────────────────────────────────────
--   · DEUX ÉCRANS ÉLÈVE LA SÉLECTIONNENT ENCORE — `StudentProgressPage.tsx` et
--     `StudentWeekPlanPage.tsx`. Ils étaient hors du périmètre décidé pour L3.
--     Un `drop column` casserait leur requête PostgREST (42703) et changerait
--     un écran mort en écran EN PANNE. Une colonne orpheline est inoffensive;
--     un drop sous des lecteurs vivants ne l'est pas.
--   · La table est ÉCRITE EN CE MOMENT par un autre chantier (bilan hebdo).
--   · Le dépôt porte la cicatrice `renaming-a-table-needs-three-absence-proofs`:
--     on ne touche à la forme qu'après avoir prouvé l'absence de LECTEURS, pas
--     seulement d'écrivains. Ici les lecteurs existent encore.
--
-- ── SI QUELQU'UN VEUT LA REMPLIR UN JOUR ────────────────────────────────────
-- Ce serait la mauvaise direction. Le signal restrictif VIVANT de ce dépôt est
-- `contract_change_requests(reason_code='restriction_signal', status='open')`,
-- écrit par `escalateRestrictionSignal`. C'est lui que la synthèse coach
-- interroge, et c'est lui qu'il faut brancher — pas cette colonne.
-- ============================================================================

comment on column public.weekly_reviews.risk_band is
  'ORPHELINE (L3, 2026-08-08). Reliquat de la weekly review 1:1 retirée avec la '
  'surface coach 1:1. AUCUN écrivain: ni code, ni fonction Postgres, ni vue, ni '
  'valeur de production — épreuves d''absence refaites le 2026-08-08. Les gardes '
  'qui la lisaient (relance, point hebdo, tap quotidien, recommandation, '
  'synthèse coach, fiche élève) ont été retirées: elles rendaient false pour '
  '100 % des élèves. Deux écrans élève la sélectionnent encore, d''où le '
  'maintien de la colonne. NE PAS la remplir: le signal restrictif vivant est '
  'contract_change_requests(reason_code=''restriction_signal'', status=''open'').';
