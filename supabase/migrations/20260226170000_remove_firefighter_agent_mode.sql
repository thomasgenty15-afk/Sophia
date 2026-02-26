-- Remove firefighter mode from runtime data + enum definition.
-- 1) Remap historical rows using firefighter -> companion.
-- 2) Cleanup legacy firefighter temp-memory state.
-- 3) Recreate enum without firefighter and migrate dependent columns.

BEGIN;

UPDATE public.user_chat_states
SET current_mode = 'companion'
WHERE current_mode::text = 'firefighter';

UPDATE public.chat_messages
SET agent_used = 'companion'
WHERE agent_used::text = 'firefighter';

UPDATE public.conversation_eval_events
SET agent_used = 'companion'
WHERE agent_used::text = 'firefighter';

UPDATE public.user_chat_states
SET temp_memory = temp_memory - '__safety_firefighter_flow'
WHERE temp_memory ? '__safety_firefighter_flow';

ALTER TYPE public.chat_agent_mode RENAME TO chat_agent_mode_old;

CREATE TYPE public.chat_agent_mode AS ENUM (
  'dispatcher',
  'sentry',
  'investigator',
  'architect',
  'companion',
  'philosopher',
  'assistant',
  'librarian'
);

ALTER TABLE public.user_chat_states
  ALTER COLUMN current_mode
  TYPE public.chat_agent_mode
  USING current_mode::text::public.chat_agent_mode;

ALTER TABLE public.chat_messages
  ALTER COLUMN agent_used
  TYPE public.chat_agent_mode
  USING (
    CASE
      WHEN agent_used IS NULL THEN NULL
      ELSE agent_used::text::public.chat_agent_mode
    END
  );

ALTER TABLE public.conversation_eval_events
  ALTER COLUMN agent_used
  TYPE public.chat_agent_mode
  USING (
    CASE
      WHEN agent_used IS NULL THEN NULL
      ELSE agent_used::text::public.chat_agent_mode
    END
  );

DROP TYPE public.chat_agent_mode_old;

COMMIT;
