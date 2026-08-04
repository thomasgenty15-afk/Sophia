-- Recreate user_framework_entries for the V2 clarification exercises.
--
-- This table stored the rich content a user fills into a clarification "fiche"
-- (the guided framework fields). It was dropped during the V1 teardown
-- (20260504123000_drop_v1_product_surface.sql) but the V2 dashboard still reads
-- and writes it from ClarificationExerciseModal.tsx. Because the table was
-- missing, the modal's insert threw before onSaved()->completeItem() could run,
-- so clarification items could neither persist their content nor be marked done.
--
-- Schema mirrors the original V1 definition and the frontend UserFrameworkEntryRow
-- type, so no client changes are needed. plan_id has no FK on purpose: the old
-- FK pointed at public.user_plans (also dropped in the V1 teardown) and the modal
-- always writes plan_id = null.

create table if not exists public.user_framework_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid,
  action_id text not null,
  framework_title text not null,
  framework_type text not null,
  content jsonb not null default '{}'::jsonb,
  schema_snapshot jsonb,
  submission_id uuid,
  target_reps integer default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- History lookup in the modal filters by action_id, newest first.
create index if not exists framework_entries_action_created_idx
  on public.user_framework_entries (action_id, created_at desc);
create index if not exists framework_entries_user_type_idx
  on public.user_framework_entries (user_id, framework_type);
create index if not exists framework_entries_plan_action_idx
  on public.user_framework_entries (plan_id, action_id);
create index if not exists framework_entries_submission_idx
  on public.user_framework_entries (submission_id);

alter table public.user_framework_entries enable row level security;

drop policy if exists "Users can view their own framework entries" on public.user_framework_entries;
create policy "Users can view their own framework entries"
  on public.user_framework_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own framework entries" on public.user_framework_entries;
create policy "Users can insert their own framework entries"
  on public.user_framework_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own framework entries" on public.user_framework_entries;
create policy "Users can update their own framework entries"
  on public.user_framework_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own framework entries" on public.user_framework_entries;
create policy "Users can delete their own framework entries"
  on public.user_framework_entries for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_framework_entries to authenticated;
grant all on table public.user_framework_entries to service_role;
