create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'schedule-morning-active-action-checkins',
      'schedule-whatsapp-v2-checkins'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'schedule-whatsapp-v2-checkins',
  '5 0 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), 'https://ybyqxwnwjvuxckolsddn.supabase.co') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/schedule-whatsapp-v2-checkins',
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

create or replace function public.request_morning_active_action_checkins_refresh(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
begin
  if p_user_id is null then
    return;
  end if;

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
    raise notice '[request_morning_active_action_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-whatsapp-v2-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', true
    )
  );
end;
$$;
