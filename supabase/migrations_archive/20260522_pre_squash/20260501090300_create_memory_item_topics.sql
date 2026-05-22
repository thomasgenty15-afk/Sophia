create table if not exists public.memory_item_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  topic_id uuid not null references public.user_topic_memories(id) on delete cascade,

  relation_type text not null default 'about' check (relation_type in (
    'about',
    'supports',
    'mentioned_with',
    'blocks',
    'helps'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  observed_count integer not null default 1,

  status text not null default 'active' check (status in (
    'active',
    'retracted'
  )),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (memory_item_id, topic_id, relation_type)
);

create index if not exists idx_memory_item_topics_topic
  on public.memory_item_topics (user_id, topic_id, status);

create index if not exists idx_memory_item_topics_item
  on public.memory_item_topics (memory_item_id);

alter table public.memory_item_topics enable row level security;

grant all on table public.memory_item_topics to authenticated;

drop policy if exists rls_memory_item_topics_select_own on public.memory_item_topics;
create policy rls_memory_item_topics_select_own
  on public.memory_item_topics
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_item_topics_insert_own on public.memory_item_topics;
create policy rls_memory_item_topics_insert_own
  on public.memory_item_topics
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_item_topics_update_own on public.memory_item_topics;
create policy rls_memory_item_topics_update_own
  on public.memory_item_topics
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
