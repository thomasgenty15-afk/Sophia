-- Migration: Transform topic_exploration → topic_serious / topic_light
-- This migration transforms all existing topic_exploration sessions into
-- either topic_serious or topic_light based on their owner_mode:
-- - owner_mode = 'architect' → topic_serious
-- - owner_mode = 'companion' (or any other) → topic_light

-- Transform topic_exploration → topic_serious/topic_light in supervisor.stack
UPDATE user_chat_states
SET temp_memory = jsonb_set(
  temp_memory,
  '{supervisor,stack}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE 
          WHEN elem->>'type' = 'topic_exploration' AND elem->>'owner_mode' = 'architect'
          THEN jsonb_set(elem, '{type}', '"topic_serious"')
          WHEN elem->>'type' = 'topic_exploration'
          THEN jsonb_set(elem, '{type}', '"topic_light"')
          ELSE elem
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(temp_memory->'supervisor'->'stack') AS elem
  )
)
WHERE temp_memory->'supervisor'->'stack' IS NOT NULL
  AND jsonb_typeof(temp_memory->'supervisor'->'stack') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(temp_memory->'supervisor'->'stack') AS elem
    WHERE elem->>'type' = 'topic_exploration'
  );

-- Transform topic_exploration → topic_serious/topic_light in global_machine.stack (alias)
UPDATE user_chat_states
SET temp_memory = jsonb_set(
  temp_memory,
  '{global_machine,stack}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE 
          WHEN elem->>'type' = 'topic_exploration' AND elem->>'owner_mode' = 'architect'
          THEN jsonb_set(elem, '{type}', '"topic_serious"')
          WHEN elem->>'type' = 'topic_exploration'
          THEN jsonb_set(elem, '{type}', '"topic_light"')
          ELSE elem
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(temp_memory->'global_machine'->'stack') AS elem
  )
)
WHERE temp_memory->'global_machine'->'stack' IS NOT NULL
  AND jsonb_typeof(temp_memory->'global_machine'->'stack') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(temp_memory->'global_machine'->'stack') AS elem
    WHERE elem->>'type' = 'topic_exploration'
  );






