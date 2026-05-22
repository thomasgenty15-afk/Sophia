create table if not exists public.memory_item_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,

  source_type text not null check (source_type in (
    'chat_message',
    'action_occurrence',
    'plan_item',
    'scheduled_checkin',
    'skill_run',
    'weekly_review',
    'manual_correction',
    'system_signal'
  )),
  source_id uuid,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  source_created_at timestamptz,
  source_scope text,

  evidence_quote text,
  evidence_summary text,
  extraction_run_id uuid,
  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_memory_item_sources
  on public.memory_item_sources (
    memory_item_id,
    source_type,
    source_id,
    source_message_id
  ) nulls not distinct;

create index if not exists idx_memory_item_sources_item
  on public.memory_item_sources (memory_item_id);

create index if not exists idx_memory_item_sources_user_source
  on public.memory_item_sources (user_id, source_type, source_id);

alter table public.memory_item_sources enable row level security;

grant all on table public.memory_item_sources to authenticated;

drop policy if exists rls_memory_item_sources_select_own on public.memory_item_sources;
create policy rls_memory_item_sources_select_own
  on public.memory_item_sources
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_item_sources_insert_own on public.memory_item_sources;
create policy rls_memory_item_sources_insert_own
  on public.memory_item_sources
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_item_sources_update_own on public.memory_item_sources;
create policy rls_memory_item_sources_update_own
  on public.memory_item_sources
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
