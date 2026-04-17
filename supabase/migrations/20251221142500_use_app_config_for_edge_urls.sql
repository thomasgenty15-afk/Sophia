-- Use public.app_config to avoid hardcoding environment-specific URLs in triggers/crons.
--
-- Required config rows (set per environment):
-- - key='edge_functions_base_url' value='https://<project-ref>.supabase.co'
-- Optional:
-- - key='subscribe_url' value='https://<your-app>/subscribe'

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

-----------------------------------------------------------------------------
-- 1) Welcome email trigger: build URL from app_config
-----------------------------------------------------------------------------
create or replace function public.handle_new_profile_welcome_email()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
begin
  -- Environment-specific base URL (set in public.app_config)
  select c.value into base_url
  from public.app_config c
  where c.key = 'edge_functions_base_url'
  limit 1;

  -- Fallback: keep staging value as a safety net (you can change it anytime in app_config).
  base_url := coalesce(base_url, 'https://iabxchanerdkczbxyjgg.supabase.co');
  url := base_url || '/functions/v1/send-welcome-email';

  begin
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
        ),
        body := jsonb_build_object(
          'record', row_to_json(new),
          'type', 'INSERT',
          'table', 'profiles'
        )
      );
  exception when others then
    -- Never block signup if network call fails.
    raise notice 'Erreur trigger welcome email: %', SQLERRM;
  end;

  return new;
end;
$$;

-----------------------------------------------------------------------------
-- 2) Retention cron: build URL from app_config
-----------------------------------------------------------------------------
do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'trigger-retention-emails' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-retention-emails',
  '0 9 * * *',
  $$
  with cfg as (
    select coalesce(
      (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
      'https://iabxchanerdkczbxyjgg.supabase.co'
    ) as base_url
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-retention-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);


