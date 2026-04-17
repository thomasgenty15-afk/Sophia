-- Migration de sécurité finale
-- Force la création des index uniques requis par les triggers ON CONFLICT
-- S'exécute en dernier pour garantir l'intégrité du schéma

BEGIN;

-- 1. Index pour user_module_state_entries (Réponses & Progression Forge)
DROP INDEX IF EXISTS user_module_state_entries_user_module_idx;
CREATE UNIQUE INDEX user_module_state_entries_user_module_idx 
ON public.user_module_state_entries (user_id, module_id);

-- 2. Index pour user_week_states (Déverrouillage Semaines & Accès Global)
DROP INDEX IF EXISTS user_week_states_user_module_idx;
CREATE UNIQUE INDEX user_week_states_user_module_idx 
ON public.user_week_states (user_id, module_id);

COMMIT;

