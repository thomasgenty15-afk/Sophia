alter table public.user_topic_memories
  add column if not exists lifecycle_stage text not null default 'candidate'
    check (lifecycle_stage in ('candidate', 'durable', 'dormant', 'archived')),
  add column if not exists search_doc text not null default '',
  add column if not exists search_doc_embedding vector(768),
  add column if not exists search_doc_version integer not null default 1,
  add column if not exists pending_changes_count integer not null default 0,
  add column if not exists last_compacted_at timestamptz,
  add column if not exists summary_version integer not null default 1,
  add column if not exists sensitivity_max text not null default 'normal'
    check (sensitivity_max in ('normal', 'sensitive', 'safety')),
  add column if not exists archived_reason text,
  add column if not exists merged_into_topic_id uuid references public.user_topic_memories(id) on delete set null;

-- Initial lifecycle mapping for V1 topics. "Recent" is intentionally broad
-- for MVP coexistence: any topic touched in the last 90 days stays durable.
update public.user_topic_memories
set lifecycle_stage = case
  when status = 'active'
    and coalesce(last_enriched_at, last_retrieved_at, updated_at, created_at, now())
      >= now() - interval '90 days'
    then 'durable'
  when status = 'active'
    then 'dormant'
  when status in ('archived', 'merged')
    then 'archived'
  else lifecycle_stage
end;

update public.user_topic_memories
set search_doc = left(trim(concat_ws(' ', title, synthesis)), 2000)
where search_doc = '';

create index if not exists idx_user_topic_memories_lifecycle
  on public.user_topic_memories (user_id, lifecycle_stage, status);

create index if not exists idx_user_topic_memories_search_embedding
  on public.user_topic_memories using hnsw (search_doc_embedding vector_cosine_ops)
  where search_doc_embedding is not null;
