create unique index if not exists uniq_memory_items_legacy_event_id
  on public.memory_items (user_id, ((metadata->>'legacy_event_id')))
  where kind = 'event'
    and metadata ? 'legacy_event_id';

insert into public.memory_items (
  user_id,
  kind,
  status,
  content_text,
  normalized_summary,
  domain_keys,
  confidence,
  importance_score,
  sensitivity_level,
  sensitivity_categories,
  requires_user_initiated,
  source_scope,
  source_hash,
  observed_at,
  event_start_at,
  event_end_at,
  time_precision,
  valid_until,
  embedding,
  embedding_model,
  metadata,
  created_at,
  updated_at
)
select
  ev.user_id,
  'event',
  case
    when ev.status in ('upcoming', 'active', 'recently_past') then 'active'
    else 'archived'
  end,
  left(
    trim(concat_ws(' - ', nullif(ev.title, ''), nullif(ev.summary, ''))),
    4000
  ),
  nullif(ev.summary, ''),
  '{}'::text[],
  least(1, greatest(0, coalesce(ev.confidence, 0.70)))::numeric(3,2),
  case
    when ev.status in ('upcoming', 'active', 'recently_past') then 0.60
    else 0.20
  end,
  'normal',
  '{}'::text[],
  false,
  'legacy_user_event_memories',
  'legacy_user_event_memories:' || ev.id::text,
  coalesce(ev.starts_at, ev.relevance_until, ev.created_at),
  coalesce(ev.starts_at, ev.relevance_until, ev.created_at),
  ev.ends_at,
  coalesce(nullif(ev.time_precision, ''), 'unknown'),
  ev.relevance_until,
  ev.event_embedding,
  'legacy_v1',
  coalesce(ev.metadata, '{}'::jsonb) || jsonb_build_object(
    'legacy_table', 'user_event_memories',
    'legacy_event_id', ev.id::text,
    'legacy_event_key', ev.event_key,
    'legacy_event_type', ev.event_type,
    'legacy_status', ev.status,
    'legacy_missing_starts_at', ev.starts_at is null
  ),
  ev.created_at,
  now()
from public.user_event_memories ev
where not exists (
  select 1
  from public.memory_items mi
  where mi.user_id = ev.user_id
    and mi.kind = 'event'
    and mi.metadata->>'legacy_event_id' = ev.id::text
);

insert into public.memory_item_sources (
  user_id,
  memory_item_id,
  source_type,
  source_id,
  source_created_at,
  source_scope,
  evidence_summary,
  confidence,
  metadata,
  created_at
)
select
  ev.user_id,
  mi.id,
  'system_signal',
  ev.id,
  ev.created_at,
  'legacy_user_event_memories',
  nullif(ev.summary, ''),
  least(1, greatest(0, coalesce(ev.confidence, 0.70)))::numeric(3,2),
  jsonb_build_object(
    'legacy_table', 'user_event_memories',
    'legacy_event_id', ev.id::text,
    'legacy_event_key', ev.event_key
  ),
  now()
from public.user_event_memories ev
join public.memory_items mi
  on mi.user_id = ev.user_id
  and mi.kind = 'event'
  and mi.metadata->>'legacy_event_id' = ev.id::text
where not exists (
  select 1
  from public.memory_item_sources src
  where src.memory_item_id = mi.id
    and src.source_type = 'system_signal'
    and src.source_id = ev.id
);
