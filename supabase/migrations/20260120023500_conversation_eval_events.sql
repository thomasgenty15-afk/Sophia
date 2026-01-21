-- Structured runtime trace for conversation eval runs.
-- This is NOT raw Supabase logs; it's an explicit "event stream" we control and can safely feed to the judge.

create table if not exists public.conversation_eval_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  eval_run_id uuid not null references public.conversation_eval_runs(id) on delete cascade,
  request_id text not null,

  source text not null, -- e.g. 'run-evals', 'router', 'gemini'
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  event text not null, -- e.g. 'dispatch', 'model_fallback', 'tool_call', 'edge_timeout'
  payload jsonb not null default '{}'::jsonb
);

create index if not exists conversation_eval_events_run_idx
  on public.conversation_eval_events (eval_run_id, created_at desc);

create index if not exists conversation_eval_events_request_idx
  on public.conversation_eval_events (request_id, created_at desc);

alter table public.conversation_eval_events enable row level security;

-- Admin-only visibility (same model as conversation_eval_runs)
drop policy if exists "conversation_eval_events_internal_admin_all" on public.conversation_eval_events;
create policy "conversation_eval_events_internal_admin_all"
on public.conversation_eval_events
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));


