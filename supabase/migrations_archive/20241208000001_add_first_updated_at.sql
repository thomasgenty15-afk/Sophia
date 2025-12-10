-- 1. Add first_updated_at column to user_module_states
ALTER TABLE public.user_module_states 
ADD COLUMN IF NOT EXISTS first_updated_at timestamptz;

-- 2. Backfill existing data: assume created_at is the first interaction for existing records
UPDATE public.user_module_states 
SET first_updated_at = created_at 
WHERE first_updated_at IS NULL;

-- 3. Backfill MISSING next modules for existing states
-- For every user/module (week N), ensure week N+1 exists scheduled 7 days after first_updated_at
DO $$
DECLARE
  r RECORD;
  week_num integer;
  next_week_id text;
BEGIN
  FOR r IN SELECT * FROM public.user_module_states LOOP
    -- Extract week number
    week_num := substring(r.module_id from '^week_(\d+)')::integer;
    
    IF week_num IS NOT NULL AND week_num < 12 THEN
      next_week_id := 'week_' || (week_num + 1);
      
      -- Insert next week if not exists
      INSERT INTO public.user_module_states (user_id, module_id, status, available_at)
      VALUES (
        r.user_id, 
        next_week_id, 
        'available', 
        r.first_updated_at + interval '7 days'
      )
      ON CONFLICT (user_id, module_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 4. Create the function to handle unlocking FUTURE activity
CREATE OR REPLACE FUNCTION public.handle_module_activity_unlock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_num integer;
  current_week_id text;
  next_week_id text;
  current_state_id uuid;
  is_first_update boolean;
BEGIN
  -- Extract week number from module_id (format: a1_c1_m1 -> 1)
  week_num := substring(NEW.module_id from '^a(\d+)')::integer;
  
  IF week_num IS NOT NULL THEN
    current_week_id := 'week_' || week_num;
    next_week_id := 'week_' || (week_num + 1);
    
    -- Check if we have a state for this week
    SELECT id, first_updated_at IS NULL INTO current_state_id, is_first_update
    FROM public.user_module_states
    WHERE user_id = NEW.user_id AND module_id = current_week_id;
    
    -- If state exists
    IF current_state_id IS NOT NULL THEN
        -- Always update the 'updated_at'
        UPDATE public.user_module_states
        SET updated_at = now()
        WHERE id = current_state_id;
        
        -- If this is the first time we detect an update
        IF is_first_update THEN
            -- Set first_updated_at to NOW
            UPDATE public.user_module_states
            SET first_updated_at = now()
            WHERE id = current_state_id;
            
            -- Schedule NEXT week (if not week 12)
            IF week_num < 12 THEN
                INSERT INTO public.user_module_states (user_id, module_id, status, available_at)
                VALUES (
                    NEW.user_id, 
                    next_week_id, 
                    'available', 
                    now() + interval '7 days'
                )
                ON CONFLICT (user_id, module_id) DO NOTHING;
            END IF;
        END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. Create the trigger on user_module_entries
DROP TRIGGER IF EXISTS on_module_activity_unlock ON public.user_module_entries;
CREATE TRIGGER on_module_activity_unlock
  AFTER INSERT OR UPDATE ON public.user_module_entries
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_module_activity_unlock();
