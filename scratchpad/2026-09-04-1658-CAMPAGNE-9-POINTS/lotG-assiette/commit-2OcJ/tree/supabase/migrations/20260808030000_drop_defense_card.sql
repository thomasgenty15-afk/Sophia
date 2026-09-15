-- RETRAIT DE LA CARTE DE DÉFENSE — produit grand public, hors périmètre KEEL.
--
-- La carte de défense (pulsions dominantes, déclencheurs, réponses de défense)
-- est une surface de THÉRAPIE COMPORTEMENTALE du produit grand public. Elle n'a
-- aucun rôle dans KEEL (nutrition): ni le coach, ni l'élève, ni aucune des
-- boucles élève ne la lit ou ne l'écrit.
--
-- POURQUOI C'ÉTAIT MORT — les preuves, pas l'intuition:
--
--   1. Aucun cron ne l'alimente. Le seul producteur automatique était
--      `trigger-watcher-batch` (branche `detectDefenseCardNewTriggers`), que
--      `20260803030000_pivot_disable_b2c_crons.sql` a déprogrammé — motif
--      inscrit dans cette migration: « ancré sur les cartes et les
--      transformations, deux concepts supprimés volontairement par le pivot ».
--      Vérifié en local: `select ... from cron.job where command ilike
--      '%watcher%'` rend 0 ligne.
--
--   2. Le code était déjà à moitié débranché AVANT ce retrait. L'écriture des
--      victoires (`maybeLogDefenseCardWinParallel`, seul écrivain de
--      `user_defense_wins`) n'avait **aucun appelant**: la table ne pouvait
--      plus recevoir une seule ligne. Les modules de génération
--      (`v2-prompts/defense-card.ts`, `v2-defense-card-enrichment.ts`) et
--      d'export (`frontend/src/lib/exportDefenseCard.ts`) n'avaient eux non
--      plus aucun importeur. Aucune surface ne créait donc plus de carte.
--
--   3. L'écran est démonté depuis le pivot: `/app/cards` redirige vers
--      `/app/today` (voir `frontend/src/App.tsx`).
--
--   4. Confirmation humaine explicite (2026-08-07) sur le point qui ne se
--      prouve pas depuis ce dépôt: l'AUTRE projet Supabase, qui fait tourner le
--      produit grand public depuis ce même code, **n'utilise plus** la carte de
--      défense. Sans cette réponse, rien n'aurait été supprimé — c'est la
--      raison pour laquelle les tables `user_attack_cards` /
--      `user_support_cards` restent, elles, EN PLACE: `attack-keyword-support.ts`
--      lit encore `user_attack_cards`.
--
-- CE QUI N'EST **PAS** TOUCHÉ, et pourquoi (garde-fou anti-zèle):
--   - `user_attack_cards`, `user_support_cards`: famille voisine, encore lue.
--   - `normalize_cost_operation_family` (20260612133000): garde sa clause
--     `%defense-card%`. Cette fonction normalise à la LECTURE les lignes
--     `llm_usage` DÉJÀ enregistrées; retirer la clause reclasserait
--     rétroactivement l'historique de coût de `message_generation` vers
--     `other`. Une famille de coût orpheline est le prix correct à payer pour
--     un historique qui reste vrai.
--   - les tables KEEL `card_templates` / `student_cards` / `card_armings` /
--     `card_wins`: homonymes (`card_kind in ('defense','attack')`), sans aucun
--     lien avec les tables retirées ici.
--
-- ORDRE — la colonne étrangère d'abord, les tables ensuite. Les `drop table`
-- sont volontairement en RESTRICT (défaut, pas de `cascade`): si un objet
-- dépendait encore de ces tables, la migration DOIT échouer bruyamment plutôt
-- que d'emporter silencieusement ce qu'on n'avait pas mesuré. Dépendances
-- mesurées avant écriture: 2 FK entrantes (les deux traitées ci-dessous),
-- 0 vue, 0 trigger, 0 fonction SQL.

-- 1. La colonne étrangère de `user_plan_items` (emporte sa FK
--    `user_plan_items_defense_card_id_fkey`). `user_plan_items` appartient au
--    produit grand public et RESTE: seule la colonne part.
alter table public.user_plan_items
  drop column if exists defense_card_id;

-- 2. Les victoires (elles référencent les cartes: elles partent d'abord).
drop table if exists public.user_defense_wins;

-- 3. Les cartes.
drop table if exists public.user_defense_cards;
