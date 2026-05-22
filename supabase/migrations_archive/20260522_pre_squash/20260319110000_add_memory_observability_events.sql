create table if not exists public.memory_observability_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  request_id text,
  turn_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text check (channel in ('web', 'whatsapp')),
  scope text,
  source_component text not null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists memory_observability_events_user_idx
  on public.memory_observability_events (user_id, created_at desc);

create index if not exists memory_observability_events_request_idx
  on public.memory_observability_events (request_id);

create index if not exists memory_observability_events_event_idx
  on public.memory_observability_events (event_name, created_at desc);

alter table public.memory_observability_events enable row level security;

drop policy if exists "memory_observability_events_internal_admin_all" on public.memory_observability_events;
create policy "memory_observability_events_internal_admin_all"
on public.memory_observability_events
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

comment on table public.memory_observability_events is
  'Detailed append-only memory/debug ledger. Enable writes with MEMORY_OBSERVABILITY_ON=1.';
