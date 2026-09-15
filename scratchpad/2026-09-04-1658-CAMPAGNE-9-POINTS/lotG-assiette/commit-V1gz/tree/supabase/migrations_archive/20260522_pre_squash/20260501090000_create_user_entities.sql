create table if not exists public.user_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  entity_type text not null check (entity_type in (
    'person',
    'organization',
    'place',
    'project',
    'object',
    'group',
    'other'
  )),

  display_name text not null,
  aliases text[] not null default '{}',
  normalized_key text,

  relation_to_user text,
  description text,

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  sensitivity_level text not null default 'normal' check (sensitivity_level in (
    'normal',
    'sensitive',
    'safety'
  )),

  status text not null default 'active' check (status in (
    'active',
    'merged',
    'archived',
    'hidden_by_user',
    'deleted_by_user'
  )),

  merged_into_entity_id uuid references public.user_entities(id) on delete set null,

  embedding vector(768),
  embedding_model text,

  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_entities_user_type_status
  on public.user_entities (user_id, entity_type, status);

create index if not exists idx_user_entities_aliases
  on public.user_entities using gin (aliases);

create index if not exists idx_user_entities_normalized_key
  on public.user_entities (user_id, normalized_key)
  where normalized_key is not null;

create index if not exists idx_user_entities_embedding
  on public.user_entities using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

alter table public.user_entities enable row level security;

grant all on table public.user_entities to authenticated;

drop policy if exists rls_user_entities_select_own on public.user_entities;
create policy rls_user_entities_select_own
  on public.user_entities
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_entities_insert_own on public.user_entities;
create policy rls_user_entities_insert_own
  on public.user_entities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_entities_update_own on public.user_entities;
create policy rls_user_entities_update_own
  on public.user_entities
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
