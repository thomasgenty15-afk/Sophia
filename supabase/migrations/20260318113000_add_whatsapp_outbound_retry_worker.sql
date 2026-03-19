-- Enable WhatsApp outbound retry consumption in production.
--
-- Why:
-- - `whatsapp-send` already marks transient Graph/network failures as retryable
--   and stores `next_retry_at` in `whatsapp_outbound_messages`.
-- - But some environments never installed the SQL claim RPC nor the pg_cron job
--   that actually consumes those retries.
-- - Result: rows stay forever in `status='failed'` even though they are retryable.
--
-- Goal:
-- - Add a safe claim RPC with SKIP LOCKED semantics.
-- - Schedule the retry worker every minute.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

create or replace function public.claim_whatsapp_outbound_retries(
  p_limit integer default 20,
  p_worker_id text default 'worker'
)
returns setof public.whatsapp_outbound_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from public.whatsapp_outbound_messages
    where
      status = 'failed'
      and attempt_count < max_attempts
      and next_retry_at is not null
      and next_retry_at <= now()
      and (
        locked_at is null
        or locked_at < now() - interval '10 minutes'
      )
    order by next_retry_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
    for update skip locked
  )
  update public.whatsapp_outbound_messages m
  set
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where m.id in (select id from cte)
  returning m.*;
end;
$$;

grant execute on function public.claim_whatsapp_outbound_retries(integer, text) to service_role;

do $$
declare
  jid int;
begin
  for jid in
    select jobid
    from cron.job
    where jobname = 'process-whatsapp-outbound-retries'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'process-whatsapp-outbound-retries',
  '* * * * *',
  $$
  with cfg as (
    select
      coalesce(
        (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
        'https://ybyqxwnwjvuxckolsddn.supabase.co'
      ) as base_url,
      coalesce(
        (select value from public.app_config where key = 'edge_functions_anon_key' limit 1),
        ''
      ) as anon_key,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1),
        ''
      ) as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/process-whatsapp-outbound-retries',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := jsonb_build_object('limit', 20)
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);
