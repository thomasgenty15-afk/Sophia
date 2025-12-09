-- Fix module archiving logic to prevent empty/duplicate archives
-- 1. Prevent archiving if content hasn't changed
-- 2. Prevent archiving empty content (optional, but good for cleanliness)
-- 3. Use the new table name (user_module_state_entries)

CREATE OR REPLACE FUNCTION public.handle_module_entry_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if content ACTUALLY changed
  -- We cast to text to compare JSONB content easily, or use standard operator
  IF NEW.content IS DISTINCT FROM OLD.content THEN
      
      -- Optional: Don't archive if the OLD content was empty/null (initial state)
      -- If you want to keep history from the very first draft, remove this check.
      -- But usually, archiving "empty" -> "draft 1" is useless.
      IF OLD.content IS NOT NULL AND OLD.content::text != '{}'::text AND OLD.content::text != '{"content": ""}' THEN
          
          INSERT INTO public.user_module_archives (
              entry_id, 
              user_id, 
              module_id, 
              content, 
              archived_at
          )
          VALUES (
              OLD.id, 
              OLD.user_id, 
              OLD.module_id, 
              OLD.content, 
              now()
          );
          
      END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger on the CORRECT table (user_module_state_entries)
DROP TRIGGER IF EXISTS on_module_entry_update ON public.user_module_state_entries;

CREATE TRIGGER on_module_entry_update
  AFTER UPDATE ON public.user_module_state_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_module_entry_archive();

