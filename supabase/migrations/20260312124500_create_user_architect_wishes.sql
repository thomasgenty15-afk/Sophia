-- Architect wishlist / "voeux" storage.
-- Dedicated user-owned table for wishes shown in the Architect area.

create table if not exists public.user_architect_wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'experience'
    check (category in ('experience', 'achievement', 'growth', 'contribution')),
  status text not null default 'active'
    check (status in ('active', 'completed')),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_architect_wishes_title_nonempty check (
    char_length(btrim(title)) >= 1
    and char_length(btrim(title)) <= 160
  ),
  constraint user_architect_wishes_description_length check (
    char_length(description) <= 2000
  ),
  constraint user_architect_wishes_status_completed_consistency check (
    (status = 'active' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create index if not exists user_architect_wishes_user_status_created_idx
  on public.user_architect_wishes (user_id, status, created_at desc);

create index if not exists user_architect_wishes_user_category_created_idx
  on public.user_architect_wishes (user_id, category, created_at desc);

alter table public.user_architect_wishes enable row level security;

drop policy if exists rls_user_architect_wishes_select_own on public.user_architect_wishes;
create policy rls_user_architect_wishes_select_own
  on public.user_architect_wishes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_architect_wishes_insert_own on public.user_architect_wishes;
create policy rls_user_architect_wishes_insert_own
  on public.user_architect_wishes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_wishes_update_own on public.user_architect_wishes;
create policy rls_user_architect_wishes_update_own
  on public.user_architect_wishes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_wishes_delete_own on public.user_architect_wishes;
create policy rls_user_architect_wishes_delete_own
  on public.user_architect_wishes
  for delete
  to authenticated
  using (auth.uid() = user_id);
