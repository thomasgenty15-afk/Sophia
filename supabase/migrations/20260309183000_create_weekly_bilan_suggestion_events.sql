create table if not exists public.weekly_bilan_suggestion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  proposal_id text not null,
  recommendation text not null check (recommendation in ('activate', 'deactivate', 'swap')),
  primary_action_title text,
  decisions jsonb not null default '[]'::jsonb,
  outcome text not null check (outcome in ('accepted', 'rejected', 'applied', 'failed')),
  summary text,
  applied_changes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists weekly_bilan_suggestion_events_user_week_idx
  on public.weekly_bilan_suggestion_events (user_id, week_start, created_at desc);

alter table public.weekly_bilan_suggestion_events enable row level security;

drop policy if exists rls_weekly_bilan_suggestion_events_select_own on public.weekly_bilan_suggestion_events;
create policy rls_weekly_bilan_suggestion_events_select_own
  on public.weekly_bilan_suggestion_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_suggestion_events_insert_own on public.weekly_bilan_suggestion_events;
create policy rls_weekly_bilan_suggestion_events_insert_own
  on public.weekly_bilan_suggestion_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_suggestion_events_update_own on public.weekly_bilan_suggestion_events;
create policy rls_weekly_bilan_suggestion_events_update_own
  on public.weekly_bilan_suggestion_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_suggestion_events_delete_own on public.weekly_bilan_suggestion_events;
create policy rls_weekly_bilan_suggestion_events_delete_own
  on public.weekly_bilan_suggestion_events
  for delete
  to authenticated
  using (auth.uid() = user_id);
