create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  kind text not null check (kind in (
    'fact',
    'statement',
    'event',
    'action_observation'
  )),

  status text not null default 'candidate' check (status in (
    'candidate',
    'active',
    'superseded',
    'invalidated',
    'hidden_by_user',
    'deleted_by_user',
    'archived'
  )),

  content_text text not null,
  normalized_summary text,
  structured_data jsonb not null default '{}'::jsonb,

  domain_keys text[] not null default '{}',

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),
  importance_score numeric(3,2) not null default 0
    check (importance_score >= 0 and importance_score <= 1),

  sensitivity_level text not null default 'normal' check (sensitivity_level in (
    'normal',
    'sensitive',
    'safety'
  )),
  sensitivity_categories text[] not null default '{}',
  requires_user_initiated boolean not null default false,

  source_message_id uuid references public.chat_messages(id) on delete set null,
  source_scope text,
  source_hash text,

  observed_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  time_precision text,
  timezone text,
  valid_from timestamptz,
  valid_until timestamptz,

  canonical_key text,

  embedding vector(768),
  embedding_model text,

  superseded_by_item_id uuid references public.memory_items(id) on delete set null,

  extraction_run_id uuid,
  last_retrieved_at timestamptz,

  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_memory_items_event_has_start
    check (kind <> 'event' or event_start_at is not null),
  constraint chk_memory_items_event_end_after_start
    check (
      event_end_at is null
      or event_start_at is null
      or event_end_at >= event_start_at
    )
);

create index if not exists idx_memory_items_user_status_kind
  on public.memory_items (user_id, status, kind);

create index if not exists idx_memory_items_user_observed
  on public.memory_items (user_id, observed_at desc nulls last);

create index if not exists idx_memory_items_domain_keys
  on public.memory_items using gin (domain_keys);

create index if not exists idx_memory_items_sensitivity
  on public.memory_items (user_id, sensitivity_level);

create index if not exists idx_memory_items_canonical_key
  on public.memory_items (user_id, canonical_key)
  where canonical_key is not null;

create index if not exists idx_memory_items_embedding
  on public.memory_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.tg_memory_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_memory_items_set_updated_at on public.memory_items;
create trigger trg_memory_items_set_updated_at
  before update on public.memory_items
  for each row execute function public.tg_memory_items_set_updated_at();

alter table public.memory_items enable row level security;

grant all on table public.memory_items to authenticated;

drop policy if exists rls_memory_items_select_own on public.memory_items;
create policy rls_memory_items_select_own
  on public.memory_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_items_insert_own on public.memory_items;
create policy rls_memory_items_insert_own
  on public.memory_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_items_update_own on public.memory_items;
create policy rls_memory_items_update_own
  on public.memory_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
