CREATE OR REPLACE FUNCTION match_all_action_entries(
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uae.id,
    uae.note,
    uae.status,
    uae.performed_at,
    ua.title as action_title,
    1 - (uae.embedding <=> query_embedding) AS similarity
  FROM user_action_entries uae
  JOIN user_actions ua ON uae.action_id = ua.id
  WHERE 1 - (uae.embedding <=> query_embedding) > match_threshold
  AND uae.user_id = auth.uid()
  ORDER BY uae.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

