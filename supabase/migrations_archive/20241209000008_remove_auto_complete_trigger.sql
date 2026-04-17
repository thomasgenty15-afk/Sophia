-- Remove the auto-completion trigger and function entirely.
-- We want the frontend to be the sole source of truth for "completion".
-- If the frontend sends status='completed', it is completed.
-- If it sends status='available', it is not.
-- The database should not override this logic automatically.

DROP TRIGGER IF EXISTS on_module_entry_insert_completion ON public.user_module_state_entries;
DROP FUNCTION IF EXISTS public.auto_complete_module_entry();

