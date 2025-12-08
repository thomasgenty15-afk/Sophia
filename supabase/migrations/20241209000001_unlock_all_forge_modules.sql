-- Migration to update the trigger logic
-- GOAL: When Week 12 is completed, unlock NOT JUST 'forge_level_2' but ALL 'forge_week_X' modules (1 to 12)
-- This ensures that the "IdentityEvolution" page (The Forge) has all its sub-modules accessible.

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
  days_until_sunday integer;
  week_start_date timestamptz;
  i integer;
BEGIN
  -- Extract week number from module_id (format: a1_c1_m1 -> 1)
  week_num := substring(NEW.module_id from '^a(\d+)')::integer;
  
  IF week_num IS NOT NULL THEN
    current_week_id := 'week_' || week_num;
    next_week_id := 'week_' || (week_num + 1);
    
    -- Check if we have a state for this week
    SELECT id, first_updated_at IS NULL, first_updated_at 
    INTO current_state_id, is_first_update, week_start_date
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
            
            week_start_date := now(); -- Capture for use below
            
            -- Schedule NEXT week (ONLY if not week 12)
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
        IF week_num = 1 THEN
            total_questions := 4;
        ELSE
            total_questions := 3;
        END IF;

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
            
            -- === SPECIAL CASE: END OF WEEK 12 (TEMPLE COMPLETED) ===
            IF week_num = 12 THEN
                -- 1. Unlock ROUND TABLE 1 (Next Sunday)
                days_until_sunday := 7 - EXTRACT(DOW FROM NOW())::int;
                IF days_until_sunday = 0 THEN days_until_sunday := 7; END IF;
                
                INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
                VALUES (
                    NEW.user_id,
                    'round_table_1',
                    'available',
                    CURRENT_DATE + (days_until_sunday || ' days')::interval + time '09:00:00'
                )
                ON CONFLICT (user_id, module_id) DO NOTHING;

                -- 2. Unlock FORGE MAIN LEVEL (forge_level_2)
                -- Calculated based on start of Week 12 + 7 days
                INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
                VALUES (
                    NEW.user_id,
                    'forge_level_2',
                    'available',
                    COALESCE(week_start_date, now()) + interval '7 days'
                )
                ON CONFLICT (user_id, module_id) DO NOTHING;

                -- 3. Unlock ALL 12 FORGE WEEKS (forge_week_1 to forge_week_12)
                -- Required for the SkillTree view to be accessible
                FOR i IN 1..12 LOOP
                    INSERT INTO public.user_week_states (user_id, module_id, status, available_at)
                    VALUES (
                        NEW.user_id,
                        'forge_week_' || i,
                        'available',
                        COALESCE(week_start_date, now()) + interval '7 days'
                    )
                    ON CONFLICT (user_id, module_id) DO NOTHING;
                END LOOP;

            END IF;
        END IF;

    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
