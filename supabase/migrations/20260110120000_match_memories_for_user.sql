-- Service-role scoped RAG RPCs.
-- Why: when Sophia is called from server-side contexts (e.g. WhatsApp webhook), we use a service_role client.
-- In that case `auth.uid()` is NULL, so the existing `match_memories` / `match_all_action_entries`
-- return no rows. These RPCs accept an explicit user id and are only executable by service_role.

CREATE OR REPLACE FUNCTION public.match_memories_for_user(
  target_user_id uuid,
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  filter_source_type text DEFAULT NULL,
  filter_type text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  content text,
  source_id text,
  source_type text,
  type text,
  similarity double precision,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.source_id,
    m.source_type,
    m.type,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.metadata
  FROM public.memories m
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (filter_source_type IS NULL OR m.source_type = filter_source_type)
    AND (filter_type IS NULL OR m.type = filter_type)
    AND m.user_id = target_user_id
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_memories_for_user(
  target_user_id uuid,
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  filter_source_type text,
  filter_type text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_memories_for_user(
  target_user_id uuid,
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  filter_source_type text,
  filter_type text
) TO service_role;


CREATE OR REPLACE FUNCTION public.match_all_action_entries_for_user(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  note text,
  status text,
  performed_at timestamptz,
  action_title text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    uae.id,
    uae.note,
    uae.status,
    uae.performed_at,
    ua.title AS action_title,
    1 - (uae.embedding <=> query_embedding) AS similarity
  FROM public.user_action_entries uae
  JOIN public.user_actions ua ON uae.action_id = ua.id
  WHERE 1 - (uae.embedding <=> query_embedding) > match_threshold
    AND uae.user_id = target_user_id
  ORDER BY uae.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_all_action_entries_for_user(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_all_action_entries_for_user(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int
) TO service_role;


