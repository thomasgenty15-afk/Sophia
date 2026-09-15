-- DEPRECATED: brain traces are now stored canonically in conversation_eval_events (source='brain-trace').
-- This migration remains in the repo because it has already been applied on some environments.
-- A later migration drops this table (see 20260123201500_drop_brain_trace_events.sql).

create table if not exists public.brain_trace_events (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid null references public.conversation_eval_runs(id) on delete cascade,
  request_id text null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  level text not null default 'info',
  phase text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists brain_trace_events_eval_run_id_created_at_idx
  on public.brain_trace_events (eval_run_id, created_at);

create index if not exists brain_trace_events_request_id_idx
  on public.brain_trace_events (request_id);

create index if not exists brain_trace_events_created_at_idx
  on public.brain_trace_events (created_at);

alter table public.brain_trace_events enable row level security;






