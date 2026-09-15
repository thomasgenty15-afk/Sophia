DO $$
BEGIN
  -- Add enum value if it doesn't already exist.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'chat_agent_mode'
      AND e.enumlabel = 'librarian'
  ) THEN
    ALTER TYPE public.chat_agent_mode ADD VALUE 'librarian';
  END IF;
END
$$;


