-- Optional: Turn Summary Logs table for direct DB querying
-- This is NOT required for basic logging (console.log is always available).
-- Enable by setting TURN_SUMMARY_DB_ENABLED=1 in your environment.

create table if not exists public.turn_summary_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  request_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp')),
  scope text not null,

  -- Latencies
  latency_total_ms int,
  latency_dispatcher_ms int,
  latency_context_ms int,
  latency_agent_ms int,

  -- Dispatcher info
  dispatcher_model text,
  dispatcher_safety text,
  dispatcher_intent text,
  dispatcher_intent_conf real,
  dispatcher_interrupt text,
  dispatcher_topic_depth text,
  dispatcher_flow_resolution text,

  -- Context info
  context_profile text,
  context_elements text[],
  context_tokens int,

  -- Routing info
  target_dispatcher text,
  target_initial text,
  target_final text,
  risk_score int,

  -- Agent info
  agent_model text,
  agent_outcome text,
  agent_tool text,

  -- State flags
  checkup_active boolean,
  toolflow_active boolean,
  supervisor_stack_top text,

  -- Abort info
  aborted boolean default false,
  abort_reason text
);

-- Indexes for common queries
create index if not exists turn_summary_logs_user_idx
  on public.turn_summary_logs (user_id, created_at desc);

create index if not exists turn_summary_logs_request_idx
  on public.turn_summary_logs (request_id);

create index if not exists turn_summary_logs_created_at_idx
  on public.turn_summary_logs (created_at desc);

-- RLS: Admin-only visibility
alter table public.turn_summary_logs enable row level security;

drop policy if exists "turn_summary_logs_internal_admin_all" on public.turn_summary_logs;
create policy "turn_summary_logs_internal_admin_all"
on public.turn_summary_logs
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

-- Auto-cleanup: Delete logs older than 7 days (optional cron job)
-- Run this manually or via pg_cron:
-- SELECT cron.schedule('cleanup-turn-summary-logs', '0 3 * * *', $$DELETE FROM public.turn_summary_logs WHERE created_at < now() - interval '7 days'$$);

comment on table public.turn_summary_logs is 'Optional per-turn debugging logs. Enable via TURN_SUMMARY_DB_ENABLED=1. Auto-deleted after 7 days.';

