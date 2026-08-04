create table if not exists public.conversation_runtime_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id text not null,
  turn_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text check (channel is null or channel in ('web', 'whatsapp')),
  scope text,
  source text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  event text not null,
  phase text,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.conversation_runtime_events is
  'Append-only runtime event stream for real-user Sophia brain/routing traces. Enable brain writes with SOPHIA_BRAIN_TRACE_ENABLED=1.';

create index if not exists conversation_runtime_events_user_idx
  on public.conversation_runtime_events (user_id, created_at desc);

create index if not exists conversation_runtime_events_request_idx
  on public.conversation_runtime_events (request_id, created_at desc);

create index if not exists conversation_runtime_events_event_idx
  on public.conversation_runtime_events (event, created_at desc);

alter table public.conversation_runtime_events enable row level security;

drop policy if exists "conversation_runtime_events_internal_admin_all"
  on public.conversation_runtime_events;
create policy "conversation_runtime_events_internal_admin_all"
on public.conversation_runtime_events
using (
  exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = auth.uid()
  )
);

drop policy if exists "service role manages conversation runtime events"
  on public.conversation_runtime_events;
create policy "service role manages conversation runtime events"
on public.conversation_runtime_events
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace view public.conversation_runtime_audit_events as
select
  id::text as event_id,
  created_at,
  request_id,
  turn_id,
  user_id,
  channel,
  scope,
  'brain'::text as stream,
  source,
  level,
  event,
  phase,
  payload
from public.conversation_runtime_events
union all
select
  ('memory:' || id::text) as event_id,
  created_at,
  request_id,
  turn_id,
  user_id,
  channel,
  scope,
  'memory'::text as stream,
  source_component as source,
  'info'::text as level,
  event_name as event,
  null::text as phase,
  payload
from public.memory_observability_events;

comment on view public.conversation_runtime_audit_events is
  'Unified real-user audit stream. Brain events come from SOPHIA_BRAIN_TRACE_ENABLED=1; memory events come from MEMORY_OBSERVABILITY_ON=1.';

grant select on table public.conversation_runtime_events to authenticated;
grant all on table public.conversation_runtime_events to service_role;
grant usage, select on sequence public.conversation_runtime_events_id_seq
  to service_role;

grant select on table public.conversation_runtime_audit_events
  to authenticated;
grant select on table public.conversation_runtime_audit_events
  to service_role;
