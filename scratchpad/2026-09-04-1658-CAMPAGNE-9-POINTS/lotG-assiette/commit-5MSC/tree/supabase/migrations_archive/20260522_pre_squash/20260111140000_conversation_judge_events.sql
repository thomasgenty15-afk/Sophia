-- Logs for judge/verifier decisions (without storing full user content).
-- Stores hashes + lengths + issues for observability and iteration.

CREATE TABLE IF NOT EXISTS public.conversation_judge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  scope text,
  channel text,
  agent_used public.chat_agent_mode,
  verifier_kind text NOT NULL, -- e.g. conversation|bilan|post_checkup|investigator
  request_id text,
  model text,
  ok boolean,
  rewritten boolean,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  mechanical_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_len integer,
  final_len integer,
  draft_hash text,
  final_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.conversation_judge_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own rows (web channel).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_judge_events'
      AND policyname = 'insert_own_judge_events'
  ) THEN
    CREATE POLICY insert_own_judge_events
      ON public.conversation_judge_events
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

-- By default, no SELECT policy for authenticated (keep it private).
-- service_role bypasses RLS.




