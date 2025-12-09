-- Modify Forge progression to insert empty JSON content
-- This fixes the NOT NULL constraint violation on the 'content' column
-- when creating the next module placeholder.

CREATE OR REPLACE FUNCTION public.handle_forge_level_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_id int;
  card_id int;
  level_id int;
  next_module_id text;
  unlock_delay interval := '4 days'; -- Fixed delay between levels
BEGIN
  -- We ONLY proceed if the module is marked as COMPLETED
  -- and it wasn't completed before (or we want to ensure next step exists)
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
      
      -- Parsing module ID: format a{X}_c{Y}_m{Z}
      week_id := substring(NEW.module_id from 'a(\d+)_')::int;
      card_id := substring(NEW.module_id from '_c(\d+)_')::int;
      level_id := substring(NEW.module_id from '_m(\d+)')::int;

      -- Valid Forge module (Levels 1-4 trigger next level, 5 stops)
      IF week_id IS NOT NULL AND card_id IS NOT NULL AND level_id IS NOT NULL AND level_id < 5 THEN
          
          next_module_id := 'a' || week_id || '_c' || card_id || '_m' || (level_id + 1);

          -- Insert the NEXT module state
          INSERT INTO public.user_module_state_entries (
              user_id,
              module_id,
              status,
              available_at,
              updated_at,
              completed_at,
              content
          )
          VALUES (
              NEW.user_id,
              next_module_id,
              'available',
              NEW.completed_at + unlock_delay,
              now(),
              NULL,
              '{}'::jsonb -- FIX: Insert empty JSON object instead of NULL
          )
          ON CONFLICT (user_id, module_id) 
          DO NOTHING; 

      END IF;
  END IF;

  RETURN NEW;
END;
$$;

