-- ============================================================================
-- ARCHITECT MEMORY UNIFICATION
-- ============================================================================
-- - keep module/round-table ingestion routed through primary memories
-- - keep core identity as a slower derived layer
-- - preserve provenance on topic enrichment entries

alter table public.user_topic_enrichment_log
  add column if not exists metadata jsonb not null default '{}'::jsonb;

drop trigger if exists on_module_updated_identity on public.user_module_state_entries;
