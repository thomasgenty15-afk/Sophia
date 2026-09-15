-- North Star: global metric across a transformation cycle (submission).

create table if not exists public.user_north_stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  title text not null,
  metric_type text not null default 'number'
    check (metric_type in ('number', 'scale_10', 'counter')),
  unit text not null default '',
  start_value numeric not null,
  target_value numeric not null,
  current_value numeric not null,
  history jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_north_stars_user_status_idx
  on public.user_north_stars (user_id, status, updated_at desc);

create index if not exists user_north_stars_submission_idx
  on public.user_north_stars (submission_id, updated_at desc);

-- At most one active north star per user+submission.
create unique index if not exists user_north_stars_one_active_per_submission
  on public.user_north_stars (user_id, submission_id)
  where status = 'active';

alter table public.user_north_stars enable row level security;

drop policy if exists rls_user_north_stars_select_own on public.user_north_stars;
create policy rls_user_north_stars_select_own
  on public.user_north_stars
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_north_stars_insert_own on public.user_north_stars;
create policy rls_user_north_stars_insert_own
  on public.user_north_stars
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_north_stars_update_own on public.user_north_stars;
create policy rls_user_north_stars_update_own
  on public.user_north_stars
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_north_stars_delete_own on public.user_north_stars;
create policy rls_user_north_stars_delete_own
  on public.user_north_stars
  for delete
  to authenticated
  using (auth.uid() = user_id);

alter table public.user_goals
  add column if not exists north_star_id uuid references public.user_north_stars(id) on delete set null;
