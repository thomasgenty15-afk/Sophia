create table if not exists public.conversation_turn_traces (
  turn_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id text not null,
  ts timestamptz not null,
  safety_pregate jsonb not null,
  dispatcher_run jsonb not null,
  turn_frame jsonb not null,
  route_decision jsonb not null,
  direct_effects jsonb not null default '[]'::jsonb,
  skill_run jsonb,
  tool_skill_run jsonb,
  recommendation_tool_run jsonb,
  confirmation_token_outcomes jsonb not null default '[]'::jsonb,
  memory_write_candidates_emitted integer not null default 0,
  response_owner text not null,
  total_latency_ms integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_turn_traces_user_ts
  on public.conversation_turn_traces (user_id, ts desc);

alter table public.conversation_turn_traces enable row level security;

create policy "service role manages conversation traces"
on public.conversation_turn_traces
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
