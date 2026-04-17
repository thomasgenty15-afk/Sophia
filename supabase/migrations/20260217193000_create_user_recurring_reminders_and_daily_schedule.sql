-- Recurring reminders configured by users (dashboard "Rappels").
-- These rows are templates that get expanded daily into public.scheduled_checkins.
-- "Delete" is implemented as status='inactive' to keep history.

create table if not exists public.user_recurring_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_instruction text not null,
  rationale text null,
  local_time_hhmm text not null
    check (local_time_hhmm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  scheduled_days text[] not null
    check (
      cardinality(scheduled_days) >= 1
      and cardinality(scheduled_days) <= 7
      and scheduled_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
    ),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  deactivated_at timestamptz null,
  last_drafted_at timestamptz null,
  last_draft_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_recurring_reminders_user_status_idx
  on public.user_recurring_reminders (user_id, status, updated_at desc);

create index if not exists user_recurring_reminders_active_idx
  on public.user_recurring_reminders (status, created_at desc);

alter table public.user_recurring_reminders enable row level security;

drop policy if exists rls_user_recurring_reminders_select_own on public.user_recurring_reminders;
create policy rls_user_recurring_reminders_select_own
  on public.user_recurring_reminders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_recurring_reminders_insert_own on public.user_recurring_reminders;
create policy rls_user_recurring_reminders_insert_own
  on public.user_recurring_reminders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_recurring_reminders_update_own on public.user_recurring_reminders;
create policy rls_user_recurring_reminders_update_own
  on public.user_recurring_reminders
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Important: no delete policy on purpose (soft-delete = set status='inactive').
drop policy if exists rls_user_recurring_reminders_delete_own on public.user_recurring_reminders;

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'schedule-recurring-checkins' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Run every day at 00:00 UTC.
-- Function computes "tomorrow" in each user's timezone.
select cron.schedule(
  'schedule-recurring-checkins',
  '0 0 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), 'https://ybyqxwnwjvuxckolsddn.supabase.co') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/schedule-recurring-checkins',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);


