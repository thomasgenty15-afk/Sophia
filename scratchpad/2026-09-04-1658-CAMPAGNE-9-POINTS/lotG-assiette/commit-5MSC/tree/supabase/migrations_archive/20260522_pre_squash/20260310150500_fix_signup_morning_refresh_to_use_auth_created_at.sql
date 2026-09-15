-- Fix the signup morning refresh seed job:
-- some environments do not have public.profiles.created_at.
-- Use auth.users.created_at as the source of truth for signup time.

alter table public.profiles
  add column if not exists morning_active_action_checkins_seeded_at timestamptz;

create index if not exists profiles_morning_active_action_seed_queue_idx
  on public.profiles (id)
  where morning_active_action_checkins_seeded_at is null;

create or replace function public.process_signup_morning_active_action_refreshes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  seeded_count integer := 0;
  anon_key text;
  internal_secret text;
  base_url text;
  r record;
begin
  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[process_signup_morning_active_action_refreshes] missing edge config; skipped';
    return 0;
  end if;

  for r in
    select p.id
    from public.profiles p
    join auth.users au
      on au.id = p.id
    where p.morning_active_action_checkins_seeded_at is null
      and au.created_at <= now() - interval '3 hours'
    order by au.created_at asc, p.id asc
    limit 200
  loop
    perform public.request_morning_active_action_checkins_refresh(r.id);

    update public.profiles
    set morning_active_action_checkins_seeded_at = now()
    where id = r.id
      and morning_active_action_checkins_seeded_at is null;

    seeded_count := seeded_count + 1;
  end loop;

  return seeded_count;
end;
$$;
