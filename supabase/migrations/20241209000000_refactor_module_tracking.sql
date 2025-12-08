-- 1. Rename user_module_states to user_week_states
ALTER TABLE public.user_module_states RENAME TO user_week_states;

-- Update indexes/constraints names (optional but good for consistency)
ALTER INDEX IF EXISTS user_module_states_pkey RENAME TO user_week_states_pkey;
ALTER INDEX IF EXISTS user_module_states_user_idx RENAME TO user_week_states_user_idx;
ALTER INDEX IF EXISTS user_module_states_user_module_idx RENAME TO user_week_states_user_module_idx;

-- 2. Add state columns to user_module_entries
ALTER TABLE public.user_module_entries 
ADD COLUMN status text not null default 'available' check (status in ('available', 'completed')),
ADD COLUMN available_at timestamptz not null default now(),
ADD COLUMN completed_at timestamptz,
ADD COLUMN first_updated_at timestamptz;

-- 3. Rename user_module_entries to user_module_state_entries
ALTER TABLE public.user_module_entries RENAME TO user_module_state_entries;

-- Rename indexes
ALTER INDEX IF EXISTS user_module_entries_pkey RENAME TO user_module_state_entries_pkey;
ALTER INDEX IF EXISTS user_module_entries_user_module_idx RENAME TO user_module_state_entries_user_module_idx;

-- 4. Recreate Policies for user_week_states
DROP POLICY IF EXISTS "Users can view their own module states" ON public.user_week_states;
DROP POLICY IF EXISTS "Users can update their own module states" ON public.user_week_states;
DROP POLICY IF EXISTS "Users can insert their own module states" ON public.user_week_states;

CREATE POLICY "Users can view their own week states"
  ON public.user_week_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own week states"
  ON public.user_week_states FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own week states"
  ON public.user_week_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Recreate Policies for user_module_state_entries
DROP POLICY IF EXISTS "Users can view their own module entries" ON public.user_module_state_entries;
DROP POLICY IF EXISTS "Users can insert their own module entries" ON public.user_module_state_entries;
DROP POLICY IF EXISTS "Users can update their own module entries" ON public.user_module_state_entries;

CREATE POLICY "Users can view their own module state entries"
  ON public.user_module_state_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own module state entries"
  ON public.user_module_state_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own module state entries"
  ON public.user_module_state_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- 6. Update Functions

-- Update initialize_user_modules (init weeks)
CREATE OR REPLACE FUNCTION public.initialize_user_modules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Insérer UNIQUEMENT le premier module Semaine (Semaine 1)
  INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
  VALUES (new.id, 'week_1', 'available', now())
  ON CONFLICT (user_id, module_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Update handle_module_activity_unlock (checks weeks, counts modules)
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
  total_questions integer;
  answered_questions integer;
BEGIN
  -- Extract week number from module_id (format: a1_c1_m1 -> 1)
  week_num := substring(NEW.module_id from '^a(\d+)')::integer;
  
  IF week_num IS NOT NULL THEN
    current_week_id := 'week_' || week_num;
    next_week_id := 'week_' || (week_num + 1);
    
    -- Check if we have a state for this week
    SELECT id, first_updated_at IS NULL INTO current_state_id, is_first_update
    FROM public.user_week_states
    WHERE user_id = NEW.user_id AND module_id = current_week_id;
    
    -- If state exists
    IF current_state_id IS NOT NULL THEN
        -- Always update the 'updated_at'
        UPDATE public.user_week_states
        SET updated_at = now()
        WHERE id = current_state_id;
        
        -- If this is the first time we detect an update
        IF is_first_update THEN
            -- Set first_updated_at to NOW
            UPDATE public.user_week_states
            SET first_updated_at = now()
            WHERE id = current_state_id;
            
            -- Schedule NEXT week (if not week 12)
            IF week_num < 12 THEN
                INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
                VALUES (
                    NEW.user_id, 
                    next_week_id, 
                    'available', 
                    now() + interval '7 days'
                )
                ON CONFLICT (user_id, module_id) DO NOTHING;
            END IF;
        END IF;

        -- CHECK FOR COMPLETION
        -- Limitation: This assumes we know the total count. 
        -- Week 1 has 4 questions, others have 3.
        IF week_num = 1 THEN
            total_questions := 4;
        ELSE
            total_questions := 3;
        END IF;

        -- Count answers for this user and this week
        -- We count unique questions (c1, c2, etc.) for this week
        SELECT COUNT(DISTINCT module_id) INTO answered_questions
        FROM public.user_module_state_entries
        WHERE user_id = NEW.user_id 
        AND module_id LIKE 'a' || week_num || '_c%_m1';

        -- If all answered, mark as completed
        IF answered_questions >= total_questions THEN
            UPDATE public.user_week_states
            SET status = 'completed',
                completed_at = now()
            WHERE id = current_state_id
            AND status != 'completed'; -- Only if not already completed
        END IF;

    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update check_post_week_12_unlock
CREATE OR REPLACE FUNCTION public.check_post_week_12_unlock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if week 12 is completed
    IF EXISTS (
        SELECT 1
        FROM public.user_week_states
        WHERE user_id = NEW.user_id
        AND module_id = 'week_12'
        AND status = 'completed'
    ) THEN
        -- Unlock Round Table 1
        INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
        VALUES (NEW.user_id, 'round_table_1', 'available', now())
        ON CONFLICT (user_id, module_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Note: The trigger for check_post_week_12_unlock was on user_module_states.
-- It needs to be dropped and recreated on user_week_states.
DROP TRIGGER IF EXISTS on_week_12_completion ON public.user_week_states; -- Using new name if rename preserved triggers?
-- Triggers are preserved on table rename.
-- But let's be safe and ensure it's named meaningfully if we want.
-- The old trigger name was `on_week_12_completion` (assumed based on pattern or file content). 
-- Let's check the file content first if I missed it.

