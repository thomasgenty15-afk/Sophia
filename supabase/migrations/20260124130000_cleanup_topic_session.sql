-- Migration: Clean up legacy topic_session → topic_exploration
-- This migration transforms all existing topic_session references in temp_memory
-- to the new topic_exploration type.

-- Transform topic_session → topic_exploration in supervisor.stack
UPDATE user_chat_states
SET temp_memory = jsonb_set(
  temp_memory,
  '{supervisor,stack}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE 
          WHEN elem->>'type' = 'topic_session' 
          THEN jsonb_set(elem, '{type}', '"topic_exploration"')
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
    WHERE elem->>'type' = 'topic_session'
  );

-- Transform topic_session → topic_exploration in global_machine.stack (alias)
UPDATE user_chat_states
SET temp_memory = jsonb_set(
  temp_memory,
  '{global_machine,stack}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE 
          WHEN elem->>'type' = 'topic_session' 
          THEN jsonb_set(elem, '{type}', '"topic_exploration"')
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
    WHERE elem->>'type' = 'topic_session'
  );


