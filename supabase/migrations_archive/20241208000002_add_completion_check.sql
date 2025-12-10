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
        FROM public.user_module_entries
        WHERE user_id = NEW.user_id 
        AND module_id LIKE 'a' || week_num || '_c%_m1';

        -- If all answered, mark as completed
        IF answered_questions >= total_questions THEN
            UPDATE public.user_module_states
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

