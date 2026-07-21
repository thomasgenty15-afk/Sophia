-- Backfill current_reps depuis les entries (21/07/2026).
--
-- Bug: le chemin de validation « bilan du soir » (daily_action_review_v1,
-- whatsapp-webhook/handlers_pending.ts) écrivait l'entry et marquait
-- l'occurrence done, mais n'incrémentait jamais user_plan_items.current_reps —
-- contrairement à la coche dashboard et au track conversationnel. Les
-- utilisateurs validant surtout via le bilan voyaient leur carte à 0/target
-- (cas observé: habitude lever, 2 complétions réelles, affichage 0/5).
-- Le code est corrigé (planItemPatchForCompletedEntry appliqué au commit du
-- bilan); cette migration rattrape le stock.
--
-- Conservateur volontairement:
--  - ne touche que les items qui portent un compteur (current_reps non nul);
--  - ne fait que monter le compteur (jamais le baisser) vers le nombre réel
--    d'entries completed;
--  - ne change AUCUN statut (pas de bascule in_maintenance/completed en masse:
--    ces transitions restent aux chemins runtime).
update public.user_plan_items i
set
  current_reps = sub.completed_count,
  updated_at = now()
from (
  select plan_item_id, count(*)::int as completed_count
  from public.user_plan_item_entries
  where outcome = 'completed'
  group by plan_item_id
) sub
where sub.plan_item_id = i.id
  and i.current_reps is not null
  and sub.completed_count > i.current_reps;
