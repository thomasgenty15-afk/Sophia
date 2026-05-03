create table if not exists public.memory_weekly_review_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iso_year integer not null,
  iso_week integer not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  attempt_count integer not null default 1,
  processed_message_count integer not null default 0,
  compacted_topic_count integer not null default 0,
  possible_pattern_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, iso_year, iso_week)
);

create index if not exists idx_memory_weekly_review_runs_user
  on public.memory_weekly_review_runs (user_id, iso_year desc, iso_week desc);

drop trigger if exists trg_memory_weekly_review_runs_updated_at on public.memory_weekly_review_runs;
create trigger trg_memory_weekly_review_runs_updated_at
  before update on public.memory_weekly_review_runs
  for each row execute function public.tg_set_updated_at();

alter table public.memory_weekly_review_runs enable row level security;

grant all on table public.memory_weekly_review_runs to authenticated;

drop policy if exists rls_memory_weekly_review_runs_select_own on public.memory_weekly_review_runs;
create policy rls_memory_weekly_review_runs_select_own
  on public.memory_weekly_review_runs
  for select
  to authenticated
  using (auth.uid() = user_id);
