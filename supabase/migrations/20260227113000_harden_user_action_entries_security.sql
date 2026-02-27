-- Harden user_action_entries security:
-- 1) Fix UPDATE policy gap (missing WITH CHECK).
-- 2) Enforce action ownership consistency (action_id must belong to same user_id).
-- 3) Apply write-gating parity with other user-owned tables.
-- 4) Add DB-level anti-dup for missed entries per action/day (race-safe).

do $$
begin
  if to_regclass('public.user_action_entries') is null then
    return;
  end if;

  execute 'alter table public.user_action_entries enable row level security';

  -- Ownership consistency at DB level (covers even service-role writes).
  if to_regclass('public.user_actions') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'user_actions_id_user_id_unique'
        and conrelid = 'public.user_actions'::regclass
    ) then
      execute 'alter table public.user_actions add constraint user_actions_id_user_id_unique unique (id, user_id)';
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'user_action_entries_action_user_fk'
        and conrelid = 'public.user_action_entries'::regclass
    ) then
      execute $sql$
        alter table public.user_action_entries
          add constraint user_action_entries_action_user_fk
          foreign key (action_id, user_id)
          references public.user_actions (id, user_id)
          on delete cascade
          not valid
      $sql$;
    end if;
  end if;

  -- Replace legacy/permissive policies with strict, deterministic ones.
  execute 'drop policy if exists "Users can view their own entries" on public.user_action_entries';
  execute 'drop policy if exists "Users can insert their own entries" on public.user_action_entries';
  execute 'drop policy if exists "Users can update their own entries" on public.user_action_entries';
  execute 'drop policy if exists "Users can delete their own entries" on public.user_action_entries';
  execute 'drop policy if exists rls_user_action_entries_select_own on public.user_action_entries';
  execute 'drop policy if exists rls_user_action_entries_insert_own on public.user_action_entries';
  execute 'drop policy if exists rls_user_action_entries_update_own on public.user_action_entries';
  execute 'drop policy if exists rls_user_action_entries_delete_own on public.user_action_entries';

  execute $sql$
    create policy rls_user_action_entries_select_own
      on public.user_action_entries
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_action_entries_insert_own
      on public.user_action_entries
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1
          from public.user_actions ua
          where ua.id = action_id
            and ua.user_id = auth.uid()
        )
      )
  $sql$;

  execute $sql$
    create policy rls_user_action_entries_update_own
      on public.user_action_entries
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1
          from public.user_actions ua
          where ua.id = action_id
            and ua.user_id = auth.uid()
        )
      )
  $sql$;

  execute $sql$
    create policy rls_user_action_entries_delete_own
      on public.user_action_entries
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
end $$;

-- Best-effort cleanup before adding uniqueness (keeps most recent missed entry/day).
with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, action_id, ((performed_at at time zone 'UTC')::date)
      order by performed_at desc, created_at desc, id desc
    ) as rn
  from public.user_action_entries
  where status = 'missed'
)
delete from public.user_action_entries uae
using ranked r
where uae.ctid = r.ctid
  and r.rn > 1;

-- Race-safe anti-dup for missed entries.
create unique index if not exists user_action_entries_missed_per_day_uniq
  on public.user_action_entries (user_id, action_id, ((performed_at at time zone 'UTC')::date))
  where status = 'missed';
