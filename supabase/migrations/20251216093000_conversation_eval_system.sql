-- Conversation evaluation + prompt override suggestion system (admin-only).
-- Goal:
-- - Run large batches of conversation scenarios.
-- - Store transcripts + detected issues.
-- - Generate prompt override suggestions.
-- - Human approves in UI, then apply safely.

-- 1) Internal admin allowlist (simple, explicit).
create table if not exists public.internal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.internal_admins enable row level security;

-- Users can check whether they are admin (read own row only).
drop policy if exists "internal_admins_read_self" on public.internal_admins;
create policy "internal_admins_read_self"
on public.internal_admins
for select
using (auth.uid() = user_id);

-- 2) Prompt overrides (append-only instructions injected into system prompts).
create table if not exists public.prompt_overrides (
  prompt_key text primary key,
  enabled boolean not null default true,
  addendum text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.prompt_overrides enable row level security;

drop policy if exists "prompt_overrides_internal_admin_all" on public.prompt_overrides;
create policy "prompt_overrides_internal_admin_all"
on public.prompt_overrides
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

-- Seed known keys (safe no-op if rerun).
insert into public.prompt_overrides (prompt_key, enabled, addendum)
values
  ('sophia.dispatcher', true, ''),
  ('sophia.investigator', true, ''),
  ('sophia.companion', true, ''),
  ('sophia.architect', true, ''),
  ('sophia.firefighter', true, ''),
  ('sophia.sentry', true, ''),
  ('sophia.watcher', true, ''),
  ('sophia.detect_future_events', true, '')
on conflict (prompt_key) do nothing;

-- 3) Eval runs
create table if not exists public.conversation_eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  dataset_key text not null,
  scenario_key text not null,
  status text not null default 'running'
    check (status in ('queued','running','completed','failed')),

  config jsonb not null default '{}'::jsonb,

  transcript jsonb not null default '[]'::jsonb,
  state_before jsonb,
  state_after jsonb,

  issues jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error text
);

alter table public.conversation_eval_runs enable row level security;

drop policy if exists "conversation_eval_runs_internal_admin_all" on public.conversation_eval_runs;
create policy "conversation_eval_runs_internal_admin_all"
on public.conversation_eval_runs
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

-- 4) Suggestions (separate table for review/approval)
create table if not exists public.prompt_override_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  eval_run_id uuid references public.conversation_eval_runs(id) on delete set null,

  prompt_key text not null,
  action text not null check (action in ('append','replace')),
  proposed_addendum text not null,
  rationale text,

  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),

  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,

  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  applied_result jsonb
);

alter table public.prompt_override_suggestions enable row level security;

drop policy if exists "prompt_override_suggestions_internal_admin_all" on public.prompt_override_suggestions;
create policy "prompt_override_suggestions_internal_admin_all"
on public.prompt_override_suggestions
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));


