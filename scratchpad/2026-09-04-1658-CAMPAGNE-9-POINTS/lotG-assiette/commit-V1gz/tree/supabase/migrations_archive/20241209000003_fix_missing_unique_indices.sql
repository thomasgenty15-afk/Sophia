-- Fix missing unique indices causing ON CONFLICT failure in triggers
-- This ensures that UPSERT operations (INSERT ... ON CONFLICT) work correctly

-- 1. Ensure unique index for module entries (answers & granular progress)
-- This fixes the "42P10: there is no unique or exclusion constraint" error
CREATE UNIQUE INDEX IF NOT EXISTS user_module_state_entries_user_module_idx 
ON public.user_module_state_entries (user_id, module_id);

-- 2. Ensure unique index for week states (unlocks)
-- Adding this just in case it's missing too, to prevent future errors
CREATE UNIQUE INDEX IF NOT EXISTS user_week_states_user_module_idx 
ON public.user_week_states (user_id, module_id);

