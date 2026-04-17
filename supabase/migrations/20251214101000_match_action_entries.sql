CREATE OR REPLACE FUNCTION match_action_entries(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_action_id uuid
)
RETURNS TABLE (
  id uuid,
  note text,
  status text,
  performed_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    user_action_entries.id,
    user_action_entries.note,
    user_action_entries.status,
    user_action_entries.performed_at,
    1 - (user_action_entries.embedding <=> query_embedding) AS similarity
  FROM user_action_entries
  WHERE 1 - (user_action_entries.embedding <=> query_embedding) > match_threshold
  AND user_action_entries.action_id = filter_action_id
  AND user_action_entries.user_id = auth.uid()
  ORDER BY user_action_entries.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

