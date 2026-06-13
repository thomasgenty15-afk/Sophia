create table if not exists public.llm_raw_response_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  source text,
  provider text not null,
  model text not null,
  attempt integer,
  chain_index integer,
  status text not null,
  http_status integer,
  provider_request_id text,
  json_mode boolean not null default false,
  tool_choice text,
  has_tools boolean not null default false,
  outcome text,
  output_text text,
  output_tool_name text,
  output_tool_args jsonb,
  raw_response jsonb,
  raw_response_truncated boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.llm_raw_response_events is
  'Raw LLM provider responses captured only when SOPHIA_LLM_RAW_TRACE_ENABLED=1. Intended for QA/debug of dispatcher and visible-agent outputs.';

create index if not exists llm_raw_response_events_request_idx
  on public.llm_raw_response_events (request_id, created_at desc);

create index if not exists llm_raw_response_events_user_idx
  on public.llm_raw_response_events (user_id, created_at desc);

create index if not exists llm_raw_response_events_source_idx
  on public.llm_raw_response_events (source, created_at desc);

create index if not exists llm_raw_response_events_created_idx
  on public.llm_raw_response_events (created_at desc);

alter table public.llm_raw_response_events enable row level security;

drop policy if exists "llm_raw_response_events_internal_admin_all"
  on public.llm_raw_response_events;
create policy "llm_raw_response_events_internal_admin_all"
on public.llm_raw_response_events
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

drop policy if exists "service role manages llm raw response events"
  on public.llm_raw_response_events;
create policy "service role manages llm raw response events"
on public.llm_raw_response_events
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

grant select on table public.llm_raw_response_events to authenticated;
grant all on table public.llm_raw_response_events to service_role;
