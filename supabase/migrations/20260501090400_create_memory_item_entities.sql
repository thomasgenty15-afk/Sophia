create table if not exists public.memory_item_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  entity_id uuid not null references public.user_entities(id) on delete cascade,

  relation_type text not null default 'mentions' check (relation_type in (
    'mentions',
    'about'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (memory_item_id, entity_id, relation_type)
);

create index if not exists idx_memory_item_entities_entity
  on public.memory_item_entities (user_id, entity_id);

create index if not exists idx_memory_item_entities_item
  on public.memory_item_entities (memory_item_id);

alter table public.memory_item_entities enable row level security;

grant all on table public.memory_item_entities to authenticated;

drop policy if exists rls_memory_item_entities_select_own on public.memory_item_entities;
create policy rls_memory_item_entities_select_own
  on public.memory_item_entities
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_item_entities_insert_own on public.memory_item_entities;
create policy rls_memory_item_entities_insert_own
  on public.memory_item_entities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_item_entities_update_own on public.memory_item_entities;
create policy rls_memory_item_entities_update_own
  on public.memory_item_entities
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
