create table if not exists public.weekly_bilan_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  execution jsonb not null default '{}'::jsonb,
  etoile_polaire jsonb not null default '{}'::jsonb,
  action_load jsonb not null default '{}'::jsonb,
  decisions_next_week text[] not null default '{}',
  coach_note text,
  raw_summary text,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_bilan_recaps_user_week
  on public.weekly_bilan_recaps (user_id, week_start);

create index if not exists weekly_bilan_recaps_user_created_idx
  on public.weekly_bilan_recaps (user_id, created_at desc);

alter table public.weekly_bilan_recaps enable row level security;

drop policy if exists rls_weekly_bilan_recaps_select_own on public.weekly_bilan_recaps;
create policy rls_weekly_bilan_recaps_select_own
  on public.weekly_bilan_recaps
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_recaps_insert_own on public.weekly_bilan_recaps;
create policy rls_weekly_bilan_recaps_insert_own
  on public.weekly_bilan_recaps
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_recaps_update_own on public.weekly_bilan_recaps;
create policy rls_weekly_bilan_recaps_update_own
  on public.weekly_bilan_recaps
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_weekly_bilan_recaps_delete_own on public.weekly_bilan_recaps;
create policy rls_weekly_bilan_recaps_delete_own
  on public.weekly_bilan_recaps
  for delete
  to authenticated
  using (auth.uid() = user_id);
