-- Trigger synthesizer immediately when a chat state crosses the new-message threshold.
-- This replaces the previous cron-based polling to avoid up-to-10-minute gaps.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'trigger-synthesizer-batch'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

create or replace function public.request_trigger_synthesizer_for_state(
  p_user_id uuid,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
  safe_scope text;
begin
  if p_user_id is null then
    return;
  end if;

  safe_scope := coalesce(nullif(trim(p_scope), ''), 'web');

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
    raise notice '[request_trigger_synthesizer_for_state] missing edge config; skipped dispatch for user % scope %', p_user_id, safe_scope;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/trigger-synthesizer-batch',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'scope', safe_scope,
      'reason', 'threshold_crossed'
    )
  );
end;
$$;

create or replace function public.handle_user_chat_state_synthesizer_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold int := 15;
  old_count int := 0;
  new_count int := 0;
begin
  old_count := coalesce(old.unprocessed_msg_count, 0);
  new_count := coalesce(new.unprocessed_msg_count, 0);

  if new.user_id is null then
    return new;
  end if;

  if new_count >= threshold and old_count < threshold then
    perform public.request_trigger_synthesizer_for_state(new.user_id, new.scope);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_chat_states_trigger_synthesizer_threshold on public.user_chat_states;
create trigger trg_user_chat_states_trigger_synthesizer_threshold
after update of unprocessed_msg_count on public.user_chat_states
for each row
when (new.unprocessed_msg_count is distinct from old.unprocessed_msg_count)
execute function public.handle_user_chat_state_synthesizer_threshold();
