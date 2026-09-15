-- Harden RLS policies on core user-owned tables (idempotent).
-- Goal: ensure every user-facing table is protected by RLS with "auth.uid() = user_id" semantics.
-- Notes:
-- - Policies are additive. We create narrowly-scoped policies with deterministic names.
-- - Service role (internal jobs) bypasses RLS; this is about user-facing (anon+JWT) access safety.

do $$
begin
  -- PROFILES (id = auth.uid())
  execute 'alter table public.profiles enable row level security';

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'rls_profiles_select_self'
  ) then
    execute 'create policy rls_profiles_select_self on public.profiles for select using (auth.uid() = id)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'rls_profiles_update_self'
  ) then
    execute 'create policy rls_profiles_update_self on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)';
  end if;

  -- Optional: allow self-insert (usually handled by trigger); safe if used.
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'rls_profiles_insert_self'
  ) then
    execute 'create policy rls_profiles_insert_self on public.profiles for insert with check (auth.uid() = id)';
  end if;
end $$;

-- Helper block generator for "user_id owned" tables.
do $$
declare
  t record;
begin
  for t in
    select unnest(array[
      'chat_messages',
      'memories',
      'user_week_states',
      'user_module_state_entries',
      'user_plans',
      'user_goals',
      'user_answers',
      'plan_feedbacks',
      'user_actions',
      'user_framework_entries',
      'user_framework_tracking',
      'user_round_table_entries',
      'user_vital_signs',
      'user_vital_sign_entries',
      'user_chat_states',
      'scheduled_checkins'
    ]) as tablename
  loop
    execute format('alter table public.%I enable row level security', t.tablename);

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename and policyname = format('rls_%s_select_own', t.tablename)
    ) then
      execute format('create policy %I on public.%I for select using (auth.uid() = user_id)',
        format('rls_%s_select_own', t.tablename), t.tablename);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename and policyname = format('rls_%s_insert_own', t.tablename)
    ) then
      execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)',
        format('rls_%s_insert_own', t.tablename), t.tablename);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename and policyname = format('rls_%s_update_own', t.tablename)
    ) then
      execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        format('rls_%s_update_own', t.tablename), t.tablename);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename and policyname = format('rls_%s_delete_own', t.tablename)
    ) then
      execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)',
        format('rls_%s_delete_own', t.tablename), t.tablename);
    end if;
  end loop;
end $$;


